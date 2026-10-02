import csv, sys, random
rows = list(csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")))
random.seed(20261002)
by = {}
for r in rows: by.setdefault(r["분류"], []).append(r)
for cls in ("A1", "A2", "B", "S", "N", "C", "E"):
    pool = by.get(cls, [])
    pick = pool if cls in ("C", "E", "N") else random.sample(pool, min(5, len(pool)))
    print(f"===== {cls} ({len(pool)}) — 표본 {len(pick)}")
    for r in pick:
        print(f"- {r['핵종']} {r['범주']} | 앱[{r['앱 값']}] 참조[{r['참조값']}] | NUBASE ref[{r['NUBASE Table I 참조(코드)']}] ens{r['NUBASE ENSDF 연도']} 인용최신[{r['NUBASE 인용 최신 연도']}] | LC cut {r['LiveChart ENSDF cutoff']} ({r['LiveChart 출처'][:2]})")
        if r["NUBASE 주석"]: print(f"    주석({r['NUBASE 주석 코드']}): {r['NUBASE 주석'][:230]}")
        if cls == "S": print(f"    원문 붕괴: {r['NUBASE 원문 붕괴']} | 누락 {r['누락 묶음']}")
