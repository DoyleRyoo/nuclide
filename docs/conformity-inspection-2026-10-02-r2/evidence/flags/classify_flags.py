"""1차 전수 비교의 치명·높음 자동 플래그 318건을 원인별로 분류한다 (읽기 전용).

입력
  - 1차 diff 결과:   docs/conformity-inspection-2026-10-02/evidence/livechart-diff/diff_details.csv
  - 앱 값(1차 생성): docs/conformity-inspection-2026-10-02/evidence/nuclides-export.json
  - NUBASE2020 원문: data/raw/nubase_4.mas20.txt  (앱 파서와 독립된 고정 열 파서로 읽음)
  - NUBASE2020 논문 Table I 텍스트 (pdftotext -layout): 참조 키·갱신 코드·주석
  - LiveChart 참조: tools/livechart-diff/livechart_ground_states.csv, livechart_live/*.csv (1차 캐시)
출력: CSV(전건) + JSON(집계)

판정 규칙은 문서(02-flag-classification.md)에 적었다. 저장소 파일은 쓰지 않는다.
"""
import csv
import importlib.util
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime

sys.dont_write_bytecode = True
ROOT = "D:/000_rd_workspace/998_nuclide"
R1 = f"{ROOT}/docs/conformity-inspection-2026-10-02/evidence"
NUBASE_CUTOFF = date(2020, 10, 30)  # NUBASE2020 §1: "All experimental data available to the authors by October 30, 2020"

pdf_txt, out_csv, out_json = sys.argv[1], sys.argv[2], sys.argv[3]

# diff 도구의 붕괴 묶음 정의를 그대로 쓴다 (읽기 전용 import, 바이트코드 미생성)
spec = importlib.util.spec_from_file_location("lcd", f"{ROOT}/tools/livechart-diff/livechart_diff.py")
lcd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lcd)

# ---------- NUBASE 원문 (독립 고정 열 파서) ----------
raw = {}
for line in open(f"{ROOT}/data/raw/nubase_4.mas20.txt", encoding="latin-1"):
    if line.startswith("#") or len(line) < 20:
        continue
    line = line.rstrip("\n").ljust(209)
    a, zzzi = int(line[0:3]), line[4:8]
    z, i = int(zzzi[:3]), int(zzzi[3])
    raw[(z, a - z, i)] = {
        "line": line.rstrip(),
        "name": line[11:16].strip(),
        "T": line[69:78].strip(),
        "unit": line[78:80].strip(),
        "dT": line[81:88].strip(),
        "jpi": line[88:102].strip(),
        "ens": line[102:104].strip(),
        "disc": line[114:118].strip(),
        "br": line[119:209].strip(),
    }

TOK = re.compile(r"^(\S+?)(=\?|=|<=|>=|<|>|~|\s+\?|\?)(.*)$")


def raw_modes(br):
    out = []
    for tok in [t.strip() for t in br.split(";") if t.strip()]:
        tok = re.sub(r"=\s+\?", "=?", tok)  # 원문은 '=?'를 'B+p= ?'처럼 공백을 두고 쓰기도 한다
        if tok.startswith("IS="):
            continue
        m = TOK.match(tok)
        if not m:
            out.append((tok, None, None, None))
            continue
        mode, op, rest = m.group(1), m.group(2).strip(), m.group(3).split()
        val = rest[0] if rest else None
        unc = rest[1] if len(rest) > 1 else None
        out.append((mode, op, val, unc))
    return out


def fnum(s):
    try:
        return float(str(s).rstrip("#"))
    except (TypeError, ValueError):
        return None


# ---------- 앱 값 ----------
exp = json.load(open(f"{R1}/nuclides-export.json", encoding="utf-8"))["nuclides"]
app_gs = {(r["z"], r["n"]): r for r in exp if not r["is_isomer"]}
app_iso = defaultdict(list)
for r in exp:
    if r["is_isomer"]:
        app_iso[(r["z"], r["n"])].append(r)


