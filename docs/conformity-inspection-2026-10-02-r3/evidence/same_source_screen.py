"""R3-2: '같은 출처인데 값이 다른' 바닥상태 선별 — ¹³⁸Cs형 옮겨 적기 오류 후보 (읽기 전용).

전제: NUBASE2020이 어떤 물리량에 자체 참조(Table I 갱신 코드 T/D)도 주석도 두지 않았다면 그 값은 ENSDF 파일(Ens 연도)을
그대로 쓴 것이다. LiveChart의 ENSDF cutoff 연도가 NUBASE의 Ens 연도 이하이면 둘은 같은 평가를 본 것이므로 값이 같아야 한다.
→ 반올림(양쪽 마지막 자리의 절반 합)을 넘는 차이를 후보로 남긴다.

반감기: 값형만, 참조가 폭(eV)이면 제외. 분기비: NUBASE '=' 값과 LiveChart 같은 묶음 값, 참조 불확도가 있는 경우만
(LiveChart API는 분기비 부등호를 버리므로 불확도 없는 값은 한계일 수 있음 — 2차 02 문서).
사용: python -B same_source_screen.py <NUBASE2020 pdftotext -raw 텍스트> <출력 json>
"""
import csv
import importlib.util
import json
import re
import sys
from datetime import datetime

sys.dont_write_bytecode = True
ROOT = "D:/000_rd_workspace/998_nuclide"
R1 = f"{ROOT}/docs/conformity-inspection-2026-10-02/evidence"
pdf_txt, out_path = sys.argv[1], sys.argv[2]

spec = importlib.util.spec_from_file_location("lcd", f"{ROOT}/tools/livechart-diff/livechart_diff.py")
lcd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lcd)

UNIT_S = {"ys": 1e-24, "zs": 1e-21, "as": 1e-18, "fs": 1e-15, "ps": 1e-12, "ns": 1e-9, "us": 1e-6, "ms": 1e-3, "s": 1,
          "m": 60, "h": 3600, "d": 86400, "y": 31556926, "ky": 31556926e3, "My": 31556926e6, "Gy": 31556926e9,
          "Ty": 31556926e12, "Py": 31556926e15, "Ey": 31556926e18, "Zy": 31556926e21, "Yy": 31556926e24}
LC_UNIT_S = {k.upper(): v for k, v in UNIT_S.items()}
LC_UNIT_S.update({"Y": 31556925.974592, "M": 60, "MS": 1e-3, "US": 1e-6, "S": 1, "H": 3600, "D": 86400})


def half_digit(s):
    s = s.strip().rstrip("#")
    if "e" in s.lower():
        mant, ex = s.lower().split("e")
        dec = len(mant.split(".")[1]) if "." in mant else 0
        return 0.5 * 10 ** (-dec) * 10 ** int(ex)
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


# NUBASE 원문 바닥상태 (이성질체 반감기는 바닥·이성질체 배정 차이 판별에 쓴다)
raw, iso_T = {}, {}
for line in open(f"{ROOT}/data/raw/nubase_4.mas20.txt", encoding="latin-1"):
    if line.startswith("#") or len(line) < 20:
        continue
    l = line.rstrip("\n").ljust(209)
    a, z, i = int(l[0:3]), int(l[4:7]), int(l[7])
    if 0 < i < 8:
        t, u = l[69:78].strip().rstrip("#"), l[78:80].strip()
        if re.fullmatch(r"[0-9.]+", t) and u in UNIT_S:
            iso_T.setdefault((z, a - z), []).append((l[11:17].strip(), float(t) * UNIT_S[u]))
    if i != 0:
        continue
    raw[(z, a - z)] = {"name": l[11:16].strip(), "a": a, "T": l[69:78].strip(), "U": l[78:80].strip(),
                       "dT": l[81:88].strip(), "ens": l[102:104].strip(), "disc": l[114:118].strip(), "br": l[119:209].strip()}

# Table I 행·주석
pdf = open(pdf_txt, encoding="utf-8", errors="replace").read().splitlines()
COMMENT = re.compile(r"^(\d{1,3})\s?([A-Za-z][a-z]?)\s+([METJDI])\s*:")  # '1 n T :' 처럼 중성자는 소문자·공백
has_comment = set()
for ln in pdf:
    m = COMMENT.match(ln)
    if m:
        has_comment.add((int(m.group(1)), m.group(2), m.group(3)))
