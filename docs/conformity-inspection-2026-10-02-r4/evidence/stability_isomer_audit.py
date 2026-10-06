"""4차: 개발자가 공통 B에 적은 두 기준을 원문 데이터 전체에 적용해 본다 (읽기 전용).

1) 이성질체 수록 기준 '100 ns': 앱 들뜬 상태 2,099개의 반감기 분포와, 기준·표시 문턱별 상태 수·이성질체 표식 핵종 수
2) '안정' 4단계 기준(공통 B '안정 기준'의 NUBASE 판정 규칙을 그대로 구현):
     T = stbl → 붕괴 모드에 '?'가 있거나 하한(>)이 있으면 '관측적 안정', 아니면 '안정'
     T가 수치 + IS(존재비) → '원시 방사성'
     그 외 → '방사성'
   + 규칙의 정의('붕괴 모드 없음 = 에너지상 붕괴 불가')를 AME2020 질량으로 검산: '안정'으로 분류된 바닥상태 중
     α·β⁻·EC·2β⁻·2EC 중 하나라도 Q > 0(3σ)인 것
   + 앱 현재 표시(안정 검정 / 자연 방사성 띠)와 규칙 결과 대조
사용: python -B stability_isomer_audit.py <출력 json>
"""
import json
import math
import re
import sys
from collections import Counter, defaultdict

ROOT = "D:/000_rd_workspace/998_nuclide"
UNIT_S = {"ys": 1e-24, "zs": 1e-21, "as": 1e-18, "fs": 1e-15, "ps": 1e-12, "ns": 1e-9, "us": 1e-6, "ms": 1e-3, "s": 1,
          "m": 60, "h": 3600, "d": 86400, "y": 31556926, "ky": 31556926e3, "My": 31556926e6, "Gy": 31556926e9,
          "Ty": 31556926e12, "Py": 31556926e15, "Ey": 31556926e18, "Zy": 31556926e21, "Yy": 31556926e24}
ME_HE4 = 2424.91587  # keV, AME2020

states = []
for line in open(f"{ROOT}/data/raw/nubase_4.mas20.txt", encoding="latin-1"):
    if line.startswith("#") or len(line) < 20:
        continue
    l = line.rstrip("\n").ljust(209)
    a, z, i = int(l[0:3]), int(l[4:7]), int(l[7])
    if i >= 8:
        continue  # IAS: 앱 미수록
    states.append({"a": a, "z": z, "i": i, "name": l[11:16].strip() + l[16].strip(), "s": l[16].strip(),
                   "me": l[18:31].strip(), "dme": l[31:42].strip(), "exc": l[42:54].strip(),
                   "T": l[69:78].strip(), "U": l[78:80].strip(), "dT": l[81:88].strip(), "br": l[119:209].strip(),
                   "nonex": "non-exist" in l[18:54]})


def t_seconds(st):
    t = st["T"].lstrip("<>~").rstrip("#")
    return float(t) * UNIT_S[st["U"]] if re.fullmatch(r"[0-9.]+", t) and st["U"] in UNIT_S else None


# ---------- 1) 이성질체 기준 ----------
exc = [s for s in states if s["i"] > 0]
iso_cls = Counter()
by_letter = defaultdict(Counter)
for s in exc:
    if s["nonex"]:
        c = "비존재(non-exist)"
    elif s["T"] == "stbl":
        c = "안정(¹⁸⁰ᵐTa)"
    elif not s["T"]:
        c = "반감기 없음(한계만 있거나 빈칸)" if s["dT"] else "반감기 빈칸"
    elif s["T"].endswith("#"):
        c = "반감기 추정(#)"
    elif s["T"].startswith(("<", ">", "~")):
        c = "반감기 한계·근삿값"
    elif s["U"].endswith("eV"):
        c = "폭(eV)"
    else:
        ts = t_seconds(s)
        c = "측정 반감기 ≥ 100 ns" if ts is not None and ts >= 100e-9 else "측정 반감기 < 100 ns"
    s["iso_class"] = c
    iso_cls[c] += 1
    by_letter[s["s"]][c] += 1