def app_matches_raw_T(app, rw):
    """앱 반감기 문자열·불확도가 원문 열과 같은지 (단위 m→min 등 표시 변환은 허용)"""
    unit_map = {"m": "min", "us": "μs"}
    t = rw["T"]
    if t in ("stbl", "p-unst", ""):
        return None
    hl = app.get("half_life") or ""
    v_ok = fnum(hl.split()[0] if hl else None) == fnum(t.lstrip("<>~")) if hl else False
    u_ok = hl.split()[-1] in (rw["unit"], unit_map.get(rw["unit"], rw["unit"])) if hl else False
    disp = app.get("half_life_display") or ""
    if rw["dT"] and re.fullmatch(r"[0-9.#]+", rw["dT"]):
        d_ok = (" ± " in disp) and fnum(disp.split(" ± ")[1].split()[0]) == fnum(rw["dT"])
    elif rw["dT"]:  # 한계·비대칭·근사 등
        d_ok = None
    else:
        d_ok = " ± " not in disp
    return bool(v_ok and u_ok and (d_ok is not False)), {"value": v_ok, "unit": u_ok, "unc": d_ok}


def app_matches_raw_D(app, rw):
    """앱 붕괴 목록이 원문 순서·값·관계와 같은지. '=?'→'?' 통합(SCI-03)은 별도 표시"""
    rm = raw_modes(rw["br"])
    am = app.get("decay_modes") or []
    if len(rm) != len(am):
        return False, "개수 다름"
    sci03 = False
    for (mode, op, val, _), x in zip(rm, am):
        if mode.lower() != x["mode"].lower():
            return False, f"모드 {mode}≠{x['mode']}"
        if op == "=?":
            sci03 = True
            if x["rel"] != "?":
                return False, "=? 처리"
            continue
        if op != x["rel"]:
            return False, f"{mode} 관계 {op}≠{x['rel']}"
        if val is not None and fnum(val) != (x["ratio"] if x["ratio"] is None else float(x["ratio"])):
            return False, f"{mode} 값 {val}≠{x['ratio']}"
    return True, "=? 통합(SCI-03)" if sci03 else ""


# ---------- LiveChart 참조 ----------
def load_csv(path):
    return list(csv.DictReader(open(path, encoding="utf-8-sig")))


bulk = {(int(r["z"]), int(r["n"])): r for r in load_csv(f"{ROOT}/tools/livechart-diff/livechart_ground_states.csv")}


def lc_row(z, n, a, sym, live):
    if live:
        p = f"{ROOT}/tools/livechart-diff/livechart_live/{a}{sym.lower()}.csv"
        try:
            rows = load_csv(p)
            if rows:
                return rows[0], "단건 캐시(2026-10-01)"
        except FileNotFoundError:
            pass
    return bulk.get((z, n)), "일괄 스냅샷(2026-10-01)"


