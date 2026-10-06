"""R3-5: 앱 이성질체(= NUBASE2020, R3-1에서 전수 일치 확인) 2,099개를 IAEA LiveChart `levels`(ENSDF)와 비교한다 (읽기 전용).

짝짓기
  - NUBASE 측정 에너지: 같은 핵종의 반감기 있는 준위 중 에너지 창 max(3·√(dE²+uE²), 1 keV, 0.2 %·E) 안에 있는 것.
    여러 개면 반감기가 가장 가까운(로그 비) 준위.
  - NUBASE 추정(#) 에너지: 에너지로는 짝짓지 않고 반감기가 3배 안인 준위 중 가장 가까운 것.
  - 에너지 창 안에 없으면, 반감기가 같은(5 % 또는 2σ) 준위가 다른 에너지에 있는지 따로 본다.
  - 짝지어진 참조 준위가 E = 0이면 '참조에서는 바닥상태'(바닥·이성질체 배정 차이)로 센다.
반감기 판정: |Δ| ≤ 2·√(u앱²+u참조²) 또는 양쪽 마지막 자리 반올림 안이면 일치. 한계·추정·폭은 따로.
불일치 분류: 참조 ENSDF cutoff > 2020-10-30 / NUBASE Table I의 T 갱신 코드·주석 유무와 인용 연도 / 근거 없음.
비율이 단위 환산 배수(10³, 60, 3600 …)나 ln 2에 가까우면 '단위 차이 의심'을 붙인다.
사용: python -B isomer_compare.py <앱 내보내기 json> <levels csv 폴더> <출력 json> [NUBASE2020 pdftotext -raw 텍스트]
"""
import csv
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime

ROOT = "D:/000_rd_workspace/998_nuclide"
exp_path, lv_dir, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
pdf_txt = sys.argv[4] if len(sys.argv) > 4 else None
NUBASE_CUTOFF = date(2020, 10, 30)
UNIT_S = {"ys": 1e-24, "zs": 1e-21, "as": 1e-18, "fs": 1e-15, "ps": 1e-12, "ns": 1e-9, "us": 1e-6, "ms": 1e-3, "s": 1,
          "m": 60, "h": 3600, "d": 86400, "y": 31556926, "ky": 31556926e3, "My": 31556926e6, "Gy": 31556926e9,
          "Ty": 31556926e12, "Py": 31556926e15, "Ey": 31556926e18}
UNIT_FACTORS = {"10³": 1e3, "10⁶": 1e6, "60 (min↔s)": 60, "3600 (h↔s)": 3600, "24 (d↔h)": 24, "365.24 (y↔d)": 365.2422, "1/ln2": 1 / math.log(2)}
NSR = r"\d\d[A-Z][A-Za-z][0-9A-Z.]{2,3}|AHW|GAU|HWJ|FGK\w*|MMC|SAR|WGM|Mirror|Imme"
KEYYEAR = re.compile(r"\b(\d\d)[A-Z][A-Za-z][0-9A-Z.]{2}\b")


def f(s):
    try:
        return float(str(s).strip().rstrip("#"))
    except (TypeError, ValueError):
        return None


def half_digit(s):
    s = str(s).strip().rstrip("#")
    dec = len(s.split(".")[1]) if "." in s else 0
    return 0.5 * 10 ** (-dec)


