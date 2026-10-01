#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
livechart_diff.py — 내 핵종 데이터 ↔ IAEA LiveChart 바닥상태 전수 비교

하는 일
  1) LiveChart API에서 전체 바닥상태 CSV 다운로드 (한 번 받으면 캐시 재사용)
  2) 내 데이터(JSON/CSV)를 Z·N 기준으로 매칭 (이성질체 레코드는 제외)
  3) 안정성 · 반감기 · 붕괴 방식/분기비 · 원자질량 · 질량초과 · 존재비 · J^π 비교
  4) 결과 저장
       diff_out/diff_details.csv  불일치 전체 목록 (엑셀 필터용)
       diff_out/diff_report.md    요약 + 치명·높음 상위 목록
                                  → 검증 프롬프트 'B-3 전수 비교(diff) 불일치 목록'에 그대로 붙여넣기

준비물: Python 3.8 이상 (추가 설치 없음). 첫 다운로드 때만 인터넷 필요.

이 저장소(nuclide-map)에서 (저장소 루트에서 실행)
  npx tsx tools/livechart-diff/export_nuclides.ts                                   # 앱 데이터 → nuclides_export.json
  python tools/livechart-diff/livechart_diff.py --inspect tools/livechart-diff/nuclides_export.json
  python tools/livechart-diff/livechart_diff.py tools/livechart-diff/nuclides_export.json --recheck

사용법
  python livechart_diff.py --inspect my_nuclides.json    # 1) 필드 자동 매핑 확인 (인터넷 불필요)
  python livechart_diff.py my_nuclides.json              # 2) 비교 실행

  --refresh        참조 데이터 새로 받기
  --ref 파일.csv    받아둔 LiveChart CSV 사용 (사내망 등에서 직접 다운로드가 막힐 때)
  --out 폴더        결과 폴더 (기본: 스크립트 폴더의 diff_out)
  --top N          보고서에 넣을 치명·높음 건수 (기본 40)
  --download-only  참조 데이터만 받기
  --recheck        치명·높음 핵종을 단건 API(최신값)로 다시 받아 재비교 (일괄 CSV는 고정 스냅샷)
                   받은 CSV는 livechart_live/에 두고 재사용 (--refresh면 다시 받음)

내 데이터 형식
  JSON  [ {...}, ... ] / {"nuclides": [ ... ]} / {"Cs-137": {...}, ...}
  CSV   첫 줄 헤더
  JS·TS 파일 안에 있으면 JSON으로 내보낸 뒤 사용 (예: JSON.stringify(data))
  필드 이름은 자동 추정. 틀리면 아래 CONFIG["fields"]에 직접 적기 (중첩은 점 표기: "decay.modes")

한계
  - LiveChart ground_states = 바닥상태만, 붕괴 모드는 상위 3개까지 → 이성질체·4번째 이후 모드는 수동 확인
  - 참조도 특정 시점 ENSDF/AME/NUBASE 스냅샷 → 보고서의 Extraction_date를 '참조 버전'으로 기록할 것
  - 일괄(all) CSV는 서버에 고정된 스냅샷(2026-10 확인 시 Extraction_date 2023-10-18). 단건 조회는 최신값
    → --recheck는 치명·높음 핵종만 최신값으로 다시 봄. 나머지는 스냅샷 기준

v1.1 변경 (nuclide-map 적용, 2026-10-01) — 판정 기준·심각도 정의는 그대로, 아래는 버그·오탐 수정
  - 준위 폭 부등호 방향 (Γ < x → T½ > …), NUBASE '#' 추정 반감기, 반감기 한계 표시('안정 (> 1.3 Ey)')
  - 붕괴 코드: LiveChart B-5N~7N·SF+EC+B+·{+22}Ne·Mg, NUBASE e+·3p·3n·B+3p·B+pA / 같은 과정 묶음 비교
    / EC+B+ 합계와 내역 / 참조 중복 코드 / 참조 0% = 세기 미상 / 내 분기비 한계값(>55)
  - J^π: 아이소스핀 'T=1', 구분자(쉼표↔공백), '#'(추정)과 괄호(잠정) 섞인 표기
  - 바닥·이성질체 배정 차이(NUBASE '&'·'*' 또는 J^π로 확인), 관측상 안정 ↔ 참조 하한
