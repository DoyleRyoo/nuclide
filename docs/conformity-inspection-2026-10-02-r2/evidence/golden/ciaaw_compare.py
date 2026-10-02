"""CIAAW 현재 동위원소 조성(구간·값)과 앱 존재비(NUBASE2020 IS) 전수 비교 (읽기 전용).

NUBASE2020 §2.6: IUPAC(Meija 2016)이 구간 [a, b]로 준 경우 IS = (a+b)/2, σ² = (b-a)²/12 로 바꿔 수록.
→ 구간 원소는 앱 중심값을 (a+b)/2와, 앱 σ를 (b-a)/√12와 비교한다.
→ 값(불확도) 원소는 중심값 차이와 불확도 크기 비를 본다.
선별 기준(사람이 다시 확인할 후보):
  - 구간: 중심값 불일치(>0.6 % 상대 또는 표시 반올림 초과) 또는 σ 비가 0.67~1.5 밖
  - 값:   |앱−CIAAW| > 2·√(u앱²+uCIAAW²) 또는 불확도 비가 0.2~5 밖
사용: python ciaaw_compare.py <ciaaw html 폴더> <출력 json>
"""
import html
import json
import math
import re
import sys

ROOT = "D:/000_rd_workspace/998_nuclide"
src, out_path = sys.argv[1], sys.argv[2]
exp = json.load(open(f"{ROOT}/docs/conformity-inspection-2026-10-02/evidence/nuclides-export.json", encoding="utf-8"))["nuclides"]
app = {(r["symbol"], r["a"]): r for r in exp if r["abundance_pct"] is not None}
el_rows = re.findall(r"\['([A-Za-z]+)', '([A-Za-z]+)'", open(f"{ROOT}/src/data/elements.ts", encoding="utf-8").read())
SYM = {n.lower(): s for s, n in el_rows}
SYM["aluminium"], SYM["caesium"] = "Al", "Cs"
needed = sorted({s for s, _ in app})
pages = {s: n for n, s in SYM.items() if s in needed}

# CIAAW 표의 일부 행은 첫 칸의 </td>가 빠져 있다 (예: strontium.htm의 84Sr)
ROW = re.compile(r"<tr><td><sup>(\d+)</sup>([A-Za-z]+)\s*(?:</td>)?\s*<td>([^<]*)</td><td>([^<]*)</td>")


def clean(s):
    return html.unescape(s).replace("\u00a0", "").replace(" ", "").strip()


def val_unc(s):
    m = re.match(r"^([\d.]+)\((\d+)\)$", s)
    if not m:
        return None
    v = m.group(1)
    dec = len(v.split(".")[1]) if "." in v else 0
    return float(v), int(m.group(2)) * 10 ** -dec


rows = []
seen_ciaaw = set()
for sym, name in sorted(pages.items()):
    try:
        t = open(f"{src}/{name}.htm", encoding="utf-8", errors="replace").read()
    except FileNotFoundError:
        rows.append({"element": sym, "error": "page missing"})
        continue
    for a, s, _mass, ab in ROW.findall(t):
        if s != sym:
            continue
        a = int(a)
        raw = clean(ab)
        rec = {"isotope": f"{a}{sym}", "ciaaw_raw": html.unescape(ab).strip()}
        seen_ciaaw.add((sym, a))
        m = re.match(r"^\[([\d.]+),([\d.]+)\]$", raw)
        vu = val_unc(raw)
        if m:
            lo, hi = float(m.group(1)) * 100, float(m.group(2)) * 100
            rec.update(kind="interval", lo=lo, hi=hi, ciaaw_mid=(lo + hi) / 2, ciaaw_sd=(hi - lo) / math.sqrt(12))
        elif vu:
            rec.update(kind="value", ciaaw_val=vu[0] * 100, ciaaw_unc=vu[1] * 100)
        elif raw in ("1", "1.0"):
            rec.update(kind="value", ciaaw_val=100.0, ciaaw_unc=0.0)
        else:
            rec.update(kind="other")
        r = app.get((sym, a))
        if r is None:
            rec["app"] = None
            rows.append(rec)
            continue
        mu = float(r["abundance_pct"])
        um = re.search(r"±\s*([\d.]+)", r["abundance_display"] or "")
        sd = float(um.group(1)) if um else 0.0
        rec.update(app=r["abundance_display"], app_val=mu, app_unc=sd, app_state=r["id"])
        flag = []
        if rec["kind"] == "interval":
            if abs(rec["ciaaw_mid"] - mu) > max(0.006 * mu, 0.5 * 10 ** -len(str(mu).split(".")[-1]) if "." in str(mu) else 0.5):
                flag.append("중심값")
            ratio = sd / rec["ciaaw_sd"] if rec["ciaaw_sd"] else None
            rec["sd_ratio_app_over_ciaaw"] = round(ratio, 3) if ratio else None
            if ratio is None or not 0.67 <= ratio <= 1.5:
                flag.append("σ 크기")
        elif rec["kind"] == "value":
            comb = math.sqrt(sd ** 2 + rec["ciaaw_unc"] ** 2)
            rec["z"] = round(abs(mu - rec["ciaaw_val"]) / comb, 2) if comb else None
            if comb and abs(mu - rec["ciaaw_val"]) > 2 * comb:
                flag.append("값 차이")
            ratio = sd / rec["ciaaw_unc"] if rec["ciaaw_unc"] else None
            rec["unc_ratio_app_over_ciaaw"] = round(ratio, 3) if ratio else None
            if ratio is not None and not 0.2 <= ratio <= 5:
                flag.append("불확도 크기")
        rec["flags"] = flag
        rows.append(rec)

app_only = sorted(f"{a}{s}" for (s, a) in app if (s, a) not in seen_ciaaw)
summary = {
    "elements": len(pages),
    "ciaaw_isotope_rows": sum(1 for r in rows if "kind" in r),
    "app_isotopes_with_abundance": len(app),
    "matched": sum(1 for r in rows if r.get("app")),
    "app_only_not_in_ciaaw_table": app_only,
    "ciaaw_only_no_app_value": [r["isotope"] for r in rows if "kind" in r and not r.get("app")],
    "by_kind": {k: sum(1 for r in rows if r.get("kind") == k and r.get("app")) for k in ("interval", "value", "other")},
    "flagged": {r["isotope"]: r["flags"] for r in rows if r.get("flags")},
}
json.dump({"summary": summary, "rows": rows}, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(summary, ensure_ascii=False, indent=1))
