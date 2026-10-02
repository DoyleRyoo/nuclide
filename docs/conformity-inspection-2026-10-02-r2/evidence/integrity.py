import hashlib, json, subprocess, sys, os
root = r"D:\000_rd_workspace\998_nuclide"
base = json.load(open(os.path.join(root, r"docs\conformity-inspection-2026-10-02\evidence\baseline-hashes.json"), encoding="utf-8"))
head = subprocess.check_output(["git", "-C", root, "rev-parse", "HEAD"], text=True).strip()
tracked = subprocess.check_output(["git", "-C", root, "ls-files"], text=True).splitlines()
mismatch, missing = [], []
for rel, h in base["files"].items():
    p = os.path.join(root, rel)
    if not os.path.exists(p):
        missing.append(rel); continue
    if hashlib.sha256(open(p, "rb").read()).hexdigest() != h:
        mismatch.append(rel)
extra_tracked = sorted(set(tracked) - set(base["files"]))
status = subprocess.check_output(["git", "-C", root, "status", "--porcelain"], text=True).splitlines()
out = {"checked_at": sys.argv[1] if len(sys.argv) > 1 else None, "baseline_head": base["head"], "current_head": head,
       "head_same": head == base["head"], "files_checked": len(base["files"]), "mismatch": mismatch, "missing": missing,
       "tracked_not_in_baseline": extra_tracked, "git_status_porcelain": status}
print(json.dumps(out, ensure_ascii=False, indent=2))
