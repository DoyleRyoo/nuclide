"""R3-5: 이성질체가 있는 핵종마다 IAEA LiveChart `levels`를 받는다 (읽기 전용, 공개 API).

API 안내: nuclides=all은 ground_states에만 허용 → 핵종당 1회 요청. 1초 간격, 오류 시 대기 후 최대 3회 재시도.
이미 받은 파일은 건너뛴다(중단 후 이어 받기 가능).
사용: python -B fetch_levels.py <앱 내보내기 json> <저장 폴더> <manifest.tsv>
"""
import hashlib
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone, timedelta

exp_path, out_dir, manifest = sys.argv[1], sys.argv[2], sys.argv[3]
KST = timezone(timedelta(hours=9))
os.makedirs(out_dir, exist_ok=True)
recs = json.load(open(exp_path, encoding="utf-8"))["nuclides"]
targets = sorted({(r["a"], r["symbol"], r["z"]) for r in recs if r["is_isomer"]}, key=lambda t: (t[2], t[0]))
new_manifest = not os.path.exists(manifest)
mf = open(manifest, "a", encoding="utf-8")
if new_manifest:
    mf.write("name\turl\tqueried_at\thttp\tbytes\tsha256\n")
done = fail = 0
for a, sym, _z in targets:
    name = f"{a}{sym.lower()}"
    path = os.path.join(out_dir, f"{name}_levels.csv")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        continue
    url = f"https://nds.iaea.org/relnsd/v1/data?fields=levels&nuclides={name}"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "nuclide-map-conformity-check/2026-10-02 (read-only)"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                body, code = resp.read(), resp.status
            break
        except Exception as e:  # noqa: BLE001
            body, code = b"", getattr(e, "code", str(e))
            time.sleep(10 * (attempt + 1))
    if body:
        open(path, "wb").write(body)
        done += 1
    else:
        fail += 1
    mf.write(f"{name}\t{url}\t{datetime.now(KST).isoformat(timespec='seconds')}\t{code}\t{len(body)}\t{hashlib.sha256(body).hexdigest() if body else ''}\n")
    mf.flush()
    time.sleep(1.0)
print(json.dumps({"targets": len(targets), "fetched_now": done, "failed_now": fail}))