"""

import argparse
import csv
import datetime as dt
import io
import json
import math
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict

# ════════════════════════════════════════════════════════════════════
# 설정 — 보통은 그대로 두고, --inspect 결과가 틀렸을 때만 수정
# ════════════════════════════════════════════════════════════════════
CONFIG = {
    # 이 저장소(nuclide-map) 설정. 입력 = export_nuclides.ts가 만든 nuclides_export.json
    #   (앱과 같은 hydrate·AME 결합을 거친 값, 이성질체는 별도 레코드로 펼쳐 있음)
    # JSON에서 레코드 목록 위치 (예: "data.nuclides"). None = 자동 감지
    "records_path": "nuclides",

    # 내 데이터 필드 이름. "auto" = 흔한 이름으로 자동 추정, None = 없음/사용 안 함
    "fields": {
        "z": "z",                         # 원자번호
        "n": "n",                         # 중성자수 (hydrate가 a − z로 계산)
        "a": "a",                         # 질량수
        "symbol": "symbol",               # 원소기호 (중성자는 "n")
        "name": "id",                     # "U-235", "Tc-99m", "Hf-178m2"
        "is_isomer": "is_isomer",         # level > 0 (NUBASE m, n, p, q, r, x 상태)
        "excitation_energy": "exc_kev",   # 들뜬 에너지 keV (non-exist 상태는 null)
        "half_life": "half_life",         # "704 My", "5# ms"(#=추정), "<26 ns", 안정·미상·입자 비속박 = null
        "half_life_unit": None,           # 단위는 half_life 문자열 안에 있음
        "half_life_operator": None,       # 부등호도 half_life 문자열 안에 있음
        "stable": "stable",               # halfLife.kind == "stable"
        "decay_modes": "decay_modes",     # [{"mode":"B-","ratio":100,...}], ratio = 분기비 %(세기 미상 '?' = null)
        "atomic_mass": "atomic_mass_u",   # 화면 값: AME μu를 반올림(04 §9) 후 u로
        "mass_excess": "mass_excess_kev", # NUBASE 질량 초과 keV (화면에 원문 그대로)
        "systematics_flag": "mass_excess_est",  # 질량 초과 '#' (화면에 # 표시)
        "abundance": "abundance_pct",     # 자연 존재비 %
        "spin_parity": "jpi",             # 화면 값: '*'(측정 배지) 뗌, '#'(추정 배지)은 남김
        "half_life_display": "half_life_display",  # 보고서 '내 값' 칸에 쓸 화면 문자열 (비교에는 안 씀)
        "half_life_limit": "half_life_limit",      # 화면에 함께 보이는 한계 '>9.9 Zy' ('안정 (> 9.9 Zy)', '5# ms (> 620 ns)')
        "order_inverted": "order_inverted",        # NUBASE '&' = ENSDF와 바닥·이성질체 순서가 반대
        "order_uncertain": "order_uncertain",      # NUBASE '*' = 바닥·이성질체 순서 불확실
        "observed": "observed",                    # false = 미관측(화면에 '미관측' 배지)
    },

    # 숫자로만 저장된 값의 단위. "auto" = 참조값과 비교해 자동 추정 (보고서에 추정 결과 표시)
    "units": {
        "half_life": "s",             # 숫자만 있는 반감기 없음 (모두 단위 포함 문자열)
        "atomic_mass": "u",           # atomic_mass_u
        "mass_excess": "keV",
        "abundance": "percent",
        "branching": "percent",
    },

    # 반감기 칸이 비어 있으면 '안정'으로 볼지. "auto" = 데이터 보고 판단, True / False
    # 이 데이터는 'stable' 필드가 항상 있으므로 쓰이지 않음 (미상·입자 비속박 = 공란 ≠ 안정)
    "stable_if_no_half_life": False,

    # 붕괴 모드가 NUBASE 표기인지. True면 B+ = EC+β⁺ 합계, e+ = 그중 양전자 몫,
    # (B+와 함께 적힌) EC = 그중 EC 몫으로 읽어 LiveChart 표기(EC+B+ / B+ / EC)로 바꿔 비교
    "nubase_beta_plus": True,

    # 허용 오차
    "tolerance": {
        "sigma_k": 2.0,               # 참조 불확도(1σ)의 몇 배까지 일치로 볼지
        "half_life_rel_no_unc": 1e-3, # 참조 불확도가 없을 때 반감기 상대 허용
        "branch_rel": 0.01,           # 분기비: 참조값의 1%
        "branch_abs": 0.05,           # 분기비: 0.05 %p
        "mass_abs_u": 1e-6,           # 원자질량: 1 μu
        "mass_excess_abs_kev": 1.0,   # 질량초과: 1 keV
        "abund_rel": 0.01,            # 존재비: 참조값의 1%
        "abund_abs": 0.005,           # 존재비: 0.005 %p
        "unit_factor_rel": 0.02,      # 단위 배수 판정 허용 (2%)
    },
}

# ════════════════════════════════════════════════════════════════════
# 상수
# ════════════════════════════════════════════════════════════════════
LIVECHART_URL = "https://nds.iaea.org/relnsd/v1/data?fields=ground_states&nuclides=all"
# 단건 조회: 일괄(all) CSV는 서버에 고정된 스냅샷(Extraction_date 2023-10-18)이고 단건 조회는 최신값을 줌
LIVECHART_ONE_URL = "https://nds.iaea.org/relnsd/v1/data?fields=ground_states&nuclides={}"
__version__ = "1.1"
# LiveChart API 안내문: HTTP 403이 나면 User-Agent를 붙이라고 권장
USER_AGENT = "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:77.0) Gecko/20100101 Firefox/77.0"
# 기본 참조·결과 위치 = 이 스크립트 폴더 (어디서 실행해도 같은 파일을 쓰도록)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_REF = os.path.join(SCRIPT_DIR, "livechart_ground_states.csv")
DEFAULT_OUT = os.path.join(SCRIPT_DIR, "diff_out")

ELEMENTS = ("n H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As "
            "Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd "
            "Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am "
            "Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og").split()
SYMBOL_TO_Z = {s.lower(): z for z, s in enumerate(ELEMENTS) if z > 0}

YEAR_S = 365.2422 * 86400.0       # LiveChart half_life_sec와 같은 연(年) 정의 (236Np: 1.55e5 y → 4.891324e12 s)
LN2 = math.log(2.0)
HBAR_EV_S = 6.582119569e-16       # ħ [eV·s] — 준위 폭 Γ → 반감기: T½ = ħ·ln2 / Γ
U_IN_EV = 931494102.42            # 1 u [eV]
ELECTRON_MASS_U = 5.48579909065e-4
# CIAAW가 표준 원자량을 구간으로 주는 원소 (자연 동위원소 조성 변동이 큰 원소)
CIAAW_INTERVAL = {"H", "Li", "B", "C", "N", "O", "Mg", "Si", "S", "Cl", "Ar", "Br", "Tl", "Pb"}

SEVERITIES = ("치명", "높음", "중간", "낮음")
SEV_RANK = {s: i for i, s in enumerate(SEVERITIES)}

_D = 86400.0
TIME_UNITS = {
    "ys": 1e-24, "zs": 1e-21, "as": 1e-18, "fs": 1e-15, "ps": 1e-12, "ns": 1e-9,
    "us": 1e-6, "μs": 1e-6, "ms": 1e-3,
    "s": 1.0, "sec": 1.0, "secs": 1.0, "second": 1.0, "seconds": 1.0, "초": 1.0,
    "m": 60.0, "min": 60.0, "mins": 60.0, "minute": 60.0, "minutes": 60.0, "분": 60.0,
    "h": 3600.0, "hr": 3600.0, "hrs": 3600.0, "hour": 3600.0, "hours": 3600.0, "시간": 3600.0,
    "d": _D, "day": _D, "days": _D, "일": _D,
    "y": YEAR_S, "yr": YEAR_S, "yrs": YEAR_S, "a": YEAR_S, "year": YEAR_S, "years": YEAR_S, "년": YEAR_S,
    "ky": 1e3 * YEAR_S, "ka": 1e3 * YEAR_S, "kyr": 1e3 * YEAR_S,
    "my": 1e6 * YEAR_S, "ma": 1e6 * YEAR_S, "myr": 1e6 * YEAR_S,
    "gy": 1e9 * YEAR_S, "ga": 1e9 * YEAR_S, "gyr": 1e9 * YEAR_S,
    "ty": 1e12 * YEAR_S, "py": 1e15 * YEAR_S, "ey": 1e18 * YEAR_S,
    "zy": 1e21 * YEAR_S, "yy": 1e24 * YEAR_S,
}
ENERGY_UNITS = {"ev": 1.0, "kev": 1e3, "mev": 1e6}

# 반감기 비율이 이 배수와 맞으면 '단위 혼동 의심'
UNIT_SUSPECTS = [
    (60.0, "초↔분 또는 분↔시간 (×60)"),
    (3600.0, "초↔시간 (×3600)"),
    (86400.0, "초↔일 (×86400)"),
    (1440.0, "분↔일 (×1440)"),
    (24.0, "시간↔일 (×24)"),
    (365.25, "일↔년 (×365)"),
    (8766.0, "시간↔년 (×8766)"),
    (525960.0, "분↔년 (×5.26e5)"),
    (YEAR_S, "초↔년 (×3.16e7)"),
    (1e3, "×10³ 접두어 (ms↔s, ky↔y 등)"),
    (1e6, "×10⁶ 접두어 (μs↔s, My↔y 등)"),
    (1e9, "×10⁹ 접두어 (ns↔s, Gy↔y 등)"),
    (1.0 / LN2, "평균수명 τ와 반감기 T½ 혼동 (τ = T½/ln2)"),
]

# 붕괴 방식 표기 → 공통 코드
MODE_SYNONYMS = {
    "A": "A", "4HE": "A", "HE4": "A",
    "B-": "B-", "BM": "B-", "BMINUS": "B-", "B": "B-", "E-": "B-",
    "B+": "B+", "BP": "B+", "BPLUS": "B+",
    "E+": "E+", "POSITRON": "E+",       # 양전자 방출 몫 → norm_user_modes()가 B+로 바꿈 (NUBASE e+ 구분용)
    "EC": "EC", "ELECTRONCAPTURE": "EC", "CAPTURE": "EC",
    "EC+B+": "EC+B+", "ECB+": "EC+B+", "B+EC": "EC+B+", "B++EC": "EC+B+", "EC/B+": "EC+B+",
    "B+/EC": "EC+B+", "ECORB+": "EC+B+", "EC,B+": "EC+B+",
    "IT": "IT", "ISOMERICTRANSITION": "IT", "G": "IT",
    "SF": "SF", "FISSION": "SF", "SPONTANEOUSFISSION": "SF",
    "P": "P", "PROTON": "P", "2P": "2P", "3P": "3P", "N": "N", "NEUTRON": "N", "2N": "2N", "3N": "3N",
    "B-N": "B-N", "BN": "B-N", "B-2N": "B-2N", "B2N": "B-2N", "B-3N": "B-3N", "B-4N": "B-4N",
    "B-5N": "B-5N", "B-6N": "B-6N", "B-7N": "B-7N",
    "B-A": "B-A", "B-P": "B-P", "B-SF": "B-SF", "B-D": "B-D", "B-T": "B-T",
    "ECP": "ECP", "EC+P": "ECP", "ECA": "ECA", "EC+A": "ECA", "EC2P": "EC2P", "ECSF": "ECSF",
    "SF+EC+B+": "ECSF",                                   # LiveChart: β⁺/EC 지연 핵분열
    "B+P": "B+P", "B+A": "B+A", "B+SF": "B+SF", "B+2P": "B+2P", "B+3P": "B+3P", "B+PA": "B+PA",
    "2B-": "2B-", "B-B-": "2B-", "BB": "2B-", "2B": "2B-", "DOUBLEB-": "2B-",
    "2B+": "2B+", "B+B+": "2B+", "2EC": "2EC", "ECEC": "2EC", "DOUBLEEC": "2EC",
}
KNOWN_MODES = set(MODE_SYNONYMS.values())
# 지연 입자 방출 등 '부분집합' 모드: 분기비 합 계산에서 제외 (ENSDF 관례)
SUBSET_MODES = {"B-N", "B-2N", "B-3N", "B-4N", "B-5N", "B-6N", "B-7N", "B-A", "B-P", "B-SF", "B-D", "B-T",
                "ECP", "ECA", "EC2P", "ECSF", "B+P", "B+A", "B+SF", "B+2P", "B+3P", "B+PA"}
EC_FAMILY = {"EC", "B+", "EC+B+"}
# 같은 과정을 출처마다 다르게 적는 코드 → 한 묶음으로 비교 (분기비는 묶음 합으로)
#   NUBASE β⁺ = EC+β⁺, ENSDF는 EC·EC+B+·B+를 섞어 씀 → 지연 방출·이중 붕괴도 같은 식으로 묶음
MODE_FAMILY = {"EC": "EC/B+", "B+": "EC/B+", "EC+B+": "EC/B+", "E+": "EC/B+",
               "ECP": "EC/B+ p", "B+P": "EC/B+ p", "ECA": "EC/B+ α", "B+A": "EC/B+ α",
               "EC2P": "EC/B+ 2p", "B+2P": "EC/B+ 2p", "ECSF": "EC/B+ SF", "B+SF": "EC/B+ SF",
               "2EC": "2EC/2B+", "2B+": "2EC/2B+"}
# 클러스터 붕괴: 14C, 24NE, 24NE+26NE(합산), MG(LiveChart, 질량수 없음)
CLUSTER_RE = re.compile(r"^(\d{1,2})?([A-Z]{1,2})(?:\+\d{1,2}[A-Z]{1,2})?$")

OP_SYMBOLS = {">": "GT", "≥": "GE", ">=": "GE", "<": "LT", "≤": "LE", "<=": "LE",
              "~": "AP", "≈": "AP", "≃": "AP"}
OP_CODES = {"GT", "GE", "LT", "LE", "AP", "CA", "SY"}
LIMIT_OPS = {"GT", "GE", "LT", "LE"}
OP_TEXT = {"GT": ">", "GE": "≥", "LT": "<", "LE": "≤", "AP": "~", "CA": "(계산)", "SY": "(계통)"}
# 준위 폭 Γ의 부등호를 반감기로 옮기면 방향이 반대 (Γ < x  ↔  T½ > ħ·ln2/x)
FLIP_OP = {"GT": "LT", "GE": "LE", "LT": "GT", "LE": "GE"}

# 필드 자동 추정 후보 (소문자, 공백·_·-·. 제거한 이름)
AUTO_CANDIDATES = {
    "z": ("z", "atomicnumber", "protons", "protonnumber", "protoncount"),
    "n": ("n", "neutrons", "neutronnumber", "neutroncount"),
    "a": ("a", "massnumber", "nucleons", "nucleonnumber"),
    "symbol": ("symbol", "element", "elementsymbol", "sym", "el", "elem"),
    "name": ("name", "nuclide", "nuclidename", "isotope", "label", "id", "nuc", "key"),
    "is_isomer": ("isomer", "isisomer", "metastable", "ismetastable", "meta", "ismeta"),
    "excitation_energy": ("excitationenergy", "exenergy", "levelenergy", "elevel",
                          "isomerenergy", "energylevel", "ex"),
    "half_life": ("halflife", "halflifes", "halflifesec", "halflifeseconds", "halflifeinseconds",
                  "t12", "t1/2", "thalf", "hl", "halflifevalue", "halflifetext"),
    "half_life_unit": ("halflifeunit", "halflifeunits", "hlunit", "t12unit", "unithl", "unit"),
    "half_life_operator": ("halflifeoperator", "hloperator", "operatorhl", "halflifelimit"),
    "stable": ("stable", "isstable"),
    "decay_modes": ("decaymodes", "decaymode", "decays", "decay", "modes", "decaychannels"),
    "atomic_mass": ("atomicmass", "mass", "massu", "isotopicmass", "atomicmassu", "exactmass"),
    "mass_excess": ("massexcess", "massexcesskev", "massexcessmev", "excess"),
    "systematics_flag": ("systematics", "estimated", "isestimated", "extrapolated", "mesystematics",
                         "issystematic", "issystematics", "theoretical", "istheoretical"),
    "abundance": ("abundance", "naturalabundance", "isotopicabundance", "abund", "natabundance",
                  "abundancepercent"),
    "spin_parity": ("jp", "jpi", "spinparity", "jπ", "spinandparity", "spin"),
}
MODE_KEYS = ("mode", "type", "decay", "decaymode", "name", "kind", "channel", "code")
RATIO_KEYS = ("ratio", "percent", "pct", "branching", "branchingratio", "br", "intensity",
              "value", "fraction", "probability", "prob", "%")

# ════════════════════════════════════════════════════════════════════
# 기본 도우미
# ════════════════════════════════════════════════════════════════════
SUP_MAP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻−–—", "0123456789+----")
POW10_RE = re.compile(r"\s*[×xX\*·]\s*10\s*\^?\s*\{?\s*([⁻⁺−\-+]?[⁰¹²³⁴⁵⁶⁷⁸⁹0-9]+)\s*\}?")
NUM_RE = re.compile(
    r"^\s*(>=|<=|[><≥≤~≈≃])?\s*"
    r"([+-]?(?:\d+(?:\.\d*)?|\.\d+))"     # 가수
    r"\s*(?:\((\d+)\))?"                  # 괄호 불확도 (마지막 자리 기준)
    r"\s*(?:[eE]([+-]?\d+))?"             # 지수
    r"\s*(?:\((\d+)\))?"
    r"\s*(.*?)\s*$"                       # 나머지 = 단위
)


def nkey(s):
    """필드 이름 비교용: 소문자 + 공백·_·-·. 제거"""
    return re.sub(r"[\s_\-\.]", "", str(s)).lower()


def norm_text(s):
    s = str(s).strip()
    s = POW10_RE.sub(lambda m: "e" + m.group(1).translate(SUP_MAP), s)
    return s.translate(SUP_MAP).replace("µ", "μ")


def to_float(x):
    if x is None or isinstance(x, bool):
        return None
    if isinstance(x, (int, float)):
        return None if (isinstance(x, float) and math.isnan(x)) else float(x)
    s = norm_text(x)
    if not s or s.lower() in ("nan", "none", "null", "-", "?", "n/a", "na"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def to_int(x):
    f = to_float(x)
    if f is None or abs(f - round(f)) > 1e-9:
        return None
    return int(round(f))


def parse_num(s):
    """'12.32(2) y' → (12.32, 0.02, None, 'y') / '>1.5e20 y' → (1.5e20, None, 'GT', 'y')"""
    m = NUM_RE.match(norm_text(s))
    if not m:
        return None
    op_s, mant, u1, exp, u2, rest = m.groups()
    e = int(exp) if exp else 0
    value = float(mant) * 10.0 ** e
    unc = None
    ud = u1 or u2
    if ud:
        dec = len(mant.split(".")[1]) if "." in mant else 0
        unc = int(ud) * 10.0 ** (e - dec)
    return value, unc, (OP_SYMBOLS.get(op_s) if op_s else None), rest


def parse_plain(x):
    """숫자 / '136.9070893(4)' / {"value": ..} → (값, 불확도)"""
    if x is None or isinstance(x, bool):
        return None, None
    if isinstance(x, (int, float)):
        return (None, None) if (isinstance(x, float) and math.isnan(x)) else (float(x), None)
    if isinstance(x, dict):
        k = _pick(x, ("value", "val", "v"))
        return parse_plain(x.get(k)) if k else (None, None)
    p = parse_num(x)
    return (p[0], p[1]) if p else (None, None)


def parse_ratio(x):
    if x is None or isinstance(x, bool):
        return None
    if isinstance(x, (int, float)):
        return None if (isinstance(x, float) and math.isnan(x)) else float(x)
    p = parse_num(x)
    return p[0] if p else None


def norm_op(x):
    if x is None:
        return None
    s = str(x).strip()
    if not s:
        return None
    if s in OP_SYMBOLS:
        return OP_SYMBOLS[s]
    u = s.upper()
    return u if u in OP_CODES else None


def truthy(v):
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return bool(v)
    s = str(v).strip().lower()
    if not s:
        return None
    if s in ("true", "t", "yes", "y", "1", "o", "#", "est", "estimated", "stable", "안정", "예"):
        return True
    if s in ("false", "f", "no", "n", "0", "x", "radioactive", "unstable", "아니오"):
        return False
    return None


def time_factor(unit):
    if unit is None:
        return None
    u = str(unit).strip().rstrip(".").replace("µ", "μ").lower()
    return TIME_UNITS.get(u)


def human_sec(sec):
    if sec is None:
        return ""
    for name, f in (("y", YEAR_S), ("d", _D), ("h", 3600.0), ("m", 60.0), ("s", 1.0), ("ms", 1e-3),
                    ("us", 1e-6), ("ns", 1e-9), ("ps", 1e-12), ("fs", 1e-15), ("as", 1e-18),
                    ("zs", 1e-21), ("ys", 1e-24)):
        if sec >= f:
            return f"{sec / f:.5g} {name}"
    return f"{sec:.3e} s"


def electron_binding_u(z):
    """원자의 전자 총결합에너지 근사 (AME가 쓰는 근사식) [u]"""
    return (14.4381 * z ** 2.39 + 1.55468e-6 * z ** 5.35) / U_IN_EV


def _pick(d, keys):
    nk = {nkey(k): k for k in d}
    for k in keys:
        if k in nk:
            return nk[k]
    return None


def get_field(rec, path):
    if not path:
        return None
    if path in rec:
        cur = rec[path]
    else:
        cur = rec
        for part in str(path).split("."):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                return None
    if isinstance(cur, str) and not cur.strip():
        return None
    return cur


def symbol_to_z(sym, a=None):
    s = str(sym).strip()
    if s == "n" and (a is None or a == 1):
        return 0
    return SYMBOL_TO_Z.get(s.lower())


def parse_nuclide_name(s):
    """'Cs-137', '137Cs', 'Tc-99m', '99mTc', '242m1Am' → [(Z, A, 이성질체?), ...] 후보 목록"""
    t = re.sub(r"\s+", "", str(s).translate(SUP_MAP))
    cands = []
    m = re.match(r"^([A-Za-z]{1,2})-?(\d{1,3})-?(m\d?|n)?$", t)
    if m:
        a = int(m.group(2))
        z = symbol_to_z(m.group(1), a)
        if z is not None:
            cands.append((z, a, bool(m.group(3))))
    m = re.match(r"^(\d{1,3})(m\d?)?-?([A-Za-z]{1,2})$", t)
    if m:
        a, iso, sym = int(m.group(1)), m.group(2), m.group(3)
        z = symbol_to_z(sym, a)
        if z is not None:
            cands.append((z, a, bool(iso)))
        if iso and len(iso) == 1:          # '100mo' 같은 모호성: m을 원소기호 첫 글자로도 해석
            z2 = symbol_to_z(iso + sym, a)
            if z2 is not None:
                cands.append((z2, a, False))
    return cands


def nuc_label(z, a, sym=None):
    s = sym or (ELEMENTS[z] if 0 <= z < len(ELEMENTS) else f"Z{z}")
    return f"{a}{s}"


def md(s):
    return str(s).replace("|", "\\|").replace("\n", " ")


# ════════════════════════════════════════════════════════════════════
# 반감기·붕괴 방식 해석
# ════════════════════════════════════════════════════════════════════
def g(row, name):
    """참조 행에서 열 읽기 (열 이름 표기 차이 무시)"""
    return row.get(nkey(name), "") or ""


def ref_half_life(row):
    hl, unit = g(row, "half_life"), g(row, "unit_hl")
    if "STABLE" in hl.upper():
        return {"kind": "stable", "text": "STABLE"}
    op = norm_op(g(row, "operator_hl"))
    val = to_float(hl)
    sec = to_float(g(row, "half_life_sec"))
    unc = to_float(g(row, "unc_hls"))
    ul = unit.strip().lower()
    width = ul in ENERGY_UNITS
    if sec is None and val is not None and val > 0:
        if width:
            sec = HBAR_EV_S * LN2 / (val * ENERGY_UNITS[ul])
        elif time_factor(ul):
            sec = val * time_factor(ul)
    text = (OP_TEXT.get(op, "") + f"{hl} {unit}".strip()).strip()
    if unc and sec and time_factor(ul):
        text += f" ±{unc / time_factor(ul):.2g}"
    if sec is None or sec <= 0:
        if not hl and not g(row, "decay_1") and to_float(g(row, "abundance")):
            return {"kind": "stable", "text": "STABLE(반감기 공란+존재비)"}
        return {"kind": "none", "text": text or "(반감기 없음)"}
    if width:
        # [버그 수정] 폭의 LT(Γ < 100 keV)는 반감기 '하한'. 전에는 반감기 상한으로 비교했음
        op = FLIP_OP.get(op, op)
        text += f" (폭 → {OP_TEXT[op] if op in LIMIT_OPS else ''}{human_sec(sec)})"
    return {"kind": "value", "sec": sec, "unc": unc, "op": op, "width": width, "text": text, "unit": unit}


def parse_user_half_life(raw, unit_hint=None, op_hint=None, num_unit=None):
    """→ kind: stable / value / none / bad / numeric_unknown(단위 없는 숫자, num_unit 미정)"""
    r = {"kind": "none", "sec": None, "unc": None, "op": norm_op(op_hint), "width": False,
         "text": "" if raw is None else str(raw)}
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return r
    if isinstance(raw, bool):
        r["kind"] = "bad"
        return r
    if isinstance(raw, dict):
        vk = _pick(raw, ("value", "val", "v", "halflife", "t", "seconds", "sec", "s", "years", "y"))
        uk = _pick(raw, ("unit", "units", "u"))
        ok = _pick(raw, ("operator", "op", "limit", "relation"))
        ek = _pick(raw, ("uncertainty", "unc", "err", "error", "sigma", "dvalue"))
        if vk is None:
            r["kind"] = "bad"
            return r
        unit = raw.get(uk) if uk else None
        if unit is None and nkey(vk) in ("seconds", "sec", "s"):
            unit = "s"
        if unit is None and nkey(vk) in ("years", "y"):
            unit = "y"
        sub = parse_user_half_life(raw[vk], unit_hint=unit or unit_hint,
                                   op_hint=raw.get(ok) if ok else op_hint, num_unit=num_unit)
        if sub["kind"] == "value" and sub["unc"] is None and ek:
            e, v = to_float(raw.get(ek)), to_float(raw[vk])
            if e is not None and v:
                sub["unc"] = sub["sec"] * e / v
        sub["text"] = json.dumps(raw, ensure_ascii=False)
        return sub
    if isinstance(raw, (int, float)):
        if math.isinf(raw):
            r["kind"] = "stable"
            return r
        val, unc, op, rest = float(raw), None, None, ""
    else:
        s = str(raw).strip()
        if re.match(r"(?i)^\s*(stable|안정|inf(inity)?\b|∞)", s):
            r["kind"] = "stable"
            return r
        if s in ("-", "—", "–", "n/a", "N/A", "?"):
            return r
        if "#" in s:                   # NUBASE식 추정값 "5# ms" → '#' 떼고 추정 표시
            r["est"] = True
            s = s.replace("#", "")
        p = parse_num(s)
        if not p:
            r["kind"] = "bad"
            return r
        val, unc, op, rest = p
    if val <= 0:                       # 0, -1 같은 '값 없음/안정' 표시용 숫자
        r["sentinel"] = True
        return r
    unit = rest or (str(unit_hint).strip() if unit_hint not in (None, "") else None) or num_unit
    if not unit:
        r.update(kind="numeric_unknown", val=val)
        return r
    ul = str(unit).strip().rstrip(".").replace("µ", "μ").lower()
    if ul in ENERGY_UNITS:
        if val <= 0:
            r["kind"] = "bad"
            return r
        sec = HBAR_EV_S * LN2 / (val * ENERGY_UNITS[ul])
        r.update(kind="value", sec=sec, width=True, unc=(sec * unc / val if unc else None))
    elif time_factor(ul) is not None and val > 0:
        f = time_factor(ul)
        r.update(kind="value", sec=val * f, unc=(unc * f if unc is not None else None))
    else:
        r.update(kind="bad", badunit=unit)
        return r
    r.update(op=op or r["op"], val=val, unit=ul, unit_in_text=bool(rest))
    if r["width"] and r["op"] in FLIP_OP:   # 폭의 부등호 → 반감기 부등호 (방향 반대)
        r["op"] = FLIP_OP[r["op"]]
    return r


def canon_mode(s):
    if s is None:
        return None
    t = str(s).strip()
    if not t:
        return None
    t = t.translate(SUP_MAP)
    t = re.sub(r"^\{\+?(\d+)\}([A-Za-z]{1,2})$", r"\1\2", t)   # LiveChart 클러스터 '{+22}Ne' → 22Ne
    for a, b in (("β", "B"), ("ß", "B"), ("α", "A"), ("ε", "EC"), ("γ", "G")):
        t = t.replace(a, b)
    t = re.sub(r"[\s_]", "", t.upper())
    t = t.replace("BETA", "B").replace("ALPHA", "A").replace("EPSILON", "EC").replace("DECAY", "")
    if t in MODE_SYNONYMS:
        return MODE_SYNONYMS[t]
    return t


def cluster_element(c):
    """클러스터 붕괴 코드면 방출 원소 기호(대문자), 아니면 None. 'P'·'N'·'A' 같은 일반 모드는 제외"""
    m = CLUSTER_RE.match(c or "")
    if not m or c in KNOWN_MODES:          # 2P·2N·3P(원소 P·N과 겹침) 등 일반 모드 제외
        return None
    return m.group(2) if m.group(2).lower() in SYMBOL_TO_Z else None


def mode_family(c):
    if c in MODE_FAMILY:
        return MODE_FAMILY[c]
    el = cluster_element(c)
    return f"클러스터 {el[0] + el[1:].lower()}" if el else c


def is_known_mode(c):
    return c in KNOWN_MODES or cluster_element(c) is not None


def split_mode_ratio(tok):
    tok = str(tok).strip()
    parts = re.split(r"\s*[:=]\s*", tok, maxsplit=1)
    if len(parts) == 2:
        return parts[0], parts[1]
    m = re.match(r"^(.*?)[\s(]+([<>≈~≤≥]?\s*[\d.]+(?:[eE][+-]?\d+)?)\s*%?\s*\)?$", tok)
    if m and m.group(1).strip():
        return m.group(1).strip(), m.group(2)
    return tok, None


REL_KEYS = ("rel", "relation", "operator", "op")


def user_modes(raw):
    """내 데이터 붕괴 방식 → [(코드, 분기비, 원문, 부등호)]. 필드 자체가 없으면 None
    부등호: 분기비가 한계값이면 'GT'·'LT' 등 ("B-n>55"), 아니면 None"""
    if raw is None:
        return None
    items = []
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return []
        if s[:1] in "[{":
            try:
                return user_modes(json.loads(s))
            except ValueError:
                pass
        for tok in re.split(r"[;|,\n]+", s):
            if tok.strip():
                items.append(split_mode_ratio(tok) + (None,))
    elif isinstance(raw, dict):
        mk = _pick(raw, MODE_KEYS)
        if mk is not None and not isinstance(raw[mk], (dict, list)):
            rk, ok = _pick(raw, RATIO_KEYS), _pick(raw, REL_KEYS)
            items.append((raw[mk], raw.get(rk) if rk else None, raw.get(ok) if ok else None))
        else:
            items.extend((k, v, None) for k, v in raw.items())
    elif isinstance(raw, (list, tuple)):
        for it in raw:
            if isinstance(it, dict):
                mk = _pick(it, MODE_KEYS)
                if mk is None:
                    continue
                rk, ok = _pick(it, RATIO_KEYS), _pick(it, REL_KEYS)
                items.append((it[mk], it.get(rk) if rk else None, it.get(ok) if ok else None))
            elif isinstance(it, (list, tuple)) and it:
                items.append((it[0], it[1] if len(it) > 1 else None, None))
            elif isinstance(it, str):
                items.append(split_mode_ratio(it) + (None,))
    out = []
    for mode, ratio, rel in items:
        c = canon_mode(mode)
        if c:
            op = norm_op(rel)
            if op is None and isinstance(ratio, str):
                p = parse_num(ratio)
                op = p[2] if p else None
            out.append((c, parse_ratio(ratio), str(mode), op))
    return out


def norm_user_modes(um):
    """내 데이터 β⁺ 표기 → LiveChart 표기 (EC+B+ = 합계, B+ = 양전자 몫, EC = EC 몫)
    CONFIG nubase_beta_plus: NUBASE는 B+ = EC+β⁺ 합계, e+ = 그중 양전자 몫 (B+=100;e+=90.57;EC=9.43)"""
    if um is None:
        return None
    nubase = CONFIG.get("nubase_beta_plus")
    out = []
    for c, p, s, op in um:
        if c == "B+" and nubase:
            c = "EC+B+"
        elif c == "E+":
            c = "B+"
        out.append((c, p, s, op))
    return out


def ref_modes(row, ctx=None):
    out = []
    for i in (1, 2, 3):
        raw = g(row, f"decay_{i}")
        if raw:
            pct = parse_ratio(g(row, f"decay_{i}_%"))
            if pct == 0 and not to_float(g(row, f"unc_{i}")):
                # LiveChart는 관측됐지만 세기가 없는 모드를 0으로 적음 (41Si B-N 0 ↔ NUBASE B-n>55,
                # 126La EC+B+ 0 = 유일한 모드) → 세기 미상으로 읽음
                pct = None
                if ctx is not None:
                    ctx["ref_zero_pct"] += 1
            out.append((canon_mode(raw), pct, to_float(g(row, f"unc_{i}")), raw))
    return out


def modes_text(items):
    return ", ".join(it[0] + (f" {it[1]:.4g}%" if it[1] is not None else "") for it in items)


# ════════════════════════════════════════════════════════════════════
# 데이터 읽기
# ════════════════════════════════════════════════════════════════════
def load_user_records(path, records_path):
    ext = os.path.splitext(path)[1].lower()
    if ext in (".csv", ".tsv"):
        with open(path, encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f, dialect="excel-tab" if ext == ".tsv" else "excel")), ""
    with open(path, encoding="utf-8-sig") as f:
        data = json.load(f)
    if records_path:
        for part in records_path.split("."):
            data = data[part]
    if isinstance(data, list):
        return [r for r in data if isinstance(r, dict)], ""
    if isinstance(data, dict):
        lists = [(k, v) for k, v in data.items()
                 if isinstance(v, list) and v and isinstance(v[0], dict)]
        if lists:
            k, v = max(lists, key=lambda kv: len(kv[1]))
            return [r for r in v if isinstance(r, dict)], f"목록 위치 자동 감지: \"{k}\""
        if data and all(isinstance(v, dict) for v in data.values()):
            out = []
            for k, v in data.items():
                rec = dict(v)
                rec.setdefault("_key", k)
                out.append(rec)
            return out, "키→레코드 형식으로 읽음 (키는 '_key' 필드로 사용)"
    raise SystemExit("레코드 목록을 찾지 못함 → CONFIG['records_path']에 위치를 적어 주세요")


def detect_fields(records, cfg_fields):
    keys = {}
    for rec in records[:300]:
        for k in rec.keys():
            keys.setdefault(nkey(k), k)
    fm, how = {}, {}
    for f, v in cfg_fields.items():
        if v == "auto":
            src = next((keys[c] for c in AUTO_CANDIDATES.get(f, ()) if c in keys), None)
            fm[f], how[f] = src, ("자동" if src else "없음")
        else:
            fm[f], how[f] = v, ("설정" if v else "없음")
    return fm, how


def sanity_fields(recs, fm, how):
    warns = []
    if fm.get("atomic_mass") and how.get("atomic_mass") == "자동":
        vals = [parse_plain(get_field(r, fm["atomic_mass"]))[0] for r in recs[:300]]
        vals = [v for v in vals if v is not None]
        if vals and sum(1 for v in vals if abs(v - round(v)) < 1e-9) / len(vals) > 0.9:
            if not fm.get("a"):
                fm["a"], how["a"] = fm["atomic_mass"], "자동(정수값)"
            warns.append(f"'{fm['atomic_mass']}' 값이 대부분 정수 → 질량수로 보고 원자질량 비교에서 제외")
            fm["atomic_mass"], how["atomic_mass"] = None, "없음"
    if not (fm.get("z") or fm.get("symbol") or fm.get("name")):
        warns.append("Z·원소기호·이름 필드를 못 찾음 → CONFIG['fields']에 직접 지정 필요")
    if not fm.get("half_life"):
        warns.append("반감기 필드를 못 찾음 → 반감기·안정성 비교는 '안정' 필드로만 진행")
    return fm, warns


def plausible(z, n):
    """대략 알려진 핵종 범위 안인지 (이름 해석이 모호할 때만 사용)"""
    return n >= 0 and z // 2 - 5 <= n <= 2 * z + 10


def resolve_zn(rec, fm, ref_keys):
    z = to_int(get_field(rec, fm.get("z")))
    n = to_int(get_field(rec, fm.get("n")))
    a = to_int(get_field(rec, fm.get("a")))
    sym = get_field(rec, fm.get("symbol"))
    if z is None and sym is not None:
        z = symbol_to_z(sym, a)
    if n is None and z is not None and a is not None:
        n = a - z
    name = get_field(rec, fm.get("name"))
    iso = False
    if name is not None:
        cands = parse_nuclide_name(name)
        if z is not None and n is not None:
            for cz, ca, ci in cands:
                if cz == z and ca == z + n:
                    iso = ci
                    break
        elif cands:
            pick = (next((c for c in cands if (c[0], c[1] - c[0]) in ref_keys), None)
                    or next((c for c in cands if plausible(c[0], c[1] - c[0])), None)
                    or cands[0])
            z, n, iso = pick[0], pick[1] - pick[0], pick[2]
    return z, n, iso


def is_isomer(rec, fm, iso_by_name):
    if iso_by_name:
        return True
    if fm.get("is_isomer") and truthy(get_field(rec, fm["is_isomer"])):
        return True
    if fm.get("excitation_energy"):
        e = to_float(get_field(rec, fm["excitation_energy"]))
        return bool(e and e > 0)
    return False


def load_ref(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return load_ref_text(f.read(), path)


def load_ref_text(text, path):
    text = text.lstrip("﻿")
    if len(text.strip()) < 200:
        raise SystemExit(f"참조 파일이 비정상: {path} (내용: {text.strip()[:80]!r}) → --refresh로 다시 받기")
    reader = csv.reader(io.StringIO(text))
    header = [h.strip() for h in next(reader)]
    keys = [nkey(h) for h in header]
    if not {"z", "n", "halflife"}.issubset(keys):
        raise SystemExit(f"LiveChart ground_states 형식이 아님: {path} (헤더 앞부분: {header[:6]})")
    rows = []
    for vals in reader:
        if vals and any(v.strip() for v in vals):
            rows.append({k: (vals[i].strip() if i < len(vals) else "") for i, k in enumerate(keys)})
    return rows


def download_ref(path):
    print(f"LiveChart 다운로드 중… ({LIVECHART_URL})")
    req = urllib.request.Request(LIVECHART_URL, headers={"User-Agent": USER_AGENT})
    hint = (f"\n  → 브라우저로 아래 주소를 열어 CSV로 저장한 뒤 --ref 파일경로 로 실행\n  {LIVECHART_URL}"
            "\n  (macOS에서 CERTIFICATE_VERIFY_FAILED면 Python 폴더의 'Install Certificates.command' 실행)")
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = resp.read()
    except urllib.error.HTTPError as e:
        raise SystemExit(f"다운로드 실패: HTTP {e.code}{hint}")
    except (urllib.error.URLError, OSError) as e:
        raise SystemExit(f"다운로드 실패: {e}{hint}")
    text = data.decode("utf-8-sig", errors="replace")
    if len(text.strip()) < 200:
        raise SystemExit(f"LiveChart 응답이 비정상 (내용: {text.strip()[:80]!r}){hint}")
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    meta = {"url": LIVECHART_URL,
            "downloaded_at": dt.datetime.now().astimezone().isoformat(timespec="seconds")}
    with open(path + ".meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"저장: {path}")


REF_KEY_COLS = ("jp", "half_life", "operator_hl", "unc_hl", "unit_hl", "decay_1", "decay_1_%", "decay_2",
                "decay_2_%", "decay_3", "decay_3_%", "abundance", "atomic_mass", "massexcess", "me_systematics")


def fetch_live(zns, cache_dir, refresh=False, delay=0.5):
    """(Z, N) 목록을 단건 API로 받아 {(Z, N): 행}. 받은 CSV는 cache_dir에 두고 다시 씀 (--refresh면 새로)"""
    os.makedirs(cache_dir, exist_ok=True)
    out, failed = {}, []
    for k, (z, n) in enumerate(zns, 1):
        name = f"{z + n}{ELEMENTS[z].lower()}"           # 137cs, 1n
        path = os.path.join(cache_dir, f"{name}.csv")
        if refresh or not os.path.exists(path):
            req = urllib.request.Request(LIVECHART_ONE_URL.format(name), headers={"User-Agent": USER_AGENT})
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    text = resp.read().decode("utf-8-sig", errors="replace")
            except (urllib.error.URLError, OSError) as e:
                failed.append(f"{name}({e})")
                continue
            with open(path, "w", encoding="utf-8", newline="") as f:
                f.write(text)
            if k % 25 == 0:
                print(f"  단건 재확인 {k}/{len(zns)}")
            time.sleep(delay)
        with open(path, encoding="utf-8") as f:
            text = f.read()
        try:
            rows = load_ref_text(text, path)
        except SystemExit:
            failed.append(f"{name}(형식 이상)")
            continue
        for r in rows:
            if (to_int(g(r, "z")), to_int(g(r, "n"))) == (z, n):
                out[(z, n)] = r
    return out, failed


def ref_changed_cols(old, new):
    return [c for c in REF_KEY_COLS if g(old, c) != g(new, c)]


# ════════════════════════════════════════════════════════════════════
# 단위·규칙 자동 추정 (매칭된 레코드로 판단)
# ════════════════════════════════════════════════════════════════════
def prepass(ref_by_zn, resolved, fm, cfg):
    units = dict(cfg["units"])
    notes = []
    pairs = [(ref_by_zn[zn], rec) for zn, rec in resolved if zn in ref_by_zn]

    # 1) 단위 없는 숫자 반감기의 단위
    if units["half_life"] == "auto":
        units["half_life"] = None
        ratios = []
        if fm.get("half_life"):
            for r, rec in pairs:
                rh = ref_half_life(r)
                if rh["kind"] != "value" or rh.get("op") in LIMIT_OPS:
                    continue
                uh = parse_user_half_life(
                    get_field(rec, fm["half_life"]),
                    unit_hint=get_field(rec, fm["half_life_unit"]) if fm.get("half_life_unit") else None)
                if uh["kind"] == "numeric_unknown" and uh.get("val"):
                    ratios.append(rh["sec"] / uh["val"])
        if ratios:
            med = statistics.median(ratios)
            best = next((u for u in ("s", "m", "h", "d", "y", "ms", "us", "ns", "ky", "my", "gy")
                         if abs(med / TIME_UNITS[u] - 1) <= 0.05), None)
            if best:
                units["half_life"] = best
                notes.append(f"단위 없는 숫자 반감기 → '{best}'로 자동 추정 ({len(ratios)}건 기준). "
                             "화면에서도 같은 단위로 표시되는지 확인")
            else:
                units["half_life"] = "s"
                notes.append(f"숫자 반감기 단위 추정 실패 (참조/내 값 중앙값 {med:.4g}) → 's'로 가정. "
                             "CONFIG units.half_life 직접 지정 권장")
        if units["half_life"] is None:
            units["half_life"] = "s"

    # 2) 원자질량 단위 (u / μu)
    if units["atomic_mass"] == "auto":
        vals = [parse_plain(get_field(rec, fm.get("atomic_mass")))[0] for _, rec in resolved[:500]]
        vals = [v for v in vals if v]
        units["atomic_mass"] = "uu" if vals and statistics.median(vals) > 1000 else "u"
        if units["atomic_mass"] == "uu":
            notes.append("원자질량 단위 → μu로 자동 추정")

    # 3) 질량초과 단위 (keV / MeV)
    if units["mass_excess"] == "auto":
        ratios = []
        if fm.get("mass_excess"):
            for r, rec in pairs:
                ref = to_float(g(r, "massexcess"))
                v = parse_plain(get_field(rec, fm["mass_excess"]))[0]
                if ref and v and abs(ref) > 1000:
                    ratios.append(v / ref)
        units["mass_excess"] = "MeV" if ratios and abs(statistics.median(ratios) / 1e-3 - 1) < 0.1 else "keV"
        if ratios:
            notes.append(f"질량초과 단위 → {units['mass_excess']}로 자동 추정")

    # 4) 존재비 단위 (% / 비율)
    if units["abundance"] == "auto":
        ratios = []
        if fm.get("abundance"):
            for r, rec in pairs:
                ref = to_float(g(r, "abundance"))
                v = parse_plain(get_field(rec, fm["abundance"]))[0]
                if ref and v:
                    ratios.append(v / ref)
        units["abundance"] = ("fraction" if ratios and abs(statistics.median(ratios) / 0.01 - 1) < 0.1
                              else "percent")
        if ratios:
            notes.append(f"존재비 단위 → {'비율(0~1)' if units['abundance'] == 'fraction' else '%'}로 자동 추정")

    # 5) 분기비 단위 (% / 비율)
    if units["branching"] == "auto":
        sums = []
        if fm.get("decay_modes"):
            for _, rec in resolved:
                um = user_modes(get_field(rec, fm["decay_modes"])) or []
                prim = [p for c, p, *_ in um if c not in SUBSET_MODES and p is not None]
                if prim:
                    sums.append(sum(prim))
        units["branching"] = "fraction" if sums and 0.5 <= statistics.median(sums) <= 1.5 else "percent"
        if units["branching"] == "fraction":
            notes.append("분기비 단위 → 비율(0~1)로 자동 추정")

    # 6) 반감기 공란(또는 0, -1, '-') = 안정?
    #    참조가 '안정'인 핵종 중 명시적 안정 표시가 없는 레코드 대부분이 공란이면 그렇게 해석
    sinh = cfg["stable_if_no_half_life"]
    if sinh == "auto":
        tot = cnt = 0
        for r, rec in pairs:
            if ref_half_life(r)["kind"] != "stable":
                continue
            flag = truthy(get_field(rec, fm["stable"])) if fm.get("stable") else None
            kind = parse_user_half_life(get_field(rec, fm["half_life"]) if fm.get("half_life") else None)["kind"]
            if flag is not None or kind == "stable":
                continue
            tot += 1
            cnt += kind == "none"
        sinh = tot >= 3 and cnt / tot >= 0.8
        if sinh:
            notes.append(f"'반감기 칸 비어 있음(0·-1·'-' 포함) = 안정'으로 해석 "
                         f"(참조 안정 핵종 중 해당 {tot}건의 {cnt}건이 공란)")
    return units, bool(sinh), notes


# ════════════════════════════════════════════════════════════════════
# 비교
# ════════════════════════════════════════════════════════════════════
def issue(sev, cat, field, K, mine="", ref="", diff="", note=""):
    z, n, a, label = K
    return {"severity": sev, "category": cat, "field": field, "nuclide": label, "Z": z, "N": n, "A": a,
            "mine": str(mine), "ref": str(ref), "diff": str(diff), "note": note}


def unit_suspect(ratio, rel_tol):
    if not ratio or ratio <= 0:
        return None
    for f, label in UNIT_SUSPECTS:
        if abs(ratio / f - 1.0) <= rel_tol or abs(ratio * f - 1.0) <= rel_tol:
            return label
    return None


def user_text_hl(uh, stable, display=None):
    if display not in (None, ""):          # 화면 문자열이 있으면 그대로 (단위가 다르면 환산값 덧붙임)
        if uh["kind"] == "value" and not uh.get("width"):
            conv = human_sec(uh["sec"])
            if time_factor(uh.get("unit")) != TIME_UNITS.get(conv.split()[-1]):
                return f"{display} (≈{conv})"
        return str(display)
    if uh["kind"] == "stable" or (uh["kind"] == "none" and stable):
        return "안정"
    if uh["kind"] == "value":
        conv = human_sec(uh["sec"])
        t = uh["text"]
        if uh.get("op") in LIMIT_OPS and not re.match(r"^\s*[<>≤≥]", t):
            t = OP_TEXT[uh["op"]] + t
        same_unit = (uh.get("unit_in_text") and not uh.get("width")
                     and time_factor(uh.get("unit")) == TIME_UNITS.get(conv.split()[-1]))
        if not t:
            return conv
        return t if same_unit else f"{t} (≈{conv})"
    return uh.get("text") or ""


def compare_half_life(K, rh, uh, tol, mine, ulim=None):
    """ulim: 화면에 함께 보이는 내 반감기 한계 (예: '5# ms (> 620 ns)'의 '>620 ns'), 없으면 None"""
    if rh["kind"] == "none":
        if uh["kind"] == "value":
            return [issue("낮음", "참조에 반감기 없음", "반감기", K, mine, rh["text"],
                          note="출처 확인 — 추정·이론값이면 화면에 표시 필요")]
        return []
    if uh["kind"] == "none":
        return [issue("중간", "반감기 누락", "반감기", K, mine, rh["text"])]
    if uh["kind"] == "bad":
        return [issue("중간", "반감기 해석 불가", "반감기", K, uh["text"], rh["text"],
                      note=f"형식·단위 확인 (단위: {uh.get('badunit', '?')})")]
    if uh["kind"] != "value":
        return []
    rs, us = rh["sec"], uh["sec"]
    ratio, rel = us / rs, abs(us - rs) / rs
    rop, uop = rh.get("op"), uh.get("op")
    diff = f"{(ratio - 1) * 100:+.3g}%" if ratio < 10 else f"×{ratio:.4g}"
    est = "내 값은 추정(#)" if uh.get("est") else ""

    if rop in LIMIT_OPS:                                   # 참조가 한계값(>, <)
        lower = rop in ("GT", "GE")
        consistent = us >= rs * (1 - 1e-9) if lower else us <= rs * (1 + 1e-9)
        if uop in LIMIT_OPS:
            return [issue("낮음", "한계값 차이", "반감기", K, mine, rh["text"], diff)] if rel > 0.01 else []
        if not consistent:
            return [issue("높음", "반감기 한계와 모순", "반감기", K, mine, rh["text"], diff,
                          note="참조 " + ("하한" if lower else "상한") + "값 범위 밖" + (f" · {est}" if est else ""))]
        # [오탐 수정] 화면이 추정값(#)과 같은 방향의 한계를 함께 보여 주면('5# ms (> 620 ns)')
        # 한계값을 확정값처럼 보여 준 게 아님 → 화면의 한계와 참조 한계를 비교
        if (uh.get("est") and ulim and ulim.get("kind") == "value"
                and ulim.get("op") in LIMIT_OPS and (ulim["op"] in ("GT", "GE")) == lower):
            lr = ulim["sec"] / rs
            if abs(lr - 1) <= 0.01:
                return []
            return [issue("낮음", "한계값 차이", "반감기", K, mine, rh["text"],
                          f"{(lr - 1) * 100:+.3g}%" if lr < 10 else f"×{lr:.4g}",
                          note="화면은 추정값(#)과 한계를 함께 표시 — 한계끼리 비교")]
        return [issue("중간", "한계값을 확정값처럼 표시", "반감기", K, mine, rh["text"], diff,
                      note="참조는 한계값 — 화면에 부등호 표시 필요" + (f" · {est}" if est else ""))]

    unc = rh.get("unc")
    if uop in LIMIT_OPS:                                   # 내 값만 한계값, 참조는 측정값
        lower = uop in ("GT", "GE")
        consistent = rs >= us * (1 - 1e-9) if lower else rs <= us * (1 + 1e-9)
        if consistent:
            return [issue("중간", "측정값을 한계값으로 표시", "반감기", K, mine, rh["text"], diff,
                          note="참조는 측정값 — 최신 평가값으로 갱신 필요")]
        return [issue("높음", "반감기 한계와 모순", "반감기", K, mine, rh["text"], diff,
                      note="내 한계값이 참조 측정값과 모순")]
    if rop in ("AP", "CA", "SY"):
        ok = rel <= 0.10
    elif unc:
        ok = abs(us - rs) <= tol["sigma_k"] * unc
    else:
        ok = rel <= tol["half_life_rel_no_unc"]
    if ok:
        return []
    # 추정값(#)은 측정 단위와 무관한 계통 추정이라 단위 혼동 판정에서 제외 (209Th 60# ms ↔ 2.5 ms가 ×24로 잡혔음)
    sus = None if uh.get("est") else unit_suspect(ratio, tol["unit_factor_rel"])
    if sus and rel > 0.2:
        return [issue("치명", "반감기 단위 혼동 의심", "반감기", K, mine, rh["text"], f"×{ratio:.4g}", note=sus)]
    if rel <= 0.01:
        return [issue("낮음", "반감기 미세 차이", "반감기", K, mine, rh["text"], diff,
                      note="반올림·평가 버전 차이 수준 — 데이터 버전 표시 확인")]
    if rel <= 0.10:
        return [issue("높음", "반감기 불일치", "반감기", K, mine, rh["text"], diff, note=est)]
    return [issue("치명", "반감기 불일치", "반감기", K, mine, rh["text"], diff, note=est)]


def fam_totals(items, famf):
    """묶음별 분기비 합 → {묶음: {pct, unc2, known, codes, op}}
    - 같은 코드가 여러 번이면 한 번만 센다 (값이 큰 쪽): LiveChart 중복 행 (100Mo 2B- 100 + 2B- 100)
    - EC+B+ 합계 항목이 있으면 그 값이 묶음 합, 나머지 EC·B+는 그 내역 (NUBASE B+=100;e+=90.57;EC=9.43)
    - op: 묶음 값이 한계값 하나뿐이면 그 부등호 (NUBASE B-n>55)"""
    out = {}
    for code, pct, unc, op in items:
        d = out.setdefault(famf(code), {"by": {}, "codes": set()})
        d["codes"].add(code)
        prev = d["by"].get(code)
        if prev is None or (pct is not None and (prev[0] is None or pct > prev[0])):
            d["by"][code] = (pct, unc, op)
    for d in out.values():
        by = d.pop("by")
        parts = [by["EC+B+"]] if "EC+B+" in by else list(by.values())
        d["known"] = all(p is not None for p, _, _ in parts)
        d["pct"] = sum(p for p, _, _ in parts if p is not None)
        d["unc2"] = sum((u or 0.0) ** 2 for _, u, _ in parts)
        d["op"] = parts[0][2] if len(parts) == 1 and parts[0][2] in LIMIT_OPS else None
    return out


def ec_top(codes):
    """EC/β⁺ 묶음 표기 비교용: 합계(EC+B+)가 있으면 그것만, 없으면 적힌 코드들"""
    return {"EC+B+"} if "EC+B+" in codes else set(codes)


def compare_decay(K, r, rec, fm, units, tol, ctx):
    out = []
    rm = ref_modes(r, ctx)
    for code, _, _, raw in rm:
        if not is_known_mode(code):
            ctx["unknown_ref_codes"][raw] += 1
    if not rm:
        return out
    um = norm_user_modes(user_modes(get_field(rec, fm["decay_modes"])))
    ref_all = modes_text(rm)
    if not um:
        return [issue("중간", "붕괴 모드 누락", "붕괴 방식", K, "", ref_all, note="붕괴 방식 정보 없음")]
    if units["branching"] == "fraction":
        um = [(c, (p * 100.0 if p is not None else None), s, op) for c, p, s, op in um]
    for c, _, s, _ in um:
        if not is_known_mode(c):
            ctx["unknown_user_codes"][s] += 1
    mine_all = modes_text(um)

    rcodes, ucodes = {c for c, *_ in rm}, {c for c, *_ in um}
    split = {"EC", "B+"} <= rcodes and {"EC", "B+"} <= ucodes          # 둘 다 EC·β⁺ 몫을 따로 적었으면 몫끼리 비교
    if split:
        famf = lambda c: c if c in EC_FAMILY else mode_family(c)      # noqa: E731
        rm_c = [x for x in rm if x[0] != "EC+B+"]
        um_c = [x for x in um if x[0] != "EC+B+"]
    else:
        # 같은 과정의 다른 표기(ECP↔B+P, 2EC↔2B+, 클러스터 표기)는 묶음으로 비교
        famf, rm_c, um_c = mode_family, rm, um
    rfam = fam_totals([(c, p, u, None) for c, p, u, _ in rm_c], famf)
    ufam = fam_totals([(c, p, None, op) for c, p, _, op in um_c], famf)

    # 참조는 EC·β⁺를 따로 줬는데 내 데이터에 β⁺가 아예 없음 → 누락으로 처리
    beta_plus_missing = (not split and {"EC", "B+"} <= rcodes
                         and not ({"B+", "EC+B+"} & ucodes) and "EC/B+" in ufam)
    if beta_plus_missing:
        bp = next(p for c, p, _, _ in rm if c == "B+")
        small = bp is not None and bp < 1.0
        out.append(issue("중간" if small else "높음", "소분기 누락" if small else "붕괴 모드 누락",
                         "붕괴 방식", K, mine_all, ref_all, note="β⁺ 분기 없음 (EC만 있음)"))

    for f, d in rfam.items():
        if f not in ufam:
            small = d["known"] and d["pct"] < 1.0
            out.append(issue("중간" if small else "높음", "소분기 누락" if small else "붕괴 모드 누락",
                             "붕괴 방식", K, mine_all, ref_all, note=f"{f} 없음"))
            continue
        u = ufam[f]
        if f == "EC/B+" and ec_top(u["codes"]) != ec_top(d["codes"]) and not beta_plus_missing:
            out.append(issue("낮음", "EC/β⁺ 표기 차이", "붕괴 방식", K, ", ".join(sorted(u["codes"])),
                             ", ".join(sorted(d["codes"])),
                             note="합산해서 비교함. EC·β⁺ 기호 정의를 화면에 명시했는지 확인 (NUBASE의 β⁺ = EC+양전자)"))
        if d["known"] and u["known"]:
            dp = u["pct"] - d["pct"]
            t = max(tol["sigma_k"] * math.sqrt(d["unc2"]), tol["branch_rel"] * d["pct"], tol["branch_abs"])
            uop = u["op"]
            # 내 분기비가 한계값이면 (B-n>55) 참조값이 그 범위 안에 있는지만 봄
            if (uop in ("GT", "GE") and d["pct"] >= u["pct"] - t) or (uop in ("LT", "LE") and d["pct"] <= u["pct"] + t):
                continue
            if abs(dp) > t:
                big = abs(dp) >= 5 or (d["pct"] > 0 and not 0.5 <= u["pct"] / d["pct"] <= 2)
                ref_txt = f"{f} {d['pct']:.4g}%" + (f" ±{math.sqrt(d['unc2']):.2g}" if d["unc2"] else "")
                out.append(issue("높음" if big else "중간", "분기비 불일치", "분기비", K,
                                 f"{f} {OP_TEXT.get(uop, '')}{u['pct']:.4g}%", ref_txt, f"{dp:+.3g}%p",
                                 note="내 값은 한계값" if uop else ""))

    for f, u in ufam.items():
        if f not in rfam:
            txt = f + (f" {OP_TEXT.get(u['op'], '')}{u['pct']:.3g}%" if u["known"] else "")
            q = "" if u["known"] else " · 세기 미상(?) — NUBASE는 예상·가능 모드를 '?'로 적음"
            if len(rm) >= 3:
                out.append(issue("낮음", "참조 상위 3개에 없는 모드", "붕괴 방식", K, txt, ref_all,
                                 note="LiveChart는 상위 3개 모드만 제공 — 4번째 이후 모드인지 NuDat로 확인" + q))
            else:
                out.append(issue("중간", "참조에 없는 붕괴 모드", "붕괴 방식", K, txt, ref_all, note="출처 확인" + q))

    prim = [d for d in ufam.values() if not d["codes"] <= SUBSET_MODES]
    total = sum(d["pct"] for d in prim)
    if prim and all(d["known"] for d in prim) and abs(total - 100.0) > 1.0:
        out.append(issue("중간", "분기비 합 ≠ 100%", "분기비", K, f"합 {total:.4g}%", "",
                         note="β⁻n 등 지연 입자 방출은 부분집합이라 합에서 제외. EC+β⁺ 합계가 있으면 그 내역도 제외"))
    return out


def compare_mass(K, r, rec, fm, units, tol, ctx):
    out = []
    z, n, a, _ = K
    if g(r, "me_systematics").strip().upper() in ("Y", "YES", "TRUE", "1", "#"):
        ctx["ref_sys"] += 1
        if fm.get("systematics_flag") and truthy(get_field(rec, fm["systematics_flag"])) is not True:
            out.append(issue("높음", "추정값을 측정값처럼 표시", "질량(#)", K, "추정 표시 없음", "계통 추정(#)",
                             note="참조 질량이 AME 계통 추정값 — 화면에 # 등 추정 표시 필요"))
    ref_uu = to_float(g(r, "atomic_mass"))
    if not fm.get("atomic_mass") or ref_uu is None:
        return out
    val = parse_plain(get_field(rec, fm["atomic_mass"]))[0]
    ru = ref_uu * 1e-6
    sig = (to_float(g(r, "unc_am")) or 0.0) * 1e-6
    ref_txt = f"{ru:.9f} u" + (f" ±{sig * 1e6:.3g} μu" if sig else "")
    if val is None:
        ctx["missing_mass"] += 1          # 레코드마다 적지 않고 보고서에 건수만 표시
        return out
    mu = val * (1e-6 if units["atomic_mass"] == "uu" else 1.0)
    d = mu - ru
    tol_u = max(tol["sigma_k"] * sig, tol["mass_abs_u"])
    if abs(d) <= tol_u:
        return out
    mine, diff = f"{mu:.9f} u", f"{d * 1e6:+.4g} μu"
    if abs(mu - round(mu)) < 1e-9 and int(round(mu)) == a:
        out.append(issue("높음", "질량수를 원자질량으로 사용", "원자질량", K, mine, ref_txt, diff))
    elif z > 0 and abs(d + z * ELECTRON_MASS_U) <= max(1.5 * electron_binding_u(z) + tol_u, 2e-6):
        out.append(issue("높음", "핵질량 사용 의심", "원자질량", K, mine, ref_txt, diff,
                         note=f"차이 ≈ −Z·mₑ ({-z * ELECTRON_MASS_U * 1e6:.4g} μu). AME·LiveChart 값은 원자질량(전자 포함)"))
    elif abs(d) <= max(5 * sig, 1e-5):
        out.append(issue("낮음", "원자질량 미세 차이", "원자질량", K, mine, ref_txt, diff,
                         note="정밀도·AME 버전 차이 수준 — 버전 표시 확인"))
    else:
        out.append(issue("높음", "원자질량 불일치", "원자질량", K, mine, ref_txt, diff))
    return out


def compare_mass_excess(K, r, rec, fm, units, tol):
    if not fm.get("mass_excess"):
        return []
    ref = to_float(g(r, "massexcess"))
    val = parse_plain(get_field(rec, fm["mass_excess"]))[0]
    if ref is None or val is None:
        return []
    kev = val * (1000.0 if units["mass_excess"] == "MeV" else 1.0)
    sig = to_float(g(r, "unc_me")) or 0.0
    d = kev - ref
    if abs(d) <= max(tol["sigma_k"] * sig, tol["mass_excess_abs_kev"]):
        return []
    mine, ref_txt = f"{kev:.6g} keV", f"{ref:.6g} keV" + (f" ±{sig:.3g}" if sig else "")
    if abs(ref) > 1000 and (abs(kev / ref / 1000 - 1) < 0.02 or abs(kev / ref * 1000 - 1) < 0.02):
        return [issue("치명", "질량초과 단위 혼동 의심", "질량초과", K, mine, ref_txt, f"×{kev / ref:.4g}",
                      note="keV↔MeV")]
    sev = "높음" if abs(d) > max(100.0, 5 * sig) else "중간"
    return [issue(sev, "질량초과 불일치", "질량초과", K, mine, ref_txt, f"{d:+.4g} keV")]


def compare_abundance(K, r, rec, fm, units, tol, ctx, symbol):
    if not fm.get("abundance"):
        return []
    ref = to_float(g(r, "abundance")) or None
    ref_unc = to_float(g(r, "unc_a")) or 0.0
    val = parse_plain(get_field(rec, fm["abundance"]))[0]
    if val is not None and units["abundance"] == "fraction":
        val *= 100.0
    val = val or None
    if val is not None and symbol in CIAAW_INTERVAL:
        ctx["interval_elems"].add(symbol)
    if ref is None and val is None:
        return []
    if ref is None:
        return [issue("중간", "참조에 존재비 없음", "존재비", K, f"{val:.6g}%", "", note="자연 존재 핵종이 아님 — 출처 확인")]
    ref_txt = f"{ref:.6g}%" + (f" ±{ref_unc:.2g}" if ref_unc else "")
    if val is None:
        return [issue("중간", "존재비 누락", "존재비", K, "", ref_txt)]
    d = val - ref
    if abs(d) <= max(tol["sigma_k"] * ref_unc, tol["abund_rel"] * ref, tol["abund_abs"]):
        return []
    ratio = val / ref
    if abs(ratio / 100 - 1) < 0.02 or abs(ratio * 100 - 1) < 0.02:
        return [issue("치명", "존재비 %↔비율 혼동 의심", "존재비", K, f"{val:.6g}%", ref_txt, f"×{ratio:.4g}")]
    sev = "높음" if abs(d) / ref > 0.10 else "중간"
    return [issue(sev, "존재비 불일치", "존재비", K, f"{val:.6g}%", ref_txt, f"{d:+.4g}%p")]


def norm_jp(s):
    if s in (None, ""):
        return ""
    if isinstance(s, (int, float)) and not isinstance(s, bool):   # 숫자 스핀 3.5 → "7/2"
        twice = round(float(s) * 2)
        return f"{twice}/2" if twice % 2 else str(twice // 2)
    t = str(s).translate(SUP_MAP).strip()
    t = re.sub(r"\s*T\s*=\s*\S+", "", t)        # NUBASE가 J^π 칸에 함께 적는 아이소스핀 'T=1' (LiveChart는 별도 열)
    return re.sub(r"\s*,\s*|\s+", ",", t.strip())  # 여러 값 구분자: NUBASE '(1-,2-)' ↔ LiveChart '(1- 2-)'


def compare_jp(K, r, rec, fm, ctx):
    if not fm.get("spin_parity"):
        return []
    rj, uj = norm_jp(g(r, "jp")), norm_jp(get_field(rec, fm["spin_parity"]))
    if not rj:
        return []
    if not uj:
        ctx["missing_jp"] += 1            # 레코드마다 적지 않고 보고서에 건수만 표시
        return []
    if uj == rj:
        return []

    def strip(s):
        return s.replace("(", "").replace(")", "")

    if strip(uj) == strip(rj):
        if "(" in rj and "(" not in uj:
            return [issue("중간", "잠정 J^π를 확정처럼 표시", "J^π", K, uj, rj, note="참조 괄호 = 잠정 할당")]
        return [issue("낮음", "J^π 괄호 표기 차이", "J^π", K, uj, rj)]
    if uj.replace("#", "") == rj.replace("#", ""):
        return [issue("중간", "J^π 추정(#) 표기 차이", "J^π", K, uj, rj)]
    if strip(uj).replace("#", "") == strip(rj).replace("#", ""):
        # [오탐 수정] 값은 같고 불확실 표기만 다름: NUBASE '5/2+#'(계통 추정, 화면 '추정' 배지) ↔ ENSDF '(5/2+)'(잠정)
        #   전에는 '#'과 괄호가 섞이면 'J^π 불일치'(중간)로 떨어졌음
        u_unc, r_unc = ("#" in uj or "(" in uj), ("#" in rj or "(" in rj)
        if u_unc and r_unc:
            return [issue("낮음", "J^π 추정(#)↔잠정() 표기 차이", "J^π", K, uj, rj, note="둘 다 불확실 표시, 값은 같음")]
        if r_unc:
            return [issue("중간", "잠정 J^π를 확정처럼 표시", "J^π", K, uj, rj, note="참조 괄호 = 잠정 할당")]
        return [issue("중간", "J^π 추정(#) 표기 차이", "J^π", K, uj, rj)]
    if not re.search(r"[+-]", uj) and re.sub(r"[+\-#()]", "", rj) == strip(uj):
        return [issue("낮음", "패리티 표기 없음", "J^π", K, uj, rj)]
    return [issue("중간", "J^π 불일치", "J^π", K, uj, rj)]


def compare_one(zn, r, rec, fm, units, stable_if_no_hl, tol, ctx):
    z, n = zn
    a = z + n
    K = (z, n, a, nuc_label(z, a, g(r, "symbol") or None))
    symbol = ELEMENTS[z] if 0 <= z < len(ELEMENTS) else g(r, "symbol")
    out = []

    rh = ref_half_life(r)
    ru = g(r, "unit_hl")
    if ru and not time_factor(ru) and ru.lower() not in ENERGY_UNITS:
        ctx["unknown_ref_units"][ru] += 1
    uh = parse_user_half_life(
        get_field(rec, fm["half_life"]) if fm.get("half_life") else None,
        unit_hint=get_field(rec, fm["half_life_unit"]) if fm.get("half_life_unit") else None,
        op_hint=get_field(rec, fm["half_life_operator"]) if fm.get("half_life_operator") else None,
        num_unit=units["half_life"])
    flag = truthy(get_field(rec, fm["stable"])) if fm.get("stable") else None
    if flag is not None:
        ust = flag
    elif uh["kind"] == "stable":
        ust = True
    elif uh["kind"] in ("value", "bad", "numeric_unknown"):
        ust = False
    else:
        ust = True if stable_if_no_hl else None
    mine = user_text_hl(uh, ust, get_field(rec, fm["half_life_display"]) if fm.get("half_life_display") else None)
    ulim = parse_user_half_life(get_field(rec, fm["half_life_limit"])) if fm.get("half_life_limit") else None
    rstable = rh["kind"] == "stable"
    ref_lower = rh["kind"] == "value" and rh.get("op") in ("GT", "GE")    # 참조 = 반감기 하한만 (붕괴 미관측)

    # 1) 안정 / 방사성
    if rstable and ust is False:
        out.append(issue("치명", "안정성 오분류", "안정성", K, mine, "STABLE", note="참조=안정, 내 데이터=방사성"))
    elif not rstable and ust is True:
        if ref_lower:
            # [오탐 수정] 참조 '>1.3E+18 Y'(하한)와 '안정'은 모순 아님 (NUBASE stbl ↔ ENSDF 하한).
            #   전에는 치명 '안정성 오분류'로 잡았음 → 화면에 보이는 하한끼리 비교
            if ulim and ulim["kind"] == "value" and ulim.get("op") in ("GT", "GE"):
                out += compare_half_life(K, rh, ulim, tol, mine)
            else:
                out.append(issue("중간", "관측상 안정 — 하한 표시 없음", "안정성", K, mine, rh["text"],
                                 note="참조는 반감기 하한(붕괴 미관측) — 화면에 하한(>…) 표시 필요"))
        else:
            note = "참조=방사성, 내 데이터=안정"
            if rh["kind"] == "value" and rh["sec"] >= 1e15 * YEAR_S:
                note += " · 초장반감기(10¹⁵ y 이상) — '관측상 안정'으로 둔 거라면 화면에 근거 표시 필요"
            out.append(issue("치명", "안정성 오분류", "안정성", K, mine, rh["text"], note=note))

    # 2) 반감기 · 붕괴 방식
    if not rstable and ust is not True:
        out += compare_half_life(K, rh, uh, tol, mine, ulim)
        if fm.get("decay_modes"):
            out += compare_decay(K, r, rec, fm, units, tol, ctx)
    elif (rstable or ref_lower) and fm.get("decay_modes"):
        um = norm_user_modes(user_modes(get_field(rec, fm["decay_modes"])))
        # 참조도 같은 모드를 적었으면 문제 아님 (LiveChart도 안정 핵종 일부에 2B-·2EC 등을 적음)
        rf = {mode_family(c) for c, *_ in ref_modes(r)}
        extra = [x for x in (um or []) if mode_family(x[0]) not in rf]
        if extra:
            unknown = all(p is None for _, p, *_ in extra)
            out.append(issue("중간", "안정인데 붕괴 모드 있음", "붕괴 방식", K, modes_text(extra), rh["text"],
                             note=("세기 미상(?) — NUBASE는 에너지상 가능하지만 관측 안 된 모드를 '?'로 적음. "
                                   "화면에서 '미관측 모드'임을 알 수 있는지 확인") if unknown else ""))

    # 3) 질량 · 존재비 · J^π
    out += compare_mass(K, r, rec, fm, units, tol, ctx)
    out += compare_mass_excess(K, r, rec, fm, units, tol)
    out += compare_abundance(K, r, rec, fm, units, tol, ctx, symbol)
    out += compare_jp(K, r, rec, fm, ctx)
    return out


STATE_FIELDS = {"안정성", "반감기", "붕괴 방식", "분기비", "J^π"}


def new_ctx():
    return {"ref_sys": 0, "interval_elems": set(), "unknown_ref_codes": Counter(),
            "unknown_user_codes": Counter(), "unknown_ref_units": Counter(),
            "missing_mass": 0, "missing_jp": 0, "ref_zero_pct": 0, "swaps": []}


def compare_matched(zn, r, rec, isos, fm, units, stable_if_no_hl, tol, ctx):
    """바닥상태 비교 + 바닥·이성질체 배정 차이 처리.
    [오탐 수정] NUBASE와 ENSDF가 다른 상태를 바닥상태로 보는 핵종(NUBASE '&' 25개 등)은
    LiveChart 바닥상태가 내 데이터의 이성질체와 같음 (70Co: LiveChart 112 ms = 내 Co-70m 112 ms).
    내 바닥상태 반감기가 치명·높음으로 어긋나고 이성질체 하나가 참조와 맞으면, 상태별 항목
    (안정성·반감기·붕괴·J^π)은 그 이성질체와 비교하고 배정 차이를 한 건으로 따로 적음.
    질량·존재비는 AME·NUBASE 바닥상태 기준 그대로."""
    out = compare_one(zn, r, rec, fm, units, stable_if_no_hl, tol, ctx)
    if not isos or not any(i["severity"] in ("치명", "높음") and i["field"] in ("반감기", "안정성") for i in out):
        return out

    def flag(name, iso):
        return bool(fm.get(name)) and any(truthy(get_field(x, fm[name])) for x in (rec, iso))

    def jp_core(x):
        return re.sub(r"[()#\[\]]", "", norm_jp(get_field(x, fm["spin_parity"]))) if fm.get("spin_parity") else ""

    rj = re.sub(r"[()#\[\]]", "", norm_jp(g(r, "jp")))
    for iso in isos:
        alt = compare_one(zn, r, iso, fm, units, stable_if_no_hl, tol, new_ctx())
        if any(i["field"] in ("반감기", "안정성") and i["severity"] != "낮음" for i in alt):
            continue
        # NUBASE가 순서를 표시(&, *)했거나, 참조 J^π가 이 이성질체와 같고 내 바닥상태와는 다를 때만 인정
        # (반감기만 우연히 비슷한 경우 제외: 97Cd·129Cd는 참조 J^π가 내 바닥상태와 같음)
        if (flag("order_inverted", iso) or flag("order_uncertain", iso)
                or (rj and rj == jp_core(iso) and rj != jp_core(rec))):
            break
    else:
        return out
    z, n = zn
    K = (z, n, z + n, nuc_label(z, z + n, g(r, "symbol") or None))
    iso_name = get_field(iso, fm.get("name")) or "이성질체"
    if flag("order_inverted", iso):
        why, sev = "NUBASE '&' = ENSDF와 순서 반대로 표시된 핵종", "낮음"
    elif flag("order_uncertain", iso):
        why, sev = "NUBASE '*' = 바닥·이성질체 순서 불확실로 표시된 핵종", "낮음"
    else:
        why, sev = "NUBASE에 순서 표시 없음(참조 J^π가 이 이성질체와 같음) — 어느 상태가 바닥상태인지 출처 확인", "중간"

    def shown(x):
        d = get_field(x, fm["half_life_display"]) if fm.get("half_life_display") else None
        return d or str(get_field(x, fm["half_life"]) if fm.get("half_life") else "")

    ctx["swaps"].append(f"{K[3]}↔{iso_name}")
    swap_issue = issue(sev, "바닥·이성질체 배정 차이", "상태 배정", K,
                       f"바닥 {shown(rec)} / {iso_name} {shown(iso)}", ref_half_life(r)["text"],
                       note=f"LiveChart 바닥상태 = 내 {iso_name} (반감기 일치). {why}. "
                            f"반감기·붕괴·J^π는 {iso_name}와 비교함")
    for i in alt:
        if i["field"] in STATE_FIELDS:
            i["note"] = f"[{iso_name}와 비교] " + i["note"]
    return ([i for i in out if i["field"] not in STATE_FIELDS] + [swap_issue]
            + [i for i in alt if i["field"] in STATE_FIELDS])


# ════════════════════════════════════════════════════════════════════
# 출력
# ════════════════════════════════════════════════════════════════════
CSV_COLS = [("severity", "심각도"), ("category", "범주"), ("nuclide", "핵종"), ("Z", "Z"), ("N", "N"),
            ("A", "A"), ("field", "항목"), ("mine", "내 값"), ("ref", "참조값"), ("diff", "차이"),
            ("note", "메모")]


def pick_top(issues, top):
    """치명·높음에서 범주가 한쪽으로 쏠리지 않게 상위 목록 선택"""
    hi = [i for i in issues if i["severity"] in ("치명", "높음")]
    cap = max(5, top // 4)
    chosen, per = [], Counter()
    for i in hi:
        if len(chosen) >= top:
            break
        if per[i["category"]] < cap:
            chosen.append(i)
            per[i["category"]] += 1
    for i in hi:
        if len(chosen) >= top:
            break
        if i not in chosen:
            chosen.append(i)
    chosen.sort(key=lambda i: (SEV_RANK[i["severity"]], i["category"], i["Z"], i["N"]))
    return chosen, len(hi)


def write_outputs(outdir, issues, stats, meta, notes, top):
    os.makedirs(outdir, exist_ok=True)
    csv_path = os.path.join(outdir, "diff_details.csv")
    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow([h for _, h in CSV_COLS])
        for i in issues:
            w.writerow([i[k] for k, _ in CSV_COLS])

    sev = Counter(i["severity"] for i in issues)
    cats = Counter((i["severity"], i["category"]) for i in issues)
    L = []
    L += ["# LiveChart 전수 비교 결과", "",
          "## 기준",
          "- 참조: IAEA LiveChart `ground_states` (ENSDF·AME·NUBASE 기반)",
          f"- 참조 파일: `{meta['ref_path']}` · 받은 시각 {meta['downloaded_at']} · "
          f"Extraction_date {meta['extraction']}",
          f"- 내 데이터: `{meta['data_path']}` · 레코드 {stats['records']}개",
          f"- 실행: {meta['run_at']} · livechart_diff.py v{__version__}",
          "- 판정: 반감기·질량·존재비는 참조 불확도 2σ 안이면 일치, 분기비는 max(2σ, 참조값 1%, 0.05%p)", "",
          "## 한눈에", "",
          "| 심각도 | 건수 |", "|---|---|"]
    L += [f"| {s} | {sev.get(s, 0)} |" for s in SEVERITIES]
    L += ["", "| 심각도 | 범주 | 건수 |", "|---|---|---|"]
    for (s, c), cnt in sorted(cats.items(), key=lambda kv: (SEV_RANK[kv[0][0]], -kv[1])):
        L.append(f"| {s} | {c} | {cnt} |")
    L += ["", "## 커버리지", "", "| 항목 | 개수 |", "|---|---|"]
    L += [f"| {k} | {v} |" for k, v in (
        ("참조 바닥상태", stats["ref_total"]),
        ("내 데이터 레코드", stats["records"]),
        ("비교 대상 (바닥상태)", stats["resolved"]),
        ("매칭", stats["matched"]),
        ("참조에만 있음", f"{stats['only_ref']} (안정·반감기 1초 이상 {stats['only_ref_notable']})"),
        ("내 데이터에만 있음", stats["only_user"]),
        ("이성질체 — 비교 제외", stats["isomers"]),
        ("Z·N 판별 불가", stats["unresolved"]),
        ("중복 Z·N", stats["dups"]))]
    chosen, n_hi = pick_top(issues, top)
    L += ["", f"## 치명·높음 상위 {len(chosen)}건" + (f" (전체 {n_hi}건)" if n_hi > len(chosen) else ""), ""]
    if chosen:
        L += ["| 심각도 | 핵종 | 범주 | 내 값 | 참조값 | 차이 | 메모 |", "|---|---|---|---|---|---|---|"]
        L += [f"| {i['severity']} | {i['nuclide']} | {i['category']} | {md(i['mine'])} | {md(i['ref'])} | "
              f"{md(i['diff'])} | {md(i['note'])} |" for i in chosen]
    else:
        L.append("없음")
    L += ["", "## 해석 시 주의", ""]
    L += [f"- {x}" for x in notes]
    L.append("- 전체 목록: `diff_details.csv` (엑셀에서 심각도·범주로 필터)")
    md_path = os.path.join(outdir, "diff_report.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    return csv_path, md_path


def print_inspect(path, recs, rec_note, fm, how, warns):
    print("=== 내 데이터 점검 ===")
    print(f"파일: {path} · 레코드 {len(recs)}개" + (f" ({rec_note})" if rec_note else ""))
    if recs:
        s = json.dumps(recs[0], ensure_ascii=False, indent=2, default=str)
        print("\n첫 레코드")
        print("\n".join("  " + ln for ln in s.splitlines()[:30]))
    print("\n필드 매핑 (← 내 데이터 필드 · 예시 값)")
    sample = recs[:50]
    for f in CONFIG["fields"]:
        src = fm.get(f)
        if src:
            ex = next((get_field(r, src) for r in sample if get_field(r, src) is not None), None)
            ex_s = json.dumps(ex, ensure_ascii=False, default=str)
            ex_s = ex_s if len(ex_s) <= 60 else ex_s[:57] + "..."
            print(f"  {f:<19}← {src:<18} {ex_s}   [{how.get(f)}]")
        else:
            print(f"  {f:<19}  (없음)")
    resolved = isom = unres = 0
    for rec in recs:
        z, n, iso = resolve_zn(rec, fm, set())
        if z is None or n is None:
            unres += 1
        elif is_isomer(rec, fm, iso):
            isom += 1
        else:
            resolved += 1
    print(f"\nZ·N 판별: 바닥상태 {resolved} · 이성질체 {isom} · 판별 불가 {unres}")
    if warns:
        print("\n경고")
        for w in warns:
            print(f"  - {w}")
    print("\n다음: 매핑이 맞으면  python livechart_diff.py " + path)
    print("      틀리면 스크립트 위쪽 CONFIG['fields']에 필드 이름을 직접 적기")


# ════════════════════════════════════════════════════════════════════
# 실행
# ════════════════════════════════════════════════════════════════════
def main(argv=None):
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except Exception:
            pass
    ap = argparse.ArgumentParser(description="내 핵종 데이터 ↔ IAEA LiveChart 바닥상태 전수 비교")
    ap.add_argument("data", nargs="?", help="내 데이터 파일 (JSON/CSV)")
    ap.add_argument("--inspect", action="store_true", help="필드 자동 매핑만 확인")
    ap.add_argument("--ref", help="LiveChart CSV 경로 (기본: 스크립트 폴더의 livechart_ground_states.csv, 없으면 다운로드)")
    ap.add_argument("--refresh", action="store_true", help="참조 데이터 새로 받기")
    ap.add_argument("--out", default=DEFAULT_OUT, help="결과 폴더 (기본: 스크립트 폴더의 diff_out)")
    ap.add_argument("--top", type=int, default=40, help="보고서에 넣을 치명·높음 건수")
    ap.add_argument("--download-only", action="store_true", help="참조 데이터만 받기")
    ap.add_argument("--recheck", action="store_true",
                    help="치명·높음이 나온 핵종을 LiveChart 단건 API(최신값)로 다시 받아 재비교 "
                         "(일괄 CSV는 고정 스냅샷이라 늦게 갱신됨)")
    ap.add_argument("--live-cache", default=os.path.join(SCRIPT_DIR, "livechart_live"),
                    help="--recheck로 받은 단건 CSV 보관 폴더 (기본: 스크립트 폴더의 livechart_live)")
    args = ap.parse_args(argv)

    ref_path = args.ref or DEFAULT_REF
    if args.download_only:
        download_ref(ref_path)
        return
    if not args.data:
        ap.error("내 데이터 파일 경로가 필요합니다")

    recs, rec_note = load_user_records(args.data, CONFIG["records_path"])
    fm, how = detect_fields(recs, CONFIG["fields"])
    fm, warns = sanity_fields(recs, fm, how)
    if args.inspect:
        print_inspect(args.data, recs, rec_note, fm, how, warns)
        return

    if args.refresh or not os.path.exists(ref_path):
        if args.ref and os.path.exists(args.ref) and not args.refresh:
            pass
        else:
            download_ref(ref_path)
    rows = load_ref(ref_path)
    ref_by_zn = {}
    for r in rows:
        z, n = to_int(g(r, "z")), to_int(g(r, "n"))
        if z is not None and n is not None:
            ref_by_zn[(z, n)] = r
    ref_keys = set(ref_by_zn)

    resolved, isomers, unresolved = [], [], []
    for rec in recs:
        z, n, iso = resolve_zn(rec, fm, ref_keys)
        if z is None or n is None:
            unresolved.append(rec)
        elif is_isomer(rec, fm, iso):
            isomers.append(((z, n), rec))
        else:
            resolved.append(((z, n), rec))

    units, sinh, infer_notes = prepass(ref_by_zn, resolved, fm, CONFIG)
    by_zn = defaultdict(list)
    for zn, rec in resolved:
        by_zn[zn].append(rec)
    iso_by_zn = defaultdict(list)          # 바닥·이성질체 배정 차이 확인용 (compare_matched)
    for zn, rec in isomers:
        iso_by_zn[zn].append(rec)

    tol = CONFIG["tolerance"]

    def key_for(zn):
        z, n = zn
        r = ref_by_zn.get(zn)
        return (z, n, z + n, nuc_label(z, z + n, (g(r, "symbol") or None) if r else None))

    def run():
        """비교 한 번 (--recheck면 참조를 단건 최신값으로 덮어쓴 뒤 다시 부름)"""
        ctx, issues = new_ctx(), []
        cov = {"dups": [zn for zn, lst in by_zn.items() if len(lst) > 1],
               "matched": sorted(set(by_zn) & ref_keys), "only_ref": sorted(ref_keys - set(by_zn)),
               "only_user": sorted(set(by_zn) - ref_keys), "notable": 0}
        for zn in cov["dups"]:
            names = ", ".join(str(get_field(r, fm.get("name")) or "?") for r in by_zn[zn][:4])
            issues.append(issue("높음", "중복 Z·N 레코드", "식별", key_for(zn), f"{len(by_zn[zn])}건: {names}", "",
                                note="같은 Z·N 레코드가 여러 개 — 이성질체 표시 누락 의심. 첫 레코드만 비교"))
        for zn in cov["only_ref"]:
            rh = ref_half_life(ref_by_zn[zn])
            big = rh["kind"] == "stable" or (rh["kind"] == "value" and rh["sec"] >= 1.0)
            cov["notable"] += big
            issues.append(issue("중간" if big else "낮음", "참조에만 있음", "커버리지", key_for(zn), "", rh["text"],
                                note="내 데이터에 없음"))
        for zn in cov["only_user"]:
            obs = truthy(get_field(by_zn[zn][0], fm["observed"])) if fm.get("observed") else None
            if obs is False:   # 화면에 '미관측'으로 구분 표시됨 → 아래 메모의 요구가 이미 충족된 경우
                issues.append(issue("낮음", "내 데이터에만 있음", "커버리지", key_for(zn), "미관측 표시", "",
                                    note="LiveChart 바닥상태에 없음 — 미관측(이론 예측) 핵종으로 화면에 구분 표시됨"))
            else:
                issues.append(issue("중간", "내 데이터에만 있음", "커버리지", key_for(zn),
                                    note="LiveChart 바닥상태에 없음 — Z·N 오류이거나 미관측(이론 예측) 핵종이면 구분 표시 필요"
                                         + (" · 내 데이터는 관측 핵종(발견 연도 있음) — LiveChart 스냅샷 이후 발견인지 확인"
                                            if obs else "")))
        for zn in cov["matched"]:
            issues += compare_matched(zn, ref_by_zn[zn], by_zn[zn][0], iso_by_zn.get(zn, ()), fm, units, sinh,
                                      tol, ctx)
        issues.sort(key=lambda i: (SEV_RANK[i["severity"]], i["category"], i["Z"], i["N"]))
        return issues, ctx, cov

    issues, ctx, cov = run()
    live_changed, live_failed, live_n = [], [], 0
    if args.recheck:
        flagged = sorted({(i["Z"], i["N"]) for i in issues
                          if i["severity"] in ("치명", "높음") and (i["Z"], i["N"]) in ref_by_zn})
        print(f"단건 재확인: 치명·높음 핵종 {len(flagged)}개 → LiveChart 단건 API ({args.live_cache})")
        live, live_failed = fetch_live(flagged, args.live_cache, refresh=args.refresh)
        live_n = len(live)
        for zn, row in live.items():
            if ref_changed_cols(ref_by_zn[zn], row):
                live_changed.append(zn)
            ref_by_zn[zn] = row
        issues, ctx, cov = run()
        changed = set(live_changed)
        for i in issues:
            if (i["Z"], i["N"]) in changed:
                i["note"] = ("[참조: 단건 API 최신값] " + i["note"]).strip()
    dups, matched, only_ref, only_user, notable = (cov["dups"], cov["matched"], cov["only_ref"],
                                                   cov["only_user"], cov["notable"])

    # 보고서 메모
    notes = []
    mapped = [f"{f}←{fm[f]}" for f in CONFIG["fields"] if fm.get(f)]
    notes.append("필드 매핑: " + ", ".join(mapped))
    notes += warns + infer_notes
    if args.recheck:
        s = (f"단건 재확인(--recheck): 치명·높음 핵종 {live_n}개는 LiveChart 단건 API 최신값으로 다시 비교함. "
             f"일괄 스냅샷과 값이 다른 핵종 {len(live_changed)}개")
        if live_changed:
            s += ": " + ", ".join(key_for(zn)[3] for zn in live_changed[:25]) + (" …" if len(live_changed) > 25 else "")
        if live_failed:
            s += f" · 받기 실패 {len(live_failed)}개 ({', '.join(live_failed[:5])})"
        notes.append(s + ". 나머지 핵종은 일괄 스냅샷 기준")
    else:
        notes.append("참조 = 일괄(all) CSV 스냅샷. 단건 API가 더 최신일 수 있음 → --recheck로 치명·높음 핵종 재확인")
    notes.append("붕괴 모드: LiveChart는 상위 3개만 제공 → '참조 상위 3개에 없는 모드'는 NuDat로 확인")
    notes.append("반감기 비교 기준: LiveChart half_life_sec (1 y = 365.2422 d). 준위 폭(Γ)은 T½ = ħ·ln2/Γ로 환산 "
                 "(폭의 부등호는 반감기에서 방향이 반대: Γ < x → T½ > ħ·ln2/x)")
    if CONFIG.get("nubase_beta_plus"):
        notes.append("붕괴 표기: 내 데이터는 NUBASE 표기 — β⁺(B+) = EC+β⁺ 합계, e+ = 그중 양전자 몫으로 읽어 "
                     "LiveChart EC+B+와 비교. 화면 배지 'β+'가 EC 포함임을 사용자가 알 수 있는지 확인")
    notes.append("붕괴 묶음 비교: EC·β⁺(EC+B+), β⁺지연 방출(ECP↔B+P, ECSF↔B+SF↔SF+EC+B+), 2EC↔2B+, "
                 "클러스터(원소별: 24Ne·{+24}Ne·24Ne+26Ne)는 같은 묶음으로 합산해 비교")
    if ctx["ref_zero_pct"]:
        notes.append(f"참조 분기비 0(불확도 없음) {ctx['ref_zero_pct']}건은 '세기 미상'으로 읽음 "
                     "(LiveChart가 관측됐지만 세기가 없는 모드를 0으로 적음. 예: 126La EC+B+ 0 = 유일한 모드)")
    if ctx["swaps"]:
        notes.append(f"바닥·이성질체 배정 차이 {len(ctx['swaps'])}건: LiveChart 바닥상태가 내 데이터의 이성질체와 "
                     "일치 → 상태별 항목은 그 이성질체와 비교 (" + ", ".join(ctx["swaps"][:12])
                     + (" …" if len(ctx["swaps"]) > 12 else "") + ")")
    if isomers:
        notes.append(f"이성질체 {len(isomers)}건은 비교 제외 (배정 차이 확인에만 사용) → 골든 세트·NuDat로 별도 확인")
    if unresolved:
        ex = ", ".join(str(get_field(r, fm.get("name")) or r)[:30] for r in unresolved[:5])
        notes.append(f"Z·N 판별 불가 {len(unresolved)}건 (예: {ex})")
    if ctx["ref_sys"]:
        s = f"참조 질량 중 계통 추정(#) {ctx['ref_sys']}건 (매칭 핵종 기준)"
        if not fm.get("systematics_flag"):
            s += " — 내 데이터에 추정 표시 필드 없음 → 화면에서 # 표시 여부 확인"
        notes.append(s)
    if ctx["missing_mass"]:
        notes.append(f"원자질량 값 없는 레코드 {ctx['missing_mass']}건 (매칭 핵종 기준)")
    if ctx["missing_jp"]:
        notes.append(f"J^π 값 없는 레코드 {ctx['missing_jp']}건 (참조에는 있음)")
    if ctx["interval_elems"]:
        notes.append("CIAAW가 원자량을 구간으로 주는 원소에 단일 존재비 사용: "
                     + ", ".join(sorted(ctx["interval_elems"])) + " → 자연 변동폭 안내 필요 여부 확인")
    for key, label in (("unknown_ref_codes", "참조"), ("unknown_user_codes", "내 데이터")):
        if ctx[key]:
            notes.append(f"인식 못 한 붕괴 코드 ({label}): "
                         + ", ".join(f"{c}×{k}" for c, k in ctx[key].most_common(10))
                         + " → 스크립트의 MODE_SYNONYMS에 추가하면 정확해짐")
    if ctx["unknown_ref_units"]:
        notes.append("인식 못 한 참조 반감기 단위: " + ", ".join(ctx["unknown_ref_units"])
                     + " → TIME_UNITS에 추가 필요")

    ext = sorted({g(r, "extraction_date") for r in ref_by_zn.values() if g(r, "extraction_date")})
    meta_path = ref_path + ".meta.json"
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as f:
            downloaded = json.load(f).get("downloaded_at", "?")
    else:
        downloaded = dt.datetime.fromtimestamp(os.path.getmtime(ref_path)).isoformat(timespec="seconds") + " (파일 수정 시각)"
    def shown_path(p):          # 보고서는 LLM 프롬프트에 붙이므로 PC 절대경로 대신 상대경로
        try:
            rel = os.path.relpath(p)
        except ValueError:      # Windows에서 드라이브가 다르면
            rel = os.path.basename(p)
        return rel.replace("\\", "/")

    meta = {"ref_path": shown_path(ref_path), "downloaded_at": downloaded,
            "extraction": (ext[0] if len(ext) == 1 else f"{ext[0]} ~ {ext[-1]}") if ext else "?",
            "data_path": args.data,
            "run_at": dt.datetime.now().astimezone().isoformat(timespec="seconds")}
    stats = {"ref_total": len(ref_by_zn), "records": len(recs), "resolved": len(resolved),
             "matched": len(matched), "only_ref": len(only_ref), "only_ref_notable": notable,
             "only_user": len(only_user), "isomers": len(isomers), "unresolved": len(unresolved),
             "dups": len(dups)}
    csv_path, md_path = write_outputs(args.out, issues, stats, meta, notes, args.top)

    sev = Counter(i["severity"] for i in issues)
    print("비교 완료")
    print(f"  매칭 {len(matched)} / 참조 {len(ref_by_zn)} / 내 데이터 {len(recs)}")
    print("  " + " · ".join(f"{s} {sev.get(s, 0)}" for s in SEVERITIES))
    print(f"  → {md_path}")
    print(f"  → {csv_path}")


if __name__ == "__main__":
    main()