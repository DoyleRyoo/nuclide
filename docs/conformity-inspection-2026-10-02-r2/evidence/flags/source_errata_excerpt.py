import csv, hashlib, json, re, subprocess, sys
SP, OUT = sys.argv[1], sys.argv[2]
ROOT = "D:/000_rd_workspace/998_nuclide"
R1 = f"{ROOT}/docs/conformity-inspection-2026-10-02/evidence"
items = {"164Ho": (67, 97), "182Pt": (78, 104), "151Ho": (67, 84), "138Cs": (55, 83), "217Pa": (91, 126)}
def sha(p): return hashlib.sha256(open(p, "rb").read()).hexdigest()
def grab(path, pat, enc="latin-1"):
    return [l.rstrip() for l in open(path, encoding=enc, errors="replace") if re.match(pat, l)]
bulk = {(int(r["z"]), int(r["n"])): r for r in csv.DictReader(open(f"{ROOT}/tools/livechart-diff/livechart_ground_states.csv", encoding="utf-8-sig"))}
exp = {(r["z"], r["n"]): r for r in json.load(open(f"{R1}/nuclides-export.json", encoding="utf-8"))["nuclides"] if not r["is_isomer"]}
out = {"sources": {
    "nubase2020_ascii": {"file": "data/raw/nubase_4.mas20.txt", "sha256": sha(f"{ROOT}/data/raw/nubase_4.mas20.txt"),
                          "live_mirror_url": "https://www-nds.iaea.org/amdc/ame2020/nubase_4.mas20.txt",
                          "live_mirror_sha256_2026-10-02T11:30+09:00": sha(f"{SP}/nubase_4_live.txt")},
    "nubase2020_pdf": {"url": "https://www-nds.iaea.org/amdc/ame2020/NUBASE2020.pdf", "sha256": sha(f"{SP}/nubase2020.pdf"),
                        "text": "pdftotext -raw (Table I 행·주석) / -layout (본문)", "pdftotext": open(f"{SP}/pdftotext-version.txt").read().strip(),
                        "cutoff_quote": "All experimental data available to the authors by October 30, 2020 were considered. (§1, p.030001-2)"},
    "nubase2016_ascii": {"url": "https://www-nds.iaea.org/amdc/ame2016/nubase2016.txt", "sha256": sha(f"{SP}/nubase2016.txt"), "queried_at": "2026-10-02T11:37:00+09:00"},
    "livechart_bulk": "tools/livechart-diff/livechart_ground_states.csv (1차와 같은 2026-10-01 수신본)",
    "app_values": "docs/conformity-inspection-2026-10-02/evidence/nuclides-export.json (1차 생성)"},
  "items": {}}
for name, (z, n) in items.items():
    a = z + n
    key = f"{a:03d} {z:03d}0"
    b = bulk.get((z, n), {})
    e = exp.get((z, n), {})
    out["items"][name] = {
        "nubase2020_ascii": grab(f"{ROOT}/data/raw/nubase_4.mas20.txt", re.escape(key)),
        "nubase2020_pdf_tableI": grab(f"{SP}/nubase2020-raw.txt", rf"^{a}{re.sub(r'[0-9]', '', name)}[\s]", "utf-8"),
        "nubase2016_ascii": grab(f"{SP}/nubase2016.txt", re.escape(key)),
        "livechart": {k: b.get(k) for k in ("half_life", "unc_hl", "unit_hl", "decay_1", "decay_1_%", "unc_1", "decay_2", "decay_2_%", "unc_2", "qec", "qbm", "ENSDFpublicationcut-off", "ENSDFauthors")},
        "app": {"half_life_display": e.get("half_life_display"), "decay_display": e.get("decay_display"), "primary": e.get("primary"),
                "qEC": (e.get("ame") or {}).get("qEC", {}).get("display"), "qBetaMinus": (e.get("ame") or {}).get("qBetaMinus", {}).get("display")},
    }
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for k, v in out["items"].items(): print(k, v["nubase2020_pdf_tableI"], "|", v["app"]["decay_display"] or v["app"]["half_life_display"])