thresholds = {"100 ns": 1e-7, "1 μs": 1e-6, "1 ms": 1e-3, "1 s": 1.0, "1 min": 60.0, "1 h": 3600.0}
nuclides_with_marker_now = {(s["z"], s["a"]) for s in exc if not s["nonex"]}
thr_rows = {}
for lab, sec in thresholds.items():
    keep = [s for s in exc if not s["nonex"] and (s["T"] == "stbl" or ((t_seconds(s) or 0) >= sec and not s["T"].startswith("<")))]
    thr_rows[lab] = {"states_kept": len(keep), "nuclides_with_marker": len({(s["z"], s["a"]) for s in keep})}
below = sorted([f"{s['name']} {s['T']} {s['U']}" for s in exc if s["iso_class"] == "측정 반감기 < 100 ns"])
lost_marker_100ns = sorted({f"{s['a']}{re.sub(r'[0-9]', '', s['name'])[:-1] if s['s'] else s['name']}"
                            for s in exc} - set())  # 아래에서 다시 계산
keep100 = {(s["z"], s["a"]) for s in exc if not s["nonex"] and (s["T"] == "stbl" or ((t_seconds(s) or 0) >= 1e-7 and not s["T"].startswith("<")))}
marker_lost = sorted(nuclides_with_marker_now - keep100)

# ---------- 2) 안정 4단계 ----------
gs_me = {}
for s in states:
    if s["i"] == 0 and not s["nonex"]:
        try:
            gs_me[(s["z"], s["a"])] = (float(s["me"].rstrip("#")), float(s["dme"].rstrip("#") or 0))
        except ValueError:
            pass


def q(z1, a1, z2, a2, extra=0.0):
    if (z1, a1) not in gs_me or (z2, a2) not in gs_me:
        return None
    (m1, u1), (m2, u2) = gs_me[(z1, a1)], gs_me[(z2, a2)]
    return m1 - m2 - extra, math.sqrt(u1 ** 2 + u2 ** 2)


def has_q_mark(br):
    return any(re.search(r"(^|\S)\s*\?$", t.strip()) and not re.search(r"=\s*\?$", t.strip()) for t in br.split(";") if t.strip() and not t.strip().startswith("IS"))


cls = Counter()
rows = []
for s in states:
    if s["nonex"]:
        continue
    has_is = "IS=" in s["br"]
    q_modes = [t.strip() for t in s["br"].split(";") if t.strip() and not t.strip().startswith("IS") and re.search(r"[^=]\s*\?$|^\S+\?$", t.strip()) and not re.search(r"=\s*\?$", t.strip())]
    eq_q = [t.strip() for t in s["br"].split(";") if re.search(r"=\s*\?$", t.strip())]
    lower = s["dT"].startswith(">")
    if s["T"] == "stbl":
        c = "관측적 안정" if (q_modes or lower) else "안정"
    elif t_seconds(s) is not None and not s["T"].endswith("#") and has_is:
        c = "원시 방사성"
    else:
        c = "방사성"
    cls[c] += 1
    rows.append({"state": s["name"], "z": s["z"], "a": s["a"], "i": s["i"], "class": c, "T": f"{s['T']} {s['U']} {s['dT']}".strip(),
                 "br": s["br"], "q_modes": q_modes, "eq_q_modes": eq_q})

# 정의 검산: '안정'인 바닥상태가 에너지상 붕괴 가능한가
energetic = []
for r in rows:
    if r["class"] != "안정" or r["i"] != 0:
        continue
    z, a = r["z"], r["a"]
    checks = {"α": q(z, a, z - 2, a - 4, ME_HE4), "β⁻": q(z, a, z + 1, a), "EC": q(z, a, z - 1, a),
              "2β⁻": q(z, a, z + 2, a), "2EC": q(z, a, z - 2, a)}
    pos = {k: round(v[0], 1) for k, v in checks.items() if v and v[0] - 3 * v[1] > 0}
    if pos:
        energetic.append({"state": r["state"], "positive_Q_keV": pos})

