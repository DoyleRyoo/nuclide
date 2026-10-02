"""NUBASE2020 원문의 자릿수·표기 이상 선별 (읽기 전용).

1) 반감기 열(82–88)은 값과 같은 단위의 절대 불확도다 (예: '12.32 y 0.02').
   값에 소수점이 있는데 불확도가 소수점 없는 정수면 ENSDF식(마지막 자리 단위)으로 잘못 적었을 가능성이 있다.
2) 붕괴·존재비 열은 ENSDF식(마지막 자리 단위)이다 (예: 'B-n=21 7', 'IS=0.0145 78').
   지수 표기는 가수의 마지막 자리 기준 ('SF=5.44e-5 7' = (5.44±0.07)e-5).
   불확도가 값보다 크거나 값에 선행 0이 있으면 기록한다.
사용: python nubase_format_scan.py <출력 json>
"""
import json
import re
import sys

ROOT = "D:/000_rd_workspace/998_nuclide"
hl, br_odd = [], []
for line in open(f"{ROOT}/data/raw/nubase_4.mas20.txt", encoding="latin-1"):
    if line.startswith("#") or len(line) < 90:
        continue
    line = line.rstrip("\n").ljust(209)
    name = line[11:17].strip()
    T, U, dT = line[69:78].strip(), line[78:80].strip(), line[81:88].strip()
    t = T.lstrip("~<>").rstrip("#")
    if "." in t and re.fullmatch(r"\d+", dT):
        dec = len(t.split(".")[1])
        hl.append({"state": name, "T": T, "unit": U, "dT": dT, "abs_reading": f"{t} ± {dT} {U}",
                   "last_digit_reading": f"{t} ± {int(dT) * 10 ** -dec:.{dec}f} {U}", "abs_unc_over_value": round(int(dT) / float(t), 3)})
    for tok in [x.strip() for x in line[119:209].split(";") if x.strip()]:
        m = re.match(r"^(\S+?)(=|<|>|~)([0-9.]+)(?:e([+-]?\d+))?(#?)\s+(\d+)\s*$", tok)
        if m:
            mant, exp_, unc = m.group(3), int(m.group(4) or 0), int(m.group(6))
            dec = len(mant.split(".")[1]) if "." in mant else 0
            val, ua = float(mant) * 10 ** exp_, unc * 10 ** -dec * 10 ** exp_
            if re.match(r"^0\d", mant):
                br_odd.append({"state": name, "token": tok, "issue": "선행 0"})
            if val > 0 and ua > val:
                br_odd.append({"state": name, "token": tok, "issue": f"불확도 {ua:.3g} > 값 {val:.3g}"})
        elif re.match(r"^IS=0\d", tok):
            br_odd.append({"state": name, "token": tok, "issue": "선행 0"})

json.dump({"half_life_integer_unc_on_decimal_value": hl, "branch_or_abundance_anomalies": br_odd},
          open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(hl), "반감기 후보"); [print(" ", h) for h in hl]
print(len(br_odd), "붕괴·존재비 후보"); [print(" ", b) for b in br_odd]
