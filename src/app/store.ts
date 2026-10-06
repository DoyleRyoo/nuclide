import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Locale } from '../i18n';
import type { NuclideIndex } from '../data/types';
import { DEFAULT_ISOMER_MARKER_SECONDS, ISOMER_MARKER_THRESHOLDS } from '../data/stability';

export type ColorMode = 'decay' | 'halflife' | 'binding';
interface Settings {
  colorMode: ColorMode;
  theme: 'system' | 'light' | 'dark';
  locale: Locale;
  wheelMode: 'scroll' | 'zoom';
  showPredicted: boolean;
  hintSeen: boolean;
  /** 지도 이성질체 삼각형의 반감기 문턱(초) */
  isomerThreshold: number;
}
interface AppState extends Settings {
  index: NuclideIndex | null;
  status: 'loading' | 'ready' | 'error';
  /** AME 상세 청크를 불러와 index의 핵종에 채웠는지 (첫 차트 뒤에 불러온다) */
  ameReady: boolean;
  selectedId: string | null;
  expandedStateId: string | null;
  panelOpen: boolean;
  select: (id: string | null, open?: boolean, stateId?: string | null) => void;
  setSettings: (values: Partial<Settings>) => void;
}
const safeStorage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* 비공개 모드에서도 앱은 계속 동작한다. */
    }
  },
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* 선택적 저장 */
    }
  },
};
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      index: null,
      status: 'loading',
      ameReady: false,
      selectedId: null,
      expandedStateId: null,
      panelOpen: false,
      colorMode: 'decay',
      theme: 'system',
      locale: 'ko',
      wheelMode: 'scroll',
      showPredicted: true,
      hintSeen: false,
      isomerThreshold: DEFAULT_ISOMER_MARKER_SECONDS,
      select: (id, open = true, stateId = null) =>
        set({ selectedId: id, panelOpen: !!id && open, expandedStateId: stateId }),
      setSettings: (values) => set(values),
    }),
    {
      name: 'nuclide-map:settings:v1',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: ({
        colorMode,
        theme,
        locale,
        wheelMode,
        showPredicted,
        hintSeen,
        isomerThreshold,
      }) => ({
        colorMode,
        theme,
        locale,
        wheelMode,
        showPredicted,
        hintSeen,
        isomerThreshold,
      }),
      merge: (persisted, current) => {
        const saved = (persisted || {}) as Partial<Settings>;
        return {
          ...current,
          colorMode: ['decay', 'halflife', 'binding'].includes(saved.colorMode || '')
            ? saved.colorMode!
            : current.colorMode,
          theme: ['system', 'light', 'dark'].includes(saved.theme || '')
            ? saved.theme!
            : current.theme,
          locale: saved.locale === 'en' ? 'en' : 'ko',
          wheelMode: saved.wheelMode === 'zoom' ? 'zoom' : 'scroll',
          showPredicted: typeof saved.showPredicted === 'boolean' ? saved.showPredicted : true,
          hintSeen: saved.hintSeen === true,
          isomerThreshold: ISOMER_MARKER_THRESHOLDS.some((t) => t.seconds === saved.isomerThreshold)
            ? saved.isomerThreshold!
            : current.isomerThreshold,
        };
      },
    },
  ),
);