# 사용자 예시 확인
examples = {}
for nm in ("12C", "16O", "180Tam", "136Xe", "238U", "40K", "209Bi", "130Te", "128Te", "204Pb", "208Pb", "234U", "180Ta", "113Cd", "115In", "50V", "138La", "187Re"):
    r = next((x for x in rows if x["state"] == nm), None)
    if r:
        examples[nm] = {"class": r["class"], "T": r["T"], "br": r["br"]}

# 원시 방사성 목록 (자연존재비 + 수치 반감기)
primordial = sorted((r["state"], r["T"]) for r in rows if r["class"] == "원시 방사성")
stbl_with_eq_q = [r["state"] for r in rows if r["class"] in ("안정", "관측적 안정") and r["eq_q_modes"]]

# 앱 현재 표시와 대조 (바닥상태 기준 셀 색, 핵종 단위 자연 방사성 띠)
exp = json.load(open(f"{ROOT}/docs/conformity-inspection-2026-10-02/evidence/nuclides-export.json", encoding="utf-8"))["nuclides"]
app = {(r["z"], r["a"], r["level"]): r for r in exp}
band = defaultdict(bool)  # hydrate.ts:81 재현: 기저 상태가 안정이 아니고 어느 상태든 존재비가 있으면 띠
gs_stable = {}
for r in exp:
    if r["level"] == 0:
        gs_stable[(r["z"], r["a"])] = r["stable"]
for r in exp:
    if r["abundance_pct"] is not None:
        band[(r["z"], r["a"])] = True
confusion = Counter()
mismatch_examples = defaultdict(list)
for r in rows:
    if r["i"] != 0:
        continue
    k = (r["z"], r["a"])
    app_disp = "안정(검정)" if gs_stable.get(k) else ("붕괴색+띠" if band.get(k) else "붕괴색")
    confusion[(r["class"], app_disp)] += 1
    if (r["class"] == "원시 방사성") != (app_disp == "붕괴색+띠"):
        mismatch_examples[f"{r['class']} ↔ {app_disp}"].append(r["state"])

out = {
    "isomer_criterion": {"excited_states": len(exc), "classes": dict(iso_cls.most_common()),
                         "by_letter": {k: dict(v) for k, v in sorted(by_letter.items())},
                         "thresholds": thr_rows, "nuclides_with_marker_now": len(nuclides_with_marker_now),
                         "marker_lost_if_strict_100ns": [f"{a}-{z}" for z, a in marker_lost],
                         "measured_below_100ns": below},
    "stability_rule": {"counts": dict(cls), "ground_vs_app_display": {f"{a} | {b}": n for (a, b), n in sorted(confusion.items())},
                       "rule_vs_app_band_mismatch": {k: v for k, v in mismatch_examples.items()},
                       "stable_class_but_energetically_unstable_ground": energetic,
                       "primordial_class": primordial, "stable_or_obs_stable_with_eq_q": stbl_with_eq_q,
                       "examples": examples},
}
json.dump(out, open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps({"isomer": {k: out["isomer_criterion"][k] for k in ("classes", "thresholds", "nuclides_with_marker_now")},
                  "marker_lost_100ns": len(marker_lost),
                  "stability_counts": dict(cls), "ground_vs_app": out["stability_rule"]["ground_vs_app_display"],
                  "rule_vs_band_mismatch": {k: v[:12] for k, v in mismatch_examples.items()},
                  "stable_but_energetic": len(energetic), "primordial": primordial, "examples": examples}, ensure_ascii=False, indent=1))
