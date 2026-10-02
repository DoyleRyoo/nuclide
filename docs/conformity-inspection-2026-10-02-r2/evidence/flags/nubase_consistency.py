"""NUBASE2020 원문 자체의 내부 일관성 선별 검사 (읽기 전용).

1) 분기비 합: 주 붕괴(지연 입자 방출·EC/e+ 내역 제외)가 모두 '='일 때 합이 100에서 벗어남
2) 에너지 모순(바닥상태): 표시된 모드가 AME2020 Q값으로 금지됨
   - β−(B-) 인데 Qβ− < 0,  β+(B+, NUBASE는 EC+e+ 합) 인데 QEC < 0,  e+ 인데 QEC < 1022 keV,  α 인데 Qα < 0
   - '=' 값이 있는 모드만 '모순', '?'(에너지상 가능하나 미관측)는 따로 집계
3) EC와 B+가 함께 있는데 B+(합계) < EC(내역)  — NUBASE 표기상 모순
Q값은 1차 검증의 앱 내보내기(ame.qBetaMinus/qEC/qAlpha)를 쓴다. 앱은 QEC를 이웃 핵의 Qβ−에서 유도한다.
"""
import json
import math
import re
import sys

ROOT = "D:/000_rd_workspace/998_nuclide"
exp = json.load(open(f"{ROOT}/docs/conformity-inspection-2026-10-02/evidence/nuclides-export.json", encoding="utf-8"))["nuclides"]
app = {(r["z"], r["n"], r["level"]): r for r in exp}
TOK = re.compile(r"^(\S+?)(=\?|=|<=|>=|<|>|~|\s+\?|\?)(.*)$")
DELAYED = re.compile(r"^(B-|B\+|EC)(?!$|\+B\+$)")  # B-n, B+p, ECp, B-SF ... (단, '2B-'·'EC+B+'는 주 붕괴)

out = {"sum": [], "energy": [], "energy_q": [], "ec_bplus": []}
for line in open(f"{ROOT}/data/raw/nubase_4.mas20.txt", encoding="latin-1"):
    if line.startswith("#") or len(line) < 20:
        continue
    line = line.rstrip("\n").ljust(209)
    a, z, i = int(line[0:3]), int(line[4:7]), int(line[7])
    if i >= 8:  # IAS
        continue
    name = line[11:16].strip() + line[16].strip()
    br = line[119:209].strip()
    modes = []
    for tok in [t.strip() for t in br.split(";") if t.strip()]:
        tok = re.sub(r"=\s+\?", "=?", tok)
        if tok.startswith("IS="):
            continue
        m = TOK.match(tok)
        if not m:
            continue
        rest = m.group(3).split()
        val = float(rest[0].rstrip("#")) if rest and re.match(r"^[0-9.eE+-]+#?$", rest[0]) else None
        unc = None
        if val is not None and len(rest) > 1 and re.match(r"^[0-9]+$", rest[1]):
            dec = len(rest[0].rstrip("#").split(".")[1]) if "." in rest[0] and "e" not in rest[0].lower() else 0
            unc = int(rest[1]) * 10 ** (-dec)  # ENSDF 형식: 마지막 자리 단위 ('0.962 2' = ±0.002)
        modes.append({"mode": m.group(1), "op": m.group(2).strip(), "val": val, "unc": unc})
    if not modes:
        continue
    codes = {m["mode"] for m in modes}
    prim = [m for m in modes if not DELAYED.match(m["mode"]) or m["mode"] in ("B-", "B+", "EC")]
    if "B+" in codes:
        prim = [m for m in prim if m["mode"] not in ("EC", "e+")]
    if prim and all(m["op"] == "=" and m["val"] is not None for m in prim):
        s = sum(m["val"] for m in prim)
        sig = math.sqrt(sum((m["unc"] or 0) ** 2 for m in prim))
        # 선별 기준을 넓게 둔다: 합이 100에서 1%p 넘게 벗어나면 모두 기록하고 z 값으로 판단
        if abs(s - 100) > 1.0:
            out["sum"].append({"state": name, "z": z, "n": a - z, "level": i, "br": br, "sum": round(s, 6), "sigma": round(sig, 4), "z": round(abs(s - 100) / sig, 2) if sig else None})
    ec = next((m for m in modes if m["mode"] == "EC" and m["op"] == "="), None)
    bp = next((m for m in modes if m["mode"] == "B+" and m["op"] == "="), None)
    if ec and bp and bp["val"] < ec["val"]:
        out["ec_bplus"].append({"state": name, "br": br})
    if i != 0:
        continue
    rec = app.get((z, a - z, 0))
    ame = (rec or {}).get("ame") or {}
    q = {k: (float(ame[k]["v"]), float(ame[k]["u"] or 0)) for k in ("qBetaMinus", "qEC", "qAlpha") if k in ame and ame[k].get("v")}
    for m in modes:
        rule = {"B-": ("qBetaMinus", 0.0), "B+": ("qEC", 0.0), "e+": ("qEC", 1022.0), "A": ("qAlpha", 0.0)}.get(m["mode"])
        if not rule or rule[0] not in q:
            continue
        qv, qu = q[rule[0]]
        if qv + 3 * qu < rule[1]:
            item = {"state": name, "z": z, "n": a - z, "mode": m["mode"], "op": m["op"], "val": m["val"], "Q": rule[0], "Q_keV": qv, "Q_unc": qu, "threshold_keV": rule[1], "br": br}
            (out["energy_q"] if m["op"] in ("?",) else out["energy"]).append(item)

summary = {k: len(v) for k, v in out.items()}
json.dump({"summary": summary, **out}, open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(summary)
for k in ("sum", "energy", "ec_bplus"):
    print("==", k)
    for x in out[k]:
        print("  ", {kk: x[kk] for kk in x if kk not in ("z", "n")})
print("== energy_q (첫 15)")
for x in out["energy_q"][:15]:
    print("  ", x["state"], x["mode"], x["Q"], x["Q_keV"], "|", x["br"])