def parse_cut(s):
    s = re.sub(r"-SEPT-", "-SEP-", (s or "").strip(), flags=re.I)
    for fmt in ("%d-%b-%Y", "%Y-%m-%d", "%d-%B-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def yy(k):
    y = int(k)
    return 2000 + y if y <= 21 else 1900 + y


# NUBASE 원문 이성질체 (+ 같은 핵종의 모든 상태 반감기: 다른 상태의 준위를 잘못 짝짓지 않기 위해)
raw, states_T = {}, defaultdict(list)
for line in open(f"{ROOT}/data/raw/nubase_4.mas20.txt", encoding="latin-1"):
    if line.startswith("#") or len(line) < 20:
        continue
    l = line.rstrip("\n").ljust(209)
    a, z, i = int(l[0:3]), int(l[4:7]), int(l[7])
    if i >= 8:
        continue
    t, u, dt = l[69:78].strip().rstrip("#"), l[78:80].strip(), l[81:88].strip().rstrip("#")
    if re.fullmatch(r"[0-9.]+", t) and u in UNIT_S:
        states_T[(z, a - z)].append((i, float(t) * UNIT_S[u], (float(dt) if re.fullmatch(r"[0-9.]+", dt) else 0.0) * UNIT_S[u]))
    if i > 0:
        raw[(z, a - z, i)] = {"name": l[11:16].strip() + l[16].strip(), "a": a, "exc": l[42:54].strip(), "dE": l[54:65].strip(),
                              "T": l[69:78].strip(), "U": l[78:80].strip(), "dT": l[81:88].strip(), "nonex": "non-exist" in l[18:54]}


def t_close(t1, u1, t2, u2):
    return abs(t1 - t2) <= max(0.2 * max(t1, t2), 2 * math.sqrt(u1 ** 2 + u2 ** 2))

# NUBASE2020 Table I: 이성질체 행의 참조 키·갱신 코드, 주석 (이름을 원문과 정확히 맞춘다)
iso_ref, iso_cm = {}, defaultdict(list)
if pdf_txt:
    names = {rw["name"] for rw in raw.values()}
    for ln in open(pdf_txt, encoding="utf-8", errors="replace").read().splitlines():
        m = re.match(r"^(\d{1,3}[A-Z][a-z]?[mnpqrx])\s+(.*)$", ln)
        if not m or m.group(1) not in names:
            continue
        cm = re.match(r"^([METJDI]{1,3})\s*:\s?(.*)$", m.group(2))
        if cm:
            iso_cm[(m.group(1), cm.group(1))].append(cm.group(2))
            continue
        rf = re.search(rf"\s({NSR})\s+([METJDI]{{1,4}})\s+\d{{4}}\b", " " + m.group(2))
        if rf and m.group(1) not in iso_ref:
            iso_ref[m.group(1)] = (rf.group(1), rf.group(2))

app = [r for r in json.load(open(exp_path, encoding="utf-8"))["nuclides"] if r["is_isomer"]]


def load_levels(a, sym):
    p = os.path.join(lv_dir, f"{a}{sym.lower()}_levels.csv")
    if not os.path.exists(p):
        return None
    rows = list(csv.reader(open(p, encoding="utf-8-sig")))
    if not rows or "energy" not in rows[0]:
        return "no-data"  # API는 준위 자료가 없으면 본문 '0'만 돌려준다 (예: 32K)
    h = rows[0]
    idx = {k: h.index(k) for k in ("energy", "unc_e", "energy_shift", "half_life", "operator_hl", "unit_hl", "half_life_sec", "jp")}
    unc_cols = [k for k, c in enumerate(h) if c == "unc_hl"]  # 첫째: ENSDF식, 둘째: 초 환산(대칭화)
    cut_col = next((k for k, c in enumerate(h) if c.lower().replace("_", "").startswith("ensdfpublication")), None)
    out = []
    for r in rows[1:]:
        if len(r) < len(h):
            continue
        out.append({"E": f(r[idx["energy"]]), "uE": f(r[idx["unc_e"]]) or 0.0, "shift": r[idx["energy_shift"]].strip(),
                    "T": r[idx["half_life"]].strip(), "op": r[idx["operator_hl"]].strip(), "unit": r[idx["unit_hl"]].strip(),
                    "Ts": f(r[idx["half_life_sec"]]), "uTs": f(r[unc_cols[1]]) if len(unc_cols) > 1 else None,
                    "uT_ensdf": r[unc_cols[0]].strip() if unc_cols else "", "jp": r[idx["jp"]].strip(),
                    "cut": parse_cut(r[cut_col]) if cut_col is not None else None})
    return out


def unit_flag(ratio):
    """단위 환산 배수는 ±15 %, ln 2(τ↔T½)는 ±3 % 안일 때만 표시 (±15 %면 평가 차이까지 걸린다)"""
    for label, fac in UNIT_FACTORS.items():
        tol = 0.03 if label == "1/ln2" else 0.15
        for v in (fac, 1 / fac):
            if abs(ratio / v - 1) <= tol:
                return label
    return None


res, cats = [], Counter()
for r in app:
    rw = raw.get((r["z"], r["n"], r["level"]))
    rec = {"state": r["id"], "nubase_name": rw["name"] if rw else None, "app_exc": r["exc_kev"], "app_T": r["half_life_display"]}

    def done(cat):
        rec["category"] = cat
        cats[cat] += 1
        res.append(rec)

    if rw is None or rw["nonex"]:
        done("비존재(non-exist) — 비교 제외")
        continue
    lv = load_levels(r["a"], r["symbol"])
    if lv is None:
        done("참조 파일 없음")
        continue
    if lv == "no-data":
        done("참조에 이 핵종의 준위 자료 없음")
        continue
    ex, dE, est_e = f(rw["exc"]), f(rw["dE"]) or 0.0, rw["exc"].endswith("#")
    rec.update(app_exc_est=est_e, app_T_raw=f"{rw['T']} {rw['U']} {rw['dT']}".strip())
    Tnum = re.fullmatch(r"[0-9.]+#?", rw["T"] or "") and rw["U"] in UNIT_S
    ts_app = float(rw["T"].rstrip("#")) * UNIT_S[rw["U"]] if Tnum else None
    ut = (f(rw["dT"]) or 0.0) * UNIT_S[rw["U"]] if Tnum and re.fullmatch(r"[0-9.]+#?", rw["dT"] or "") else 0.0
    others = [(s, u) for i2, s, u in states_T[(r["z"], r["n"])] if i2 != r["level"]]

    def belongs_elsewhere(x):
        """이 참조 준위의 반감기가 같은 핵종의 다른 NUBASE 상태와 맞고, 이 상태와는 맞지 않으면 다른 상태의 준위다"""
        mine = ts_app is not None and t_close(ts_app, ut, x["Ts"], x["uTs"] or 0)
        return (not mine) and any(t_close(s, u, x["Ts"], x["uTs"] or 0) for s, u in others)

    cand = [x for x in lv if x["T"] and x["E"] is not None and x["Ts"] and not belongs_elsewhere(x)]

    def logr(x):
        return abs(math.log10(ts_app / x["Ts"])) if ts_app and x["Ts"] else 99

    if ex is None:
        done("앱 여기 에너지 없음")
        continue
    if est_e:
        pool = [x for x in cand if logr(x) < math.log10(3)]
        best = min(pool, key=logr) if pool else None
        rec["matched_by"] = "반감기 (앱 에너지 추정#)"
    else:
        # 바닥상태 준위(E=0)는 에너지로 짝짓지 않는다
        win = [x for x in cand if x["E"] > 0 and abs(x["E"] - ex) <= max(3 * math.sqrt(dE ** 2 + x["uE"] ** 2), 1.0, 0.002 * ex)]
        best = min(win, key=lambda x: (logr(x), abs(x["E"] - ex))) if win else None
        rec["matched_by"] = "에너지"
        # 에너지로 짝지었는데 반감기가 100배 넘게 다르고, 같은 반감기 준위가 따로 있으면 그쪽이 같은 상태다
        if best and ts_app is not None and logr(best) > 2 and any(t_close(ts_app, ut, x["Ts"], x["uTs"] or 0) for x in cand):
            best = None
        elif best and ts_app is not None and logr(best) > 2:
            rec["pairing_doubtful"] = True
    if not best:
        same_T = [x for x in cand if ts_app and t_close(ts_app, ut, x["Ts"], x["uTs"] or 0) and abs(ts_app - x["Ts"]) <= 0.05 * ts_app + 2 * math.sqrt(ut ** 2 + (x["uTs"] or 0) ** 2)]
        if same_T and not est_e:
            rec["same_T_level"] = {"E": same_T[0]["E"], "T": f"{same_T[0]['T']} {same_T[0]['unit']}"}
            done("참조에서는 바닥상태 (배정 차이)" if same_T[0]["E"] == 0 else "에너지 차이 — 같은 반감기 준위가 다른 에너지에 있음")
        elif any(x["shift"] for x in lv if x["T"]):
            done("참조 준위 기준 미상(+X 등)")
        elif est_e:
            done("대응 준위 없음 (앱 에너지 추정#)")
        else:
            done("대응 준위 없음")
        continue
    rec["matched"] = {"E": best["E"], "uE": best["uE"], "T": f"{best['op']}{best['T']} {best['unit']} {best['uT_ensdf']}".strip(),
                      "jp": best["jp"], "ensdf_cutoff": best["cut"].isoformat() if best["cut"] else None}
    T = rw["T"]
    if best["E"] == 0:
        done("참조에서는 바닥상태 (배정 차이)")
        continue
    if not T or T in ("stbl", "p-unst"):
        done("앱 반감기 없음·안정")
        continue
    if T.endswith("#"):
        done("앱 반감기 추정(#)")
        continue
    if re.match(r"^[<>~]", T) or re.match(r"^[<>~]", rw["dT"] or "") or best["op"]:
        done("한계값 포함 — 수치 비교 제외")
        continue
    if best["unit"].lower().endswith("ev") or not ts_app:
        done("참조 반감기 수치 없음·폭")
        continue
    ul = best["uTs"] or 0.0
    rnd = half_digit(T) * UNIT_S[rw["U"]] + (half_digit(best["T"]) * best["Ts"] / f(best["T"]) if f(best["T"]) else 0)
    d = abs(ts_app - best["Ts"])
    rec["T_ratio_app_over_ref"] = round(ts_app / best["Ts"], 6)
    rec["T_z"] = round(d / math.sqrt(ut ** 2 + ul ** 2), 2) if (ut or ul) else None
    if d <= max(2 * math.sqrt(ut ** 2 + ul ** 2), rnd * 1.0001):
        done("반감기 일치")
        continue
    uf = unit_flag(ts_app / best["Ts"])
    if uf:
        rec["unit_suspect"] = uf
    elif rec.get("pairing_doubtful"):
        done("짝짓기 의심 — 에너지만 맞고 반감기 100배 이상 차이")
        continue
    ref = iso_ref.get(rw["name"], ("", ""))
    t_comments = " ".join(v for (nm, code), vs in iso_cm.items() if nm == rw["name"] and "T" in code for v in vs)
    rec["nubase_ref"] = " ".join(ref).strip()
    rec["nubase_T_comment"] = t_comments
    cited = ([yy(ref[0][:2])] if ref[0][:2].isdigit() and "T" in ref[1] else []) + [yy(k) for k in KEYYEAR.findall(t_comments)]
    cut = best["cut"]
    if cut and cut > NUBASE_CUTOFF:
        sub = "참조가 NUBASE 이후 평가"
    elif "T" in ref[1] or t_comments:
        sub = "NUBASE가 참조 평가 이후 문헌으로 재평가" if (cited and cut and max(cited) > cut.year) else "NUBASE 근거 명시 평가 차이"
    else:
        sub = "NUBASE 자체 근거 없음 (확인 필요)"
    done(f"반감기 불일치 — {sub}")

summary = {"isomer_states": len(app), "table_I_refs_found": len(iso_ref), "categories": dict(cats.most_common()),
           "unit_suspects": [(x["state"], x["app_T_raw"], x["matched"]["T"], x["unit_suspect"]) for x in res if x.get("unit_suspect")]}
json.dump({"summary": summary, "rows": res}, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(summary, ensure_ascii=False, indent=1))
