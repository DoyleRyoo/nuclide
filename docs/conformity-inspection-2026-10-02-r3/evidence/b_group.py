"""R3-3 보조: b-class-review.json을 근거 유형별로 묶는다. 평가 자체(2021Wa16=AME2020, 2021Ko07=NUBASE2020)는 새 측정에서 뺀다."""
import json, sys
EVALS = {"2021Wa16", "2021WA16", "2021Ko07", "2021Hu17"}
d = json.load(open(sys.argv[1], encoding="utf-8"))
groups = {"B1 NUBASE 마감 후 새 측정(2021~)": [], "B2 2020년 문헌만": [], "B3 새 측정 없음(같은 자료 다른 평가)": [], "B4 ENSDF 계산값(CA)": []}
for o in d:
    ks = [k for k in o["keys_2020_or_later"] if k not in EVALS]
    post = [k for k in ks if int(k[:4]) >= 2021]
    if " CA" in (o["nudat_gs_T_and_branches"] or "") and o["category"] == "분기비 불일치":
        g = "B4 ENSDF 계산값(CA)"
    elif post:
        g = "B1 NUBASE 마감 후 새 측정(2021~)"
    elif ks:
        g = "B2 2020년 문헌만"
    else:
        g = "B3 새 측정 없음(같은 자료 다른 평가)"
    groups[g].append({"nuclide": o["nuclide"], "category": o["category"], "app": o["app_nubase2020"],
                      "ensdf_now": o["nudat_gs_T_and_branches"], "citation": o["nudat_citation"], "cutoff": o["nudat_cutoff"], "keys": ks})
json.dump(groups, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for g, v in groups.items():
    print(f"== {g}: {len(v)}행")
    for x in v:
        print(f"   {x['nuclide']:6} {x['category'][:5]} | 앱 {x['app']} | 현재 ENSDF {x['ensdf_now'][:60]} | {x['citation']} | {x['keys']}")