def parse_cut(s):
    s = re.sub(r"-SEPT-", "-SEP-", (s or "").strip(), flags=re.I)  # LiveChart에 '29-SEPT-2014' 같은 표기가 있다
    for fmt in ("%d-%b-%Y", "%Y-%m-%d", "%d-%B-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except (ValueError, AttributeError):
            pass
    return None


# ---------- NUBASE2020 Table I 텍스트: 참조 키·코드·주석 ----------
# pdftotext -raw 출력: 표 한 행·주석 한 줄이 각각 한 줄로 나온다 (-layout은 위첨자 때문에 행이 섞임)
pdf = open(pdf_txt, encoding="utf-8", errors="replace").read().splitlines()
COMMENT = re.compile(r"^(\d{1,3})([A-Z][a-z]?)\s+([METJDI])\s*:\s?(.*?)\s*$")
comments = defaultdict(list)  # (A, El, '', code) -> [text]  바닥상태 주석만 (이성질체는 'Ym', 'Nbm'처럼 붙음)
for ln in pdf:
    m = COMMENT.match(ln)
    if m:
        comments[(int(m.group(1)), m.group(2), "", m.group(3))].append(m.group(4))


def table_ref(a, el, rw):
    """바닥상태 행의 'Ens Reference 코드 Discovery'를 원문 연도로 고정해서 찾는다"""
    head = re.compile(rf"^{a}{el}\s")
    if not rw["disc"]:
        return None, None, None
    disc = re.escape(rw["disc"])
    ens = rf"\s{re.escape(rw['ens'])}" if rw["ens"] else ""  # ENSDF 연도가 빈 행도 있다 (예: 240Es)
    for ln in pdf:
        if " : " in ln or not head.match(ln):
            continue
        m = re.search(rf"{ens}\s+({NSR})\s+([METJDI]{{1,4}})\s+{disc}\b", ln)
        if m:
            return m.group(1), m.group(2), ln.strip()
        if rw["ens"] and re.search(rf"{ens}\s+{disc}\b", ln):
            return "", "", ln.strip()
    return None, None, None


NSR = r"\d\d[A-Z][A-Za-z][0-9A-Z.]{2,3}|AHW|GAU|HWJ|FGK\w*|MMC|SAR|WGM|Mirror|Imme"
NSR_IN_TEXT = re.compile(r"\b(\d\d)[A-Z][A-Za-z][0-9A-Z.]{2}\b")


def key_year(k):
    m = re.match(r"^(\d\d)[A-Z]", k or "")
    if not m:
        return None
    y = int(m.group(1))
    return 2000 + y if y <= 21 else 1900 + y


def latest_cited_year(keys_text):
    ys = [2000 + int(y) if int(y) <= 21 else 1900 + int(y) for y in NSR_IN_TEXT.findall(keys_text or "")]
    return max(ys) if ys else None


# 원문(NUBASE2020) 자체의 오기로 판단한 항목 — 근거는 02-flag-classification.md §4와 nubase-consistency.json
SOURCE_ERRATA = {
    "164Ho": "원문 'EC=61 1;B+=39 1': 합계(B+)가 내역(EC)보다 작고, QEC=987 keV<1022 keV라 양전자 방출 불가. "
             "Qβ−=962 keV로 β− 가능, LiveChart EC+β+ 60(5)%·β− 40(5)% → β−를 B+로 잘못 적은 것으로 판단",
    "182Pt": "원문 'B+=0.962 2;A=0.038 2': 합 1.000%. LiveChart EC+β+ 99.962(2)% → 앞자리 '99.' 누락으로 판단",
    "151Ho": "원문 'B+=88 3;A=22 3': 합 110%. LiveChart EC+β+ 78(3)%·α 22(3)% → 78을 88로 잘못 적은 것으로 판단",
    "138Cs": "원문 '33.5 m 0.2'에 NUBASE 자체 참조·주석 없음(ENSDF 연도 17). ENSDF 2017 채택값 32.5(2) m = 측정 7개 비가중 평균 32.49. "
             "어떤 평균으로도 33.5가 나오지 않음. NUBASE2016은 33.41(18) → 2020 옮겨 적기 오류로 판단 (확신 중간)",
}
SOURCE_ERRATA_CONF = {"138Cs": "중간"}

# 수동 확인(ENSDF 채택 문서·NUBASE2016 대조)으로 정한 분류. 근거 파일은 evidence/flags/nndc/
MANUAL = {
    "250Fm": ("L", "높음", "ENSDF 2001: %α > 90, %ε < 10. LiveChart API가 부등호를 버려 '90'으로 보임 → NUBASE α~100과 양립"),
    "266Mt": ("L", "높음", "ENSDF 2019: %α > 75, %SF < 25. API '75'는 하한 → NUBASE α~100과 양립"),
    "260Lr": ("L", "높음", "ENSDF 1998: %α = 80(20), %ε < 40. API 'EC/B+ 40'은 상한 → NUBASE β+ 20(20)과 양립"),
    "183Pb": ("L", "중간", "ENSDF 2015: %α ≈ 90. API가 '≈'를 버림. NUBASE α~100과 둘 다 근삿값"),
    "156Lu": ("L", "중간", "ENSDF 2012: %ε ≈ 5, %α ≈ 95. API가 '≈'를 버림. NUBASE A=100과 근삿값 차이"),
    "117La": ("P", "높음", "ENSDF 2009: %p 93.9(7)은 'T½(ε+β+)=388.3 ms(1997Mo25 이론) 가정'으로 산출. NUBASE는 관측 p~100, β+ ?"),
    "150Lu": ("P", "높음", "ENSDF 2013: %p 70.9(19)은 'T½(ε+β+)=155 ms(1997Mo25 이론) 가정'으로 산출. NUBASE는 관측 p~100, β+ ?"),
    "212Ac": ("P", "높음", "ENSDF 2020: %α = 95 CA, %ε = 5 CA (계산값). NUBASE는 관측 α~100, β+ ?"),
    "229Am": ("R", "높음", "NuDat의 최신 ENSDF(Nucl. Data Sheets 208, 397 (2026))는 %α = 100 → 앱과 일치. LiveChart 스냅샷은 2015 평가(91%)"),
    "199Rn": ("N", "중간", "ENSDF 2006: %ε = 6, %α = 94 (불확도 없음). NUBASE α~100, β+ ? — 근삿값 대 무불확도 값"),
    "93Rh": ("C", "중간", "ENSDF 2010: 11.9(7) s(2004De40)와 13.9(16) s(2001Ki13) 가중평균 12.2(7) s. NUBASE는 2001Ki13 단일값, 제외 사유 미기재. NUBASE2016도 13.9"),
    "188Pb": ("C", "중간", "ENSDF 2018: 25.5(1) s 중심 가중평균 25.5(1) s. NUBASE2020 25.1(1) s는 NUBASE2016(ENSDF 2002 기반)과 같음 → 2018 평가 미반영으로 추정, 사유 미기재"),
    "152Cs": ("C", "중간", "ENSDF 2018: T½ > 50 ms (1987Ra12 비행시간 하한). NUBASE2020 추정 17# ms(2016은 30# ms)가 이 하한과 모순, 사유 미기재"),
    "161Hf": ("C", "중간", "ENSDF 2014: %α < 0.13 (API는 부등호 손실). NUBASE2016도 A<0.13이었으나 NUBASE2020은 A=0.29(5) 측정값 — 근거 키 미추출"),
}


# ---------- 분류 ----------
CLASSES = {
    "E": "NUBASE2020 원문 자체의 오기로 판단 (앱 = 원문, 앱 화면에 틀린 값이 그대로 나옴)",
    "A1": "NUBASE2020이 참조 ENSDF 평가 이후 문헌까지 검토해 재평가 (앱 = 원문)",
    "A2": "NUBASE2020이 주석·참조로 근거를 밝힌 평가 선택 차이 (앱 = 원문, 같은 문헌을 다르게 채택)",
    "P": "평가 정책 차이: ENSDF 분기비가 이론 부분반감기 가정·계산(CA)값 (앱 = 원문)",
    "B": "참조 ENSDF 평가가 NUBASE2020 마감(2020-10-30) 이후 (앱 = 원문, 차기 평가본 반영 검토)",
    "R": "참조 스냅샷이 구버전 — 최신 ENSDF는 앱 값과 일치",
    "S": "NUBASE2020 원문에 해당 모드 없음·표기 체계 차이 (앱 = 원문, 파서 누락 아님)",
    "N": "NUBASE 근삿값(~100)과 참조 측정값의 차이 (앱 = 원문, 다른 모드를 '?'로 둔 평가)",
    "L": "비교 산물: LiveChart API가 분기비의 >, <, ≈ 기호를 버려 한계·근삿값이 측정값처럼 비교됨",
    "W": "참조가 준위 폭(Γ) — 폭 출처·환산 차이 (앱 = 원문)",
    "C": "앱 = 원문이나 차이 원인 미확정",
    "D": "앱 ≠ 원문 — 파서·표시 확인 필요",
}

flags = [r for r in load_csv(f"{R1}/livechart-diff/diff_details.csv") if r["심각도"] in ("치명", "높음")]
rows_out = []
for f in flags:
    z, n, a = int(f["Z"]), int(f["N"]), int(f["A"])
    live = "단건 API" in f["메모"]
    rw = raw.get((z, n, 0))
    app = app_gs.get((z, n))
    sym = app["symbol"] if app else ""
    lc, lc_src = lc_row(z, n, a, sym, live)
    cut = parse_cut(lc.get("ENSDFpublicationcut-off", "")) if lc else None
    is_T = f["항목"] == "반감기"
    code = "T" if is_T else "D"
    if is_T:
        ok, detail = app_matches_raw_T(app, rw) if rw and app else (False, {})
    else:
        ok, detail = app_matches_raw_D(app, rw) if rw and app else (False, "")
    ref_key, ref_codes, tline = table_ref(a, sym, rw) if rw else (None, None, None)
    cm = comments.get((a, sym, "", code), [])
    cm_text = " ".join(cm)
    ref_updates_q = bool(ref_codes and code in ref_codes)
    ref_y = key_year(ref_key)
    width = bool(re.search(r"\beV\b|keV|MeV", f["참조값"]))

    missing_fam = None
    raw_has_fam = None
    if f["범주"] == "붕괴 모드 누락":
        m = re.search(r"(\S+) 없음", f["메모"])
        missing_fam = m.group(1) if m else None
        fams = {lcd.mode_family(lcd.canon_mode(md)) for md, *_ in raw_modes(rw["br"])} if rw else set()
        raw_has_fam = missing_fam in fams if missing_fam else None

    cited = " ".join([ref_key or "" if ref_updates_q else "", cm_text])
    cited_y = latest_cited_year(cited)
    approx = (not is_T) and bool(re.search(r"(^|;)[A-Za-z0-9+\-]+~", rw["br"] if rw else ""))

    if not ok:
        cls, conf = "D", "검토 필요"
    elif f["핵종"] in SOURCE_ERRATA:
        cls, conf = "E", SOURCE_ERRATA_CONF.get(f["핵종"], "높음")
    elif f["범주"] == "붕괴 모드 누락" and raw_has_fam is False:
        cls, conf = "S", "높음"
    elif f["핵종"] in MANUAL:
        cls, conf = MANUAL[f["핵종"]][:2]
    elif cut and cut > NUBASE_CUTOFF:
        cls, conf = "B", "중간"
    elif ref_updates_q or cm:
        newer = cited_y is not None and cut is not None and cited_y > cut.year
        cls, conf = ("A1", "높음") if newer else ("A2", "중간")
    elif approx:
        cls, conf = "N", "중간"
    elif is_T and width:
        cls, conf = "W", "중간"
    else:
        cls, conf = "C", "낮음"

    rows_out.append({
        "심각도": f["심각도"], "범주": f["범주"], "핵종": f["핵종"], "Z": z, "N": n,
        "앱 값": f["내 값"], "참조값": f["참조값"], "차이": f["차이"], "diff 메모": f["메모"],
        "분류": cls, "확신": conf,
        "앱=원문": "예" if ok else "아니오", "원문 대조 상세": json.dumps(detail, ensure_ascii=False) if isinstance(detail, dict) else detail,
        "NUBASE 원문 반감기": f"{rw['T']} {rw['unit']} {rw['dT']}".strip() if rw else "",
        "NUBASE 원문 붕괴": rw["br"] if rw else "",
        "NUBASE ENSDF 연도": rw["ens"] if rw else "",
        "NUBASE Table I 참조(코드)": f"{ref_key} {ref_codes}".strip() if ref_key else ("없음" if ref_key == "" else "추출 실패"),
        "참조 연도": ref_y or "",
        "NUBASE 주석 코드": code,
        "NUBASE 주석": cm_text,
        "NUBASE 인용 최신 연도": cited_y or "",
        "원문 오기 근거": SOURCE_ERRATA.get(f["핵종"], ""),
        "수동 확인 메모": MANUAL[f["핵종"]][2] if f["핵종"] in MANUAL and cls == MANUAL[f["핵종"]][0] else "",
        "누락 묶음": missing_fam or "", "원문에 묶음 존재": "" if raw_has_fam is None else ("예" if raw_has_fam else "아니오"),
        "LiveChart 출처": lc_src,
        "LiveChart ENSDF cutoff": cut.isoformat() if cut else (lc.get("ENSDFpublicationcut-off", "") if lc else ""),
        "LiveChart ENSDF 저자": lc.get("ENSDFauthors", "") if lc else "",
        "cutoff > NUBASE 마감": "" if not cut else ("예" if cut > NUBASE_CUTOFF else "아니오"),
    })

with open(out_csv, "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows_out[0].keys()))
    w.writeheader()
    w.writerows(rows_out)

summary = {
    "flags": len(rows_out),
    "nuclides": len({r["핵종"] for r in rows_out}),
    "classes": CLASSES,
    "by_class": Counter(r["분류"] for r in rows_out),
    "by_category_class": Counter(f"{r['심각도']}|{r['범주']}|{r['분류']}" for r in rows_out),
    "app_equals_raw": Counter(r["앱=원문"] for r in rows_out),
    "table_ref_extraction": Counter(
        "추출 실패" if r["NUBASE Table I 참조(코드)"] == "추출 실패" else "성공" for r in rows_out),
    "with_nubase_comment": sum(1 for r in rows_out if r["NUBASE 주석"]),
    "cutoff_after_nubase": Counter(r["cutoff > NUBASE 마감"] for r in rows_out),
}
json.dump(summary, open(out_json, "w", encoding="utf-8"), ensure_ascii=False, indent=2, default=dict)
print(json.dumps(summary, ensure_ascii=False, indent=1, default=dict))