NSR = r"\d\d[A-Z][A-Za-z][0-9A-Z.]{2,3}|AHW|GAU|HWJ|FGK\w*|MMC|SAR|WGM|Mirror|Imme"
rows_by_head = {}
for ln in pdf:
    m = re.match(r"^(\d{1,3})([A-Z][a-z]?)\s", ln)
    if m and " : " not in ln:
        rows_by_head.setdefault((int(m.group(1)), m.group(2)), []).append(ln)


def ref_codes(a, el, rw):
    for ln in rows_by_head.get((a, el), []):
        if rw["disc"] and re.search(rf"\s({NSR})\s+([METJDI]{{1,4}})\s+{re.escape(rw['disc'])}\b", ln):
            return re.search(rf"\s({NSR})\s+([METJDI]{{1,4}})\s+{re.escape(rw['disc'])}\b", ln).groups()
        if rw["disc"] and re.search(rf"\s{re.escape(rw['disc'])}\b", ln):
            return ("", "")
    return None


# LiveChart: 1차와 같은 일괄 스냅샷, 단건 캐시가 있으면 그것을 우선(더 최근)
bulk = {(int(r["z"]), int(r["n"])): r for r in csv.DictReader(open(f"{ROOT}/tools/livechart-diff/livechart_ground_states.csv", encoding="utf-8-sig"))}
app = {(r["z"], r["n"]): r for r in json.load(open(f"{R1}/nuclides-export.json", encoding="utf-8"))["nuclides"] if not r["is_isomer"]}


def lc_for(z, n, a, sym):
    p = f"{ROOT}/tools/livechart-diff/livechart_live/{a}{sym.lower()}.csv"
    try:
        rows = list(csv.DictReader(open(p, encoding="utf-8-sig")))
        if rows:
            return rows[0], "단건 캐시"
    except FileNotFoundError:
        pass
    return bulk.get((z, n)), "일괄"


