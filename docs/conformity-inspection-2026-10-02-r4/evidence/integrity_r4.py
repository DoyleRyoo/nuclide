"""4차 무변경 확인 (읽기 전용).

1차 기준(baseline-hashes.json, 커밋 7280849)의 107개 파일을 다시 해시하고,
기준 커밋 이후 커밋·작업 트리에서 docs/ 밖의 변경이 있는지 확인한다.
HEAD는 검증 문서 커밋 때문에 기준과 다르므로 HEAD 일치는 판단 기준으로 쓰지 않는다.
사용: python -B integrity_r4.py <표시용 라벨> <출력 json>
"""
import hashlib
import json
import subprocess
import sys

ROOT = "D:/000_rd_workspace/998_nuclide"
BASE = "7280849527dbc5819b1eb8700f7f1738137ec78d"


def git(*args):
    # core.quotepath=false: 한글 경로를 "\353..."처럼 따옴표로 감싸지 않게 해야 docs/ 접두어 판정이 맞는다
    return subprocess.check_output(["git", "-c", "core.quotepath=false", "-C", ROOT, *args], text=True, encoding="utf-8").splitlines()


base = json.load(open(f"{ROOT}/docs/conformity-inspection-2026-10-02/evidence/baseline-hashes.json", encoding="utf-8"))
mismatch = []
for rel, h in base["files"].items():
    try:
        cur = hashlib.sha256(open(f"{ROOT}/{rel}", "rb").read()).hexdigest()
    except FileNotFoundError:
        mismatch.append({"file": rel, "state": "missing"})
        continue
    if cur != h:
        committed = bool(git("log", "--format=%h", f"{BASE}..HEAD", "--", rel))
        uncommitted = bool(git("status", "--porcelain", "--", rel))
        mismatch.append({"file": rel, "baseline_sha256": h, "current_sha256": cur,
                         "changed_in_commits_after_baseline": committed, "uncommitted_working_tree_change": uncommitted})

non_docs_commits = [p for p in git("diff", "--name-only", f"{BASE}..HEAD") if not p.startswith("docs/")]
non_docs_worktree = [l for l in git("status", "--porcelain") if not l[3:].startswith("docs/")]
out = {
    "label": sys.argv[1],
    "baseline_commit": BASE,
    "current_head": git("rev-parse", "HEAD")[0],
    "commits_since_baseline": git("log", "--format=%h %s", f"{BASE}..HEAD"),
    "baseline_files_checked": len(base["files"]),
    "baseline_files_changed": mismatch,
    "non_docs_changes_in_commits_since_baseline": non_docs_commits,
    "non_docs_changes_in_working_tree": non_docs_worktree,
    "git_status_porcelain": git("status", "--porcelain"),
}
json.dump(out, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(json.dumps({k: out[k] for k in ("label", "current_head", "baseline_files_changed", "non_docs_changes_in_commits_since_baseline", "non_docs_changes_in_working_tree")}, ensure_ascii=False, indent=1))
