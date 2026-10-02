"""R3-1: NUBASE2020 원문 전 상태를 앱과 독립된 고정 열 파서로 다시 읽어 앱 내보내기와 필드별로 대조한다 (읽기 전용).

대상: nubase_4.mas20.txt 의 모든 상태 중 IAS(i=8,9) 제외 → 앱 상태(z, n, level)와 짝짓기
필드: 상태 대응, 안정, 반감기 값·단위·추정(#), 반감기 불확도·한계, 붕괴 모드(순서·관계·값·추정),
      Jπ, 여기 에너지, 질량초과·추정, 존재비(값·불확도), 순서 불확실(*)·역전(&), 관측(발견 연도), 비존재(non-exist)
알려진 의도적 변환(문서화된 앱 동작)은 '변환'으로, 그 밖의 차이는 '불일치'로 센다.
사용: python -B full_reparse.py <앱 내보내기 json> <출력 json>
"""
import json
import re
import sys
from collections import Counter, defaultdict

ROOT = "D:/000_rd_workspace/998_nuclide"
exp_path, out_path = sys.argv[1], sys.argv[2]
app = {(r["z"], r["n"], r["level"]): r for r in json.load(open(exp_path, encoding="utf-8"))["nuclides"]}

TOK = re.compile(r"^(\S+?)(=\?|=|<=|>=|<|>|~|\s+\?|\?)(.*)$")


def num(s):
    try:
        return float(str(s).replace(",", "").replace("\u2009", "").replace("\u202f", "").replace("−", "-").rstrip("#"))
    except (TypeError, ValueError):
        return None


def disp_unc(display):
    """패널 문자열에서 '± x' 의 x (천 단위 구분·얇은 공백 제거)"""
    if not display:
        return None
    m = re.search(r"±\s*([0-9][0-9\u2009\u202f,.]*)", display)
    return num(m.group(1)) if m else None


def raw_modes(br):
    out = []
    for tok in [t.strip() for t in br.split(";") if t.strip()]:
        tok = re.sub(r"=\s+\?", "=?", tok)
        if tok.startswith("IS="):
            continue
        m = TOK.match(tok)
        if not m:
            out.append({"mode": tok, "op": None, "val": None, "unc": None, "est": False})
            continue
        rest_s = m.group(3)
        feed = re.search(r"\[([^\]]*)\]", rest_s)  # 딸 상태 feeding 표기, 예: 'B-=100[gs=0,m=100]'
        rest = re.sub(r"\[[^\]]*\]", "", rest_s).split()
        val = rest[0] if rest else None
        out.append({"mode": m.group(1), "op": m.group(2).strip(), "val": val,
                    "unc": rest[1] if len(rest) > 1 else None, "est": bool(val and val.endswith("#")),
                    "feeding": feed.group(1) if feed else None})
    return out


def is_abund(br):
    m = re.search(r"IS=([0-9.]+)(?:\s+(\d+))?", br)
    if not m:
        return None
    v = m.group(1)
    dec = len(v.split(".")[1]) if "." in v else 0
    return float(v), (int(m.group(2)) * 10 ** -dec if m.group(2) else 0.0)


diff = defaultdict(list)       # 필드 → [(상태, 원문, 앱)]
transform = defaultdict(list)  # 의도적 변환
checked = Counter()
raw_keys = set()

