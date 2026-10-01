#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
golden_set.py — 검증 프롬프트 골든 테스트 핵종의 '내 데이터 / 화면 표시 / LiveChart 참조값' 표 → golden_set.md

  python golden_set.py              nuclides_export.json + LiveChart 단건 API (받은 CSV는 livechart_live/ 재사용)
  python golden_set.py --refresh    LiveChart 다시 받기

참조: 바닥상태 = fields=ground_states, 이성질체 = fields=levels (내 들뜬 에너지와 가장 가까운, 반감기 있는 준위)
표준 라이브러리만 사용. livechart_diff.py와 같은 폴더에 둘 것.
"""

import argparse
import csv
import datetime as dt
import io
import json
import os
import sys
import time
import urllib.request

sys.dont_write_bytecode = True          # 도구 폴더에 __pycache__를 남기지 않음
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import livechart_diff as L  # noqa: E402

HERE = L.SCRIPT_DIR
URL = "https://nds.iaea.org/relnsd/v1/data?fields={}&nuclides={}"

# (내 데이터 id, LiveChart 이름, 참조 종류, 이 핵종을 고른 이유)
GOLDEN = [
    ("K-40", "40k", "ground_states", "β⁻/EC 분기, 자연 방사성"),
    ("Bi-209", "209bi", "ground_states", "'안정'으로 오인되던 α 붕괴 핵종"),
    ("Te-130", "130te", "ground_states", "2β⁻ 초장반감기"),
    ("Ta-180m", "180ta", "levels", "자연에 있는 유일한 안정(관측상) 이성질체"),
    ("Am-242m", "242am", "levels", "바닥상태보다 오래 사는 이성질체"),
    ("Tc-99m", "99tc", "levels", "IT 이성질체 (의료용)"),
    ("Hf-178m2", "178hf", "levels", "고에너지 장수명 이성질체 (m2)"),
    ("Cs-137", "137cs", "ground_states", "대표 핵분열 생성물"),
    ("Bi-212", "212bi", "ground_states", "β⁻/α 분기"),
    ("Cf-252", "252cf", "ground_states", "α/SF 분기"),
    ("Li-11", "11li", "ground_states", "β⁻ 지연 다중 중성자 방출"),
    ("He-5", "5he", "ground_states", "입자 비속박 — 준위 폭으로 주어짐"),
    ("Be-8", "8be", "ground_states", "2α 붕괴, 준위 폭"),
    ("F-18", "18f", "ground_states", "β⁺/EC (PET)"),
    ("Cu-64", "64cu", "ground_states", "β⁺/EC/β⁻ 세 갈래"),
    ("Og-294", "294og", "ground_states", "초중원소, 통계 적은 반감기"),
    ("Li-6", "6li", "ground_states", "존재비 (CIAAW 구간 원소)"),
    ("Li-7", "7li", "ground_states", "존재비 (CIAAW 구간 원소)"),
    ("Pb-204", "204pb", "ground_states", "존재비 (CIAAW 구간 원소)"),
    ("Pb-206", "206pb", "ground_states", "존재비 (CIAAW 구간 원소)"),
    ("Pb-207", "207pb", "ground_states", "존재비 (CIAAW 구간 원소)"),
    ("Pb-208", "208pb", "ground_states", "존재비 (CIAAW 구간 원소)"),
]


def fetch(field, name, refresh):
    """단건 CSV → [행 dict]. 열 이름이 겹치면(levels의 unc_hl 두 번) 두 번째에 '_sec'를 붙임"""
    cache = os.path.join(HERE, "livechart_live", f"{name}.csv" if field == "ground_states" else f"{name}_{field}.csv")
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    if refresh or not os.path.exists(cache):
        req = urllib.request.Request(URL.format(field, name), headers={"User-Agent": L.USER_AGENT})
        with urllib.request.urlopen(req, timeout=120) as resp:
            text = resp.read().decode("utf-8-sig", errors="replace")
        with open(cache, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        time.sleep(0.5)
    with open(cache, encoding="utf-8") as f:
        reader = csv.reader(io.StringIO(f.read().lstrip("\ufeff")))
        header, seen = [], set()
        for h in next(reader):
            h = h.strip()
            header.append(h + "_sec" if h in seen else h)
            seen.add(h)
        return [dict(zip(header, (v.strip() for v in row))) for row in reader if row and any(row)]


def ensdf_unc(value, unc):
    """ENSDF 표기 불확도(마지막 자릿수 기준) → 절댓값 문자열. '12.1', '11' → '1.1' / '0.58', '+44-18' → '+0.44 −0.18'"""
    if not unc:
        return ""
    mant, _, exp = value.upper().partition("E")
    dec = len(mant.split(".")[1]) if "." in mant else 0
    suffix = f"E{exp}" if exp else ""

    def one(u):
        if "." in u:                                 # 이미 절댓값
            return u + suffix
        return f"{int(u) * 10.0 ** -dec:.{dec}f}{suffix}"

    if unc.startswith("+") and "-" in unc:
        plus, minus = unc[1:].split("-", 1)
        return f"+{one(plus)} −{one(minus)}"
    return f"± {one(unc)}"


def ref_half_life_text(r):
    hl, unit = r.get("half_life", ""), r.get("unit_hl", "")
    if not hl:
        return "(반감기 없음)"
    if hl.upper() == "STABLE":
        return "STABLE"
    op = L.OP_TEXT.get(r.get("operator_hl", ""), "")
    t = f"{op}{hl} {unit} {ensdf_unc(hl, r.get('unc_hl', ''))}".strip()
    if unit.lower() in L.ENERGY_UNITS:                # 준위 폭 → 반감기
        sec = L.to_float(r.get("half_life_sec"))
        flip = L.OP_TEXT.get(L.FLIP_OP.get(r.get("operator_hl", ""), ""), "")
        t += f" (폭 → T½ {flip}{L.human_sec(sec)})" if sec else ""
    return t


def ref_decay_text(r):
    out = []
    for i in (1, 2, 3):
        m = r.get(f"decay_{i}", "")
        if m:
            p, u = r.get(f"decay_{i}_%", ""), r.get(f"unc_{i}", "")
            out.append(f"{m} {p}%" + (f" [{u}]" if u else "") if p else f"{m} (세기 없음)")
    return "; ".join(out) or "(없음)"


def pick_level(levels, exc):
    """내 들뜬 에너지와 가장 가까운, 반감기가 있는 준위"""
    e0 = L.to_float(exc)
    cands = [r for r in levels if r.get("half_life") and L.to_float(r.get("energy")) is not None]
    if e0 is None or not cands:
        return None
    return min(cands, key=lambda r: abs(L.to_float(r["energy"]) - e0))


def md(s):
    return str(s).replace("|", "\\|").replace("\n", " / ")


def main():
    ap = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap.add_argument("--data", default=os.path.join(HERE, "nuclides_export.json"))
    ap.add_argument("--out", default=os.path.join(HERE, "golden_set.md"))
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    with open(args.data, encoding="utf-8") as f:
        recs = {r["id"]: r for r in json.load(f)["nuclides"]}
    today = dt.date.today().isoformat()
    rows, dates = [], set()
    for nid, name, field, why in GOLDEN:
        mine = recs[nid]
        got = fetch(field, name, args.refresh)
        if field == "levels":
            ref = pick_level(got, mine["exc_kev"])
        else:
            ref = got[0] if got else None
        if ref is None:
            rows.append((nid, why, "참조", "", "", "LiveChart에서 찾지 못함", ""))
            continue
        date = ref.get("Extraction_date", "")
        dates.add(date)
        items = []
        if field == "levels":
            e_ref = f"{ref.get('energy_shift', '')}{ref['energy']} keV" + (f" ± {ref['unc_e']}" if ref.get("unc_e") else "")
            items.append(("들뜬 에너지", f"{mine['exc_kev']} keV", f"{mine['exc_kev']} keV", e_ref))
        items.append(("반감기", mine["half_life"] or mine["half_life_kind"],
                      mine["half_life_display"] + (f" ({mine['half_life_human']})" if mine["half_life_human"] else "")
                      + (f" · 칸: {mine['cell_label']['halfLife']}" if mine.get("cell_label") else ""),
                      ref_half_life_text(ref)))
        items.append(("붕괴", "; ".join(f"{d['mode']} {d['rel'] if d['rel'] != '=' else ''}{d['ratio'] if d['ratio'] is not None else ''}"
                                        .strip() for d in mine["decay_modes"]) or "(없음)",
                      mine["decay_display"] or "(없음)", ref_decay_text(ref)))
        items.append(("J^π", mine["jpi"] or "", mine["jpi_display"] or "—", ref.get("jp", "") or "—"))
        if mine["abundance_pct"] or ref.get("abundance"):
            ab_ref = (f"{ref['abundance']} %" + (f" ± {ref['unc_a']}" if ref.get("unc_a") else "")) if ref.get("abundance") else "—"
            items.append(("존재비", f"{mine['abundance_pct']} %" if mine["abundance_pct"] else "—",
                          mine["abundance_display"] or "—", ab_ref))
        for item, raw, shown, refv in items:
            rows.append((nid, why if item == items[0][0] else "", item, raw, shown, refv, date))

    L_ = ["# 골든 세트 — 내 데이터 · 화면 표시 · LiveChart 참조값", "",
          f"- 작성: {today} · `tools/livechart-diff/golden_set.py`로 다시 만들 수 있음",
          "- 내 데이터: `nuclides_export.json` (= 앱의 `src/data/generated/*.json`을 `hydrate()`한 값, NUBASE2020·AME2020)",
          "- 참조: IAEA LiveChart 단건 API — 바닥상태 `fields=ground_states`, 이성질체 `fields=levels` "
          "(내 들뜬 에너지와 가장 가까운, 반감기 있는 준위). Extraction_date "
          + ", ".join(sorted(d for d in dates if d)),
          "- '내 데이터 값' = 저장된 원문 값, '화면 표시' = 패널 문자열(`format.ts`). 판정은 하지 않음 — 값만 나란히 둠",
          "- 참조 분기비의 `[ ]` = API의 불확도 열 원문, 반감기 불확도는 ENSDF 표기(마지막 자릿수)를 절댓값으로 바꿔 적음", "",
          "| 핵종 | 고른 이유 | 항목 | 내 데이터 값 | 화면 표시 | LiveChart 참조값 | 조회일 |",
          "|---|---|---|---|---|---|---|"]
    prev = None
    for nid, why, item, raw, shown, refv, date in rows:
        L_.append(f"| {nid if nid != prev else ''} | {md(why)} | {item} | {md(raw)} | {md(shown)} | {md(refv)} | {date} |")
        prev = nid
    L_ += ["", "## 화면 표시 규칙 (데이터 값과 표시값이 다른 이유)", "",
           "- 반감기 단위: `m` → `min`, `us` → `μs`, 나머지는 원문 (`formatUnit`). 칸(차트)에는 불확도 없이 짧게 (`formatHalfLifeShort`)",
           "- 반감기 1분 이상이면 사람이 읽는 값 `≈ …`을 덧붙임 (1 y = 365.2422 d, 3자리 반올림 — `formatHalfLifeHuman`)",
           "- 안정 핵종 칸: 반감기 대신 자연 존재비를 보여 줌. 관측상 안정은 패널에 `안정 (> 하한)`",
           "- `#`(계통 추정): 값 뒤 `#` + '추정' 배지. J^π의 `*`(직접 측정)는 '측정' 배지로 바뀌고 `-`는 `−`로",
           "- 존재비·분기비 불확도: NUBASE의 마지막 자릿수 표기를 절댓값으로 바꿔 표시 (`0.7204 6` → `0.7204 ± 0.0006`)",
           "- 작은 분기비는 `× 10ⁿ` 표기, 세기 미상은 `?`",
           "- 붕괴 배지 `β+` = NUBASE `B+` = EC + β⁺ 합계 (LiveChart 표기 `EC+B+`). 예: ⁴⁰K 화면 `β+ 10.72 %` ↔ "
           "LiveChart `EC+B+ 10.72%` — 배지만 보면 양전자 방출만으로 읽힐 수 있음",
           "- 원자 질량(패널): AME μu 값을 불확도 유효숫자 2자리로 반올림한 뒤 u로 바꿔 표시 (`formatAtomicMass`)",
           ""]
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(L_))
    print(f"작성: {args.out} ({len(GOLDEN)}개 핵종)")


if __name__ == "__main__":
    main()
