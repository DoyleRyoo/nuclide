"""R3-3: 2차 B 분류(참조 ENSDF가 NUBASE2020 마감 이후) 33건 — NNDC NuDat 현재 ENSDF 채택 문서로 새 근거 문헌 확인 (읽기 전용).

각 핵종 문서의 바닥상태 행(첫 데이터 행)에서 반감기·분기 표시값과 툴팁 주석을 읽고,
주석에 나온 NSR 키 중 2020년 이후 문헌을 뽑는다. 앱 값(NUBASE2020)과 현재 ENSDF 값을 나란히 둔다.
사용: python -B b_class_review.py <nndc html 폴더> <2차 top318-classified.csv> <출력 json>
"""
import csv
import html
import json
import re
import sys

src, flags_csv, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
KEY = re.compile(r"\b(19[5-9]\d|20[0-2]\d)([A-Z][A-Za-z])(\d\d|[A-Z]{2})\b")


def visible(s):
    s = re.sub(r"onmouseover=\"Tip\('.*?'\)\"", "", s, flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def tips(s):
    return [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", t))).strip()
            for t in re.findall(r"Tip\('(.*?)'\)\"", s, flags=re.S)]


def gs_row(page):
    head = re.search(r"Citation:(?:</u>)?\s*(.*?)\s*&nbsp;.*?Cutoff date:(?:</u>)?\s*([0-9A-Za-z-]+)", page, flags=re.S)
    hdr = page.find("T<sub>1/2</sub>(level)")
    if hdr < 0:
        return None
    # 머리행에서 T½ 열 번호를 찾는다 (초중핵 문서는 Jπ 열이 없어 위치가 다르다)
    row_start = page.rfind("<tr>", 0, hdr)
    header_cells = re.findall(r"<td class=\"header\">(.*?)</td>", page[row_start:page.find("</tr>", hdr)], flags=re.S)
    t_idx = next((k for k, c in enumerate(header_cells) if "T<sub>1/2</sub>" in c), 3)
    rest = page[hdr:]
    m = re.search(r"</tr>\s*<tr>(.*?)(?=<tr>|</table>)", rest, flags=re.S | re.I)
    if not m:
        return None
    cells = re.findall(r"<td class=\"cell[c]?\"[^>]*>(.*?)</td>", m.group(1), flags=re.S)
    t_cell = cells[t_idx] if len(cells) > t_idx else ""
    e_cell = cells[0] if cells else ""
    com = re.search(r"<td class=\"cell\">\s*(?:&nbsp;)*\s*0(?:\.0)?\s*</td><td class=\"cellcom\">(.*?)</td>", page, flags=re.S)
    gen = page.find("General Comments")
    return {
        "citation": re.sub(r"<[^>]+>", "", html.unescape(head.group(1))).strip() if head else "",
        "cutoff": head.group(2) if head else "",
        "gs_T_and_branches": visible(t_cell),
        "gs_T_comment": " | ".join(tips(t_cell)),
        "gs_level_comment": " | ".join(tips(e_cell)),
        "additional_comment": visible(com.group(1)) if com else "",
        "general_comment": visible(page[gen:gen + 6000]) if gen >= 0 else "",
    }


rows = [r for r in csv.DictReader(open(flags_csv, encoding="utf-8-sig")) if r["분류"] == "B"]
out = []
for r in rows:
    nm = r["핵종"].lower()
    try:
        page = open(f"{src}/{nm}_adopted.html", encoding="utf-8", errors="replace").read()
    except FileNotFoundError:
        out.append({"nuclide": r["핵종"], "error": "page missing"})
        continue
    g = gs_row(page) or {}
    text = " ".join([g.get("gs_T_comment", ""), g.get("gs_level_comment", ""), g.get("additional_comment", ""), g.get("general_comment", "")])
    keys = sorted({"".join(k) for k in KEY.findall(text)})
    out.append({
        "nuclide": r["핵종"], "category": r["범주"], "severity": r["심각도"],
        "app_nubase2020": r["앱 값"], "livechart_snapshot": r["참조값"], "livechart_cutoff": r["LiveChart ENSDF cutoff"],
        "nubase_ref": r["NUBASE Table I 참조(코드)"],
        "nudat_citation": g.get("citation"), "nudat_cutoff": g.get("cutoff"),
        "nudat_gs_T_and_branches": g.get("gs_T_and_branches"),
        "keys_2020_or_later": [k for k in keys if int(k[:4]) >= 2020],
        "all_keys": keys,
        "gs_T_comment": g.get("gs_T_comment"), "gs_level_comment": g.get("gs_level_comment"),
        "additional_comment": g.get("additional_comment"),
    })
json.dump(out, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for o in out:
    print(f"== {o['nuclide']} [{o.get('category')}] 앱 {o.get('app_nubase2020')} | LC {o.get('livechart_snapshot')} ({o.get('livechart_cutoff')})")
    print(f"   NuDat: {o.get('nudat_citation')} / cutoff {o.get('nudat_cutoff')} | 바닥상태: {o.get('nudat_gs_T_and_branches')}")
    print(f"   2020+ 문헌: {o.get('keys_2020_or_later')}")