cand_T, cand_D, stats = [], [], {"pairs": 0, "same_eval": 0, "T_compared": 0, "D_compared": 0}
for (z, n), rw in raw.items():
    if (z, n) not in app:
        continue
    sym = app[(z, n)]["symbol"]
    lc, src = lc_for(z, n, rw["a"], sym)
    if not lc:
        continue
    stats["pairs"] += 1
    cut = parse_cut(lc.get("ENSDFpublicationcut-off", ""))
    if not (rw["ens"] and cut):
        continue
    ens_year = 2000 + int(rw["ens"]) if int(rw["ens"]) <= 21 else 1900 + int(rw["ens"])
    if cut.year > ens_year:
        continue  # 참조 쪽이 더 나중 평가 → 버전 차이 가능
    stats["same_eval"] += 1
    refc = ref_codes(rw["a"], sym, rw)
    codes = (refc[1] if refc else "") or ""
    common = {"state": f"{rw['a']}{sym}", "nubase_ens_year": ens_year, "lc_cutoff": cut.isoformat(),
              "lc_authors": lc.get("ENSDFauthors", ""), "lc_source": src, "nubase_ref": " ".join(refc) if refc else "추출 실패"}

    # 반감기
    T = rw["T"]
    if (T and T not in ("stbl", "p-unst") and not T.endswith("#") and not re.match(r"^[<>~]", T)
            and "T" not in codes and (rw["a"], sym, "T") not in has_comment and lc.get("half_life_sec")
            and not lc.get("operator_hl") and (lc.get("unit_hl") or "").upper() in LC_UNIT_S):
        stats["T_compared"] += 1
        nub_s = float(T) * UNIT_S[rw["U"]]
        lc_s = float(lc["half_life_sec"])
        tol = half_digit(T) * UNIT_S[rw["U"]] + half_digit(lc["half_life"]) * LC_UNIT_S[lc["unit_hl"].upper()] + 1e-9 * lc_s
        if abs(nub_s - lc_s) > tol:
            unc_n = float(rw["dT"]) * UNIT_S[rw["U"]] if re.fullmatch(r"[0-9.]+", rw["dT"]) else None
            unc_l = float(lc["unc_hls"]) if re.fullmatch(r"[0-9.eE+-]+", lc.get("unc_hls") or "") else None
            sig = max([u for u in (unc_n, unc_l) if u] or [0])
            # LiveChart 바닥상태 값이 NUBASE 이성질체의 반감기와 맞으면 배정 차이
            assign = [nm for nm, s in iso_T.get((z, n), []) if abs(s - lc_s) <= max(0.05 * lc_s, 2 * (unc_l or 0))]
            cand_T.append({**common, "nubase": f"{T} {rw['U']} {rw['dT']}", "livechart": f"{lc['half_life']} {lc['unit_hl']} ±{lc['unc_hl']}",
                           "rel_diff": round((nub_s - lc_s) / lc_s, 4), "z": round(abs(nub_s - lc_s) / sig, 2) if sig else None,
                           "matches_nubase_isomer": assign})

    # 분기비
    if "D" not in codes and (rw["a"], sym, "D") not in has_comment:
        nub = []
        for tok in [t.strip() for t in rw["br"].split(";") if t.strip() and not t.strip().startswith("IS")]:
            m = re.match(r"^(\S+?)=([0-9.]+(?:e-?\d+)?)\s*(\d+)?$", tok)
            if m:
                nub.append((lcd.mode_family(lcd.canon_mode(m.group(1))), m.group(1), m.group(2)))
        lc_codes = {lc.get(f"decay_{k}") for k in (1, 2, 3)}
        lcm = {}
        for k in (1, 2, 3):
            c, p, u = lc.get(f"decay_{k}"), lc.get(f"decay_{k}_%"), lc.get(f"unc_{k}")
            if c and p and u:
                # LiveChart 'B+'는 양전자 몫만이다. NUBASE 'B+'(EC+e+ 합계)가 아니라 NUBASE 'e+'와 짝짓는다
                key = "e+" if c == "B+" else lcd.mode_family(lcd.canon_mode(c))
                lcm.setdefault(key, []).append((c, p, u))
        for fam, mode, val in nub:
            if mode == "e+":
                fam = "e+"
            elif mode == "B+" and "B+" in lc_codes:
                continue
            if fam in lcm and len(lcm[fam]) == 1 and mode != "EC":
                c, p, u = lcm[fam][0]
                stats["D_compared"] += 1
                tol = half_digit(val) + half_digit(p) + 1e-9
                if abs(float(val) - float(p)) > tol:
                    mm = re.search(rf"(?:^|;){re.escape(mode)}={re.escape(val)}\s*(\d+)", rw["br"])
                    dec = len(val.split("e")[0].split(".")[1]) if "." in val.split("e")[0] else 0
                    ex = int(val.lower().split("e")[1]) if "e" in val.lower() else 0
                    un = int(mm.group(1)) * 10 ** (-dec) * 10 ** ex if mm else None
                    sig = max([x for x in (un, float(u)) if x] or [0])
                    cand_D.append({**common, "mode": mode, "nubase": f"{mode}={val}", "livechart": f"{c} {p} ±{u}",
                                   "diff_pctpt": round(float(val) - float(p), 6), "ratio": round(float(val) / float(p), 4) if float(p) else None,
                                   "z": round(abs(float(val) - float(p)) / sig, 2) if sig else None, "nubase_br": rw["br"]})

json.dump({"stats": stats, "half_life_candidates": cand_T, "branching_candidates": cand_D},
          open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(stats, ensure_ascii=False))
print("반감기 후보", len(cand_T))
for c in cand_T:
    print("  ", c["state"], c["nubase"], "|", c["livechart"], "| rel", c["rel_diff"], "z", c["z"], "| 이성질체 일치", c["matches_nubase_isomer"], "| ens", c["nubase_ens_year"], "LC", c["lc_cutoff"], "| ref", c["nubase_ref"])
print("분기비 후보", len(cand_D))
for c in cand_D:
    print("  ", c["state"], c["nubase"], "|", c["livechart"], "| Δ", c["diff_pctpt"], "비", c["ratio"], "z", c["z"], "| ens", c["nubase_ens_year"], "LC", c["lc_cutoff"], "| ref", c["nubase_ref"], "|", c["nubase_br"])