for line in open(f"{ROOT}/data/raw/nubase_4.mas20.txt", encoding="latin-1"):
    if line.startswith("#") or len(line) < 20:
        continue
    line = line.rstrip("\n").ljust(209)
    a, z, i = int(line[0:3]), int(line[4:7]), int(line[7])
    if i >= 8:
        continue
    n = a - z
    name = (line[11:16].strip() + line[16].strip())
    raw_keys.add((z, n, i))
    r = app.get((z, n, i))
    if r is None:
        diff["상태 대응"].append((name, "원문에 있음", "앱에 없음"))
        continue
    checked["상태"] += 1
    mass, exc = line[18:31].strip(), line[42:54].strip()
    T, U, dT = line[69:78].strip(), line[78:80].strip(), line[81:88].strip()
    jpi, disc, br = line[88:102].strip(), line[114:118].strip(), line[119:209].strip()
    isom_unc, isom_inv = line[67] == "*", line[68] == "&"

    # 비존재
    nonex = "non-exist" in line[18:54]
    checked["비존재"] += 1
    if nonex != bool(r["non_existent"]):
        diff["비존재"].append((name, nonex, r["non_existent"]))

    # 안정·반감기
    checked["반감기"] += 1
    stable = T == "stbl"
    if stable != bool(r["stable"]):
        diff["안정"].append((name, T, r["stable"]))
    if T in ("stbl",):
        if r["half_life_kind"] != "stable":
            diff["반감기 종류"].append((name, T, r["half_life_kind"]))
    elif T == "p-unst":
        if r["half_life_kind"] != "particle-unbound":
            diff["반감기 종류"].append((name, T, r["half_life_kind"]))
    elif T == "":
        # 값 없이 한계만 있는 상태(예: 18B '<26 ns')는 앱이 그 한계를 반감기 문자열로 둔다
        lim_only = re.match(r"^[<>~]", dT or "")
        if r["half_life_kind"] not in ("unknown", None):
            diff["반감기 종류"].append((name, "(빈칸)", r["half_life_kind"]))
        elif lim_only and (r["half_life"] or "").replace(" ", "") != dT.replace(" ", ""):
            diff["반감기 한계"].append((name, dT, r["half_life"]))
        elif not lim_only and r["half_life"]:
            diff["반감기 종류"].append((name, "(빈칸)", r["half_life"]))
    else:
        if (r["half_life"] or "") != f"{T} {U}":
            diff["반감기 값·단위"].append((name, f"{T} {U}", r["half_life"]))
        if T.endswith("#") != bool(r["half_life_est"]):
            diff["반감기 추정(#)"].append((name, T, r["half_life_est"]))
    # 반감기 불확도·한계
    if dT:
        checked["반감기 불확도"] += 1
        if re.fullmatch(r"[0-9.]+", dT):
            if T not in ("stbl", "p-unst", "") and disp_unc(r["half_life_display"]) != num(dT):
                diff["반감기 불확도"].append((name, dT, r["half_life_display"]))
        elif re.match(r"^[<>~]", dT):
            lim = (r["half_life_limit"] or "").replace(" ", "")
            if lim != dT.replace(" ", ""):
                diff["반감기 한계"].append((name, dT, r["half_life_limit"]))
        else:
            transform["반감기 불확도(기타 형식)"].append((name, dT, r["half_life_display"]))

    # 붕괴 모드
    rm = raw_modes(br)
    am = r["decay_modes"] or []
    if rm or am:
        checked["붕괴"] += 1
        if len(rm) != len(am):
            # 원문 구분자 누락(예: 90Pd 'B+p ? 2p ?')을 앱이 바르게 나눈 경우는 변환으로 기록
            joined = " ".join(f"{x['mode']} ?" if x["op"] == "?" else x["mode"] for x in rm)
            if len(am) > len(rm) and all(y["mode"] in br for y in am):
                transform["원문 구분자 누락 보정"].append((name, br, r["decay_display"]))
            else:
                diff["붕괴 개수"].append((name, br, r["decay_display"]))
        else:
            for x, y in zip(rm, am):
                if x.get("feeding"):
                    # 비교용 내보내기(tools/livechart-diff/export_nuclides.ts)에는 이 note 필드가 없다.
                    # 앱 파서(scripts/build-data/decayModes.ts:28-67)는 보존하고 패널이 원문 그대로 표시함을 화면으로 확인 (r3 evidence/ui)
                    transform["딸 상태 feeding 표기 (내보내기에 없음, 패널 표시 확인)"].append((name, f"{x['mode']}[{x['feeding']}]", r["decay_display"]))
                if x["mode"].lower() != y["mode"].lower():
                    diff["붕괴 모드"].append((name, x["mode"], y["mode"]))
                elif x["op"] == "=?":
                    transform["=? → ?"].append((name, x["mode"], y["rel"]))
                    if y["rel"] != "?":
                        diff["붕괴 관계"].append((name, "=?", y["rel"]))
                elif x["op"] != y["rel"]:
                    diff["붕괴 관계"].append((name, f"{x['mode']}{x['op']}", y["rel"]))
                elif x["val"] is not None and num(x["val"]) != (None if y["ratio"] is None else float(y["ratio"])):
                    diff["붕괴 값"].append((name, f"{x['mode']}{x['op']}{x['val']}", y["ratio"]))
                elif x["est"] != bool(y["est"]):
                    diff["붕괴 추정(#)"].append((name, x["val"], y["est"]))

    # Jπ: 앱은 '*'(직접 측정)를 배지로 옮기고 지운다
    checked["Jπ"] += 1
    if jpi.replace("*", "") != (r["jpi"] or ""):
        (transform if jpi.replace("*", "").strip() == (r["jpi"] or "").strip() else diff)["Jπ"].append((name, jpi, r["jpi"]))

    # 여기 에너지
    if i > 0:
        checked["여기 에너지"] += 1
        if not nonex and num(exc) != num(r["exc_kev"]):
            diff["여기 에너지"].append((name, exc, r["exc_kev"]))

    # 질량초과
    if not nonex:
        checked["질량초과"] += 1
        if num(mass) != num(r["mass_excess_kev"]):
            diff["질량초과"].append((name, mass, r["mass_excess_kev"]))
        if mass.endswith("#") != bool(r["mass_excess_est"]):
            diff["질량초과 추정(#)"].append((name, mass, r["mass_excess_est"]))

    # 존재비
    ab = is_abund(br)
    if ab or r["abundance_pct"] is not None:
        checked["존재비"] += 1
        if not ab or r["abundance_pct"] is None:
            diff["존재비 유무"].append((name, br, r["abundance_pct"]))
        else:
            if abs(ab[0] - float(r["abundance_pct"])) > 1e-12:
                diff["존재비 값"].append((name, ab[0], r["abundance_pct"]))
            du = disp_unc(r["abundance_display"])
            if (ab[1] == 0 and du is not None) or (ab[1] > 0 and (du is None or abs(du - ab[1]) > 1e-9 * max(1, ab[1]))):
                diff["존재비 불확도"].append((name, ab[1], r["abundance_display"]))
            if not re.match(r"^\d", r["abundance_display"] or "") or re.match(r"^0\d", r["abundance_display"] or ""):
                diff["존재비 표기"].append((name, ab[0], r["abundance_display"]))

    # 순서 플래그
    checked["순서 플래그"] += 1
    if isom_unc != bool(r["order_uncertain"]):
        diff["순서 불확실(*)"].append((name, isom_unc, r["order_uncertain"]))
    if isom_inv != bool(r["order_inverted"]):
        diff["순서 역전(&)"].append((name, isom_inv, r["order_inverted"]))

    # 관측(바닥상태): 앱은 발견 연도로 정의
    if i == 0:
        checked["관측"] += 1
        if bool(disc) != bool(r["observed"]):
            diff["관측"].append((name, disc, r["observed"]))

extra = [r["id"] for k, r in app.items() if k not in raw_keys]
summary = {
    "raw_states_excluding_IAS": len(raw_keys),
    "app_states": len(app),
    "app_only": extra,
    "checked": dict(checked),
    "mismatch_counts": {k: len(v) for k, v in diff.items()},
    "transform_counts": {k: len(v) for k, v in transform.items()},
}
json.dump({"summary": summary, "mismatches": diff, "transforms": transform},
          open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
print(json.dumps(summary, ensure_ascii=False, indent=1))
for k, v in diff.items():
    print("==", k, len(v))
    for x in v[:8]:
        print("  ", x)
