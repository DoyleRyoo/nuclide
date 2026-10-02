import json, os, re, sys, urllib.parse
root = "D:/000_rd_workspace/998_nuclide/docs"
docs = [os.path.join(root, "conformity-inspection-2026-10-02-r2", f) for f in
        ("README.md", "01-qa01-font-test.md", "02-flag-classification.md", "03-source-data-errors.md",
         "04-golden-abundance.md", "05-tool-tasks.md", "METHODS.md", "CONTINUE.md")]
docs += [os.path.join(root, "conformity-inspection-2026-10-02", f) for f in ("README.md", "CONTINUE.md")]
LINK = re.compile(r"!?\[[^\]]*\]\(([^)\s]+)\)")
res = {"checked_at": sys.argv[1], "documents": [], "broken": []}
for d in docs:
    raw = open(d, "rb").read()
    try:
        text = raw.decode("utf-8"); enc_ok = True
    except UnicodeDecodeError:
        text = raw.decode("utf-8", "replace"); enc_ok = False
    links = [m.group(1) for m in LINK.finditer(text) if not re.match(r"^(https?:|mailto:|#)", m.group(1))]
    bad = []
    for l in links:
        p = os.path.normpath(os.path.join(os.path.dirname(d), urllib.parse.unquote(l.split("#")[0])))
        if not os.path.exists(p):
            bad.append(l)
    res["documents"].append({"file": os.path.relpath(d, root).replace("\\", "/"), "utf8": enc_ok, "bom": raw.startswith(b"\xef\xbb\xbf"),
                             "replacement_chars": text.count("\ufffd"), "local_links": len(links), "broken": bad})
    res["broken"] += [f"{os.path.basename(d)}: {b}" for b in bad]
print(json.dumps(res, ensure_ascii=False, indent=1))
