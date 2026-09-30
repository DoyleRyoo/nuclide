import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Atom,
  ChevronDown,
  HelpCircle,
  Maximize,
  Menu,
  Minus,
  Monitor,
  Moon,
  Plus,
  Settings2,
  Sun,
  X,
} from 'lucide-react';
import { useAppStore, type ColorMode } from './store';
import { readUrl, writeUrl } from './urlState';
import { useT } from '../i18n';
import { loadAmeDetails, loadNuclides } from '../data/load';
import { ChartEngine } from '../chart/ChartEngine';
import { getTheme, applyTheme } from '../theme/applyTheme';
import type { ThemeTokens } from '../theme/tokens';
import type { SearchResult } from '../data/search';
import { formatHalfLife } from '../data/format';
import InfoPanel from '../components/InfoPanel';
import SearchBox from '../components/SearchBox';
import HelpDialog from '../components/HelpDialog';
import Minimap from '../components/Minimap';

const decayColors: Record<string, string> = {
  stable: '#111827',
  'beta-': '#2563eb',
  'beta+': '#dc2626',
  alpha: '#facc15',
  sf: '#22c55e',
  p: '#f97316',
  n: '#7c3aed',
};
const categories = ['stable', 'beta-', 'beta+', 'alpha', 'sf', 'p', 'n'] as const;
function useMedia(query: string) {
  const [value, setValue] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const update = () => setValue(m.matches);
    m.addEventListener('change', update);
    return () => m.removeEventListener('change', update);
  }, [query]);
  return value;
}

export default function App() {
  const t = useT();
  const state = useAppStore();
  const {
    index,
    status,
    selectedId,
    panelOpen,
    colorMode,
    theme,
    locale,
    wheelMode,
    showPredicted,
    hintSeen,
  } = state;
  const chart = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const engineRef = useRef<ChartEngine | null>(null);
  const [engine, setEngine] = useState<ChartEngine | null>(null);
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
  const [sheet, setSheet] = useState(1);
  const [legend, setLegend] = useState(() => window.innerWidth >= 768);
  const [toast, setToast] = useState('');
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [scale, setScale] = useState(0);
  const mobile = useMedia('(max-width: 767px)');
  const darkSystem = useMedia('(prefers-color-scheme: dark)');
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const [tokens, setTokens] = useState<ThemeTokens>(() => getTheme(theme));
  const syncSuppressed = useRef(false);
  const initialized = useRef(false);
  const retryCount = useRef(0);
  const currentUrl = () => {
    const s = useAppStore.getState();
    return {
      id: s.expandedStateId || s.selectedId,
      color: s.colorMode,
      view: engineRef.current?.getCamera() || null,
    };
  };
  const syncUrl = useCallback(() => writeUrl(currentUrl()), []);
  const load = useCallback(() => {
    const attempt = ++retryCount.current;
    useAppStore.setState({ status: 'loading', ameReady: false });
    loadNuclides()
      .then((data) => {
        if (attempt !== retryCount.current) return;
        useAppStore.setState({ index: data, status: 'ready' });
        // AME 상세 값은 첫 차트 뒤에 받는다. 실패하면 패널에서 그 값만 빠진다.
        loadAmeDetails(data)
          .then(() => {
            if (attempt === retryCount.current) useAppStore.setState({ ameReady: true });
          })
          .catch(() => undefined);
      })
      .catch(() => {
        if (attempt === retryCount.current) useAppStore.setState({ status: 'error' });
      });
  }, []);
  useEffect(() => {
    load();
    return () => {
      retryCount.current++;
    };
  }, [load]);
  useEffect(() => {
    const next = getTheme(theme);
    applyTheme(next);
    setTokens(next);
  }, [theme, darkSystem]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!index || !chart.current) return;
    const s = useAppStore.getState();
    const e = new ChartEngine({
      container: chart.current,
      index,
      theme: getTheme(s.theme),
      colorMode: s.colorMode,
      wheelMode: s.wheelMode,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
    engineRef.current = e;
    setEngine(e);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hoverTimer: ReturnType<typeof setTimeout> | undefined;
    const listeners = [
      e.on('select', (id) => {
        useAppStore.getState().select(id);
        useAppStore.getState().setSettings({ hintSeen: true });
      }),
      e.on('navigate', (id) => {
        useAppStore.getState().select(id, useAppStore.getState().panelOpen);
      }),
      e.on('activate', (id) => {
        if (id) {
          useAppStore.getState().select(id);
          setTimeout(
            () => document.querySelector<HTMLHeadingElement>('.panel-header h2')?.focus(),
            0,
          );
        }
      }),
      e.on('hover', (value) => {
        clearTimeout(hoverTimer);
        if (!value) setHover(null);
        else hoverTimer = setTimeout(() => setHover(value), 120);
      }),
      e.on('camera', (c) => {
        setScale(c.s);
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (!syncSuppressed.current) writeUrl(currentUrl());
        }, 300);
      }),
    ];
    initialized.current = false;
    return () => {
      clearTimeout(timer);
      clearTimeout(hoverTimer);
      listeners.forEach((off) => off());
      e.destroy();
      engineRef.current = null;
      initialized.current = false;
    };
  }, [index]);

  useEffect(() => {
    if (!engine || !index) return;
    const restore = () => {
      syncSuppressed.current = true;
      const url = readUrl(location.search);
      const found = url.id ? index.statesById.get(url.id) : undefined;
      useAppStore.setState({
        colorMode: url.color,
        selectedId: found?.nuclide.id || null,
        expandedStateId: found && found.state.level > 0 ? found.state.id : null,
        panelOpen: !!found,
      });
      if (found && !found.nuclide.observed)
        useAppStore.getState().setSettings({ showPredicted: true });
      if (url.view) engine.setCamera(url.view);
      else if (found) void engine.flyTo({ n: found.nuclide.n, z: found.nuclide.z, s: 96 });
      else engine.fitAll();
      queueMicrotask(() => {
        syncSuppressed.current = false;
        initialized.current = true;
      });
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [engine, index]);
  useEffect(() => {
    if (!engine) return;
    engine.setTheme(tokens);
    engine.setColorMode(colorMode);
    engine.setWheelMode(wheelMode);
    engine.setShowPredicted(showPredicted);
    engine.setReducedMotion(reducedMotion);
  }, [engine, tokens, colorMode, wheelMode, showPredicted, reducedMotion]);
  useEffect(() => {
    if (!engine) return;
    engine.setSelected(selectedId);
    if (initialized.current && !syncSuppressed.current) writeUrl(currentUrl(), true);
  }, [engine, selectedId]);
  useEffect(() => {
    if (initialized.current && !syncSuppressed.current) syncUrl();
  }, [colorMode, state.expandedStateId, syncUrl]);
  useEffect(() => {
    if (!engine) return;
    const update = () => {
      const w = window.innerWidth;
      const panel = document.querySelector<HTMLElement>('.info-panel');
      const host = chart.current?.parentElement;
      const heading = panel?.querySelector('h2');
      if (mobile && panel && heading && host) {
        const safeBottom = parseFloat(getComputedStyle(panel).paddingBottom) || 0;
        const peek = Math.ceil(
          heading.getBoundingClientRect().bottom -
            panel.getBoundingClientRect().top +
            panel.scrollTop +
            safeBottom +
            16,
        );
        host.style.setProperty('--sheet-peek-h', `${peek}px`);
      }
      const panelRect = panel?.getBoundingClientRect();
      const bottom = mobile && panelOpen ? (panelRect?.height ?? 0) : 0;
      host?.style.setProperty('--sheet-height', `${bottom}px`);
      const rulers = engine.getRulerSize();
      const header = document.querySelector('.app-header')?.getBoundingClientRect();
      host?.style.setProperty('--header-bottom', `${header?.bottom ?? 56}px`);
      const meta = document.querySelector('.map-meta')?.getBoundingClientRect();
      host?.style.setProperty('--meta-bottom', `${meta?.bottom ?? 96}px`);
      engine.setSafeInsets({
        top: Math.max(header?.bottom ?? 0, meta?.bottom ?? 0) + 8,
        left: rulers.width,
        right: !mobile && panelOpen && panelRect ? w - panelRect.left + 16 : 16,
        bottom: Math.max(rulers.height, bottom),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    for (const element of document.querySelectorAll(
      '.info-panel, .panel-header, .app-header, .map-meta',
    ))
      observer.observe(element);
    const off = engine.on('layout', update);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      off();
      window.removeEventListener('resize', update);
    };
  }, [engine, panelOpen, mobile, sheet, selectedId, locale]);
  const closePanel = useCallback(() => {
    useAppStore.setState({ panelOpen: false });
    chart.current?.focus();
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const editing =
        event.target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) ||
          event.target.isContentEditable);
      if (
        (event.key === '/' && !editing) ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')
      ) {
        event.preventDefault();
        search.current?.focus();
        return;
      }
      if (editing || help) return;
      if (event.key === '?') {
        event.preventDefault();
        setHelp(true);
      }
      if (event.key.toLowerCase() === 'c' && !event.ctrlKey && !event.metaKey) {
        const modes: ColorMode[] = ['decay', 'halflife', 'binding'];
        useAppStore.getState().setSettings({
          colorMode: modes[(modes.indexOf(useAppStore.getState().colorMode) + 1) % 3]!,
        });
      }
      if (event.key === 'Escape') {
        if (settings) setSettings(false);
        else if (useAppStore.getState().panelOpen) closePanel();
        else useAppStore.getState().select(null);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [closePanel, help, settings]);

  const goTo = useCallback((id: string, stateId?: string) => {
    const s = useAppStore.getState();
    const n = s.index?.byId.get(id);
    if (!n) return;
    if (!n.observed) s.setSettings({ showPredicted: true });
    s.select(id, true, stateId || null);
    s.setSettings({ hintSeen: true });
    requestAnimationFrame(
      () =>
        void engineRef.current?.flyTo({
          n: n.n,
          z: n.z,
          s: Math.max(engineRef.current.getCamera().s, 96),
        }),
    );
    chart.current?.focus();
  }, []);
  function choose(result: SearchResult) {
    if (result.type === 'nuclide') {
      goTo(result.id, result.stateId);
      return;
    }
    if (result.type === 'row') {
      engine?.fitBounds(result.bounds);
      engine?.setHighlight({ type: 'row', z: result.z });
    } else if (result.type === 'column') {
      engine?.fitBounds(result.bounds);
      engine?.setHighlight({ type: 'column', n: result.n });
    }
    setTimeout(() => engineRef.current?.setHighlight(null), 1200);
    chart.current?.focus();
    state.setSettings({ hintSeen: true });
  }
  const selected = index?.byId.get(selectedId || '');
  const hovered = index?.byId.get(hover?.id || '');
  const visibleCount = index?.nuclides.filter((n) => showPredicted || n.observed).length || 0;
  return (
    <main className={`app ${panelOpen ? 'panel-open' : ''} sheet-${sheet}`}>
      <header className="app-header">
        <div className="brand card">
          <span className="brand-icon">
            <Atom size={23} />
          </span>
          <div>
            <h1>Nuclide Map</h1>
            <p>
              {t('appName')} <span>· NUBASE2020</span>
            </p>
          </div>
        </div>
        <SearchBox inputRef={search} onChoose={choose} />
        <nav className="toolbar card" aria-label={t('settings')}>
          <label className="color-select">
            <span className="sr-only">{t('colorMode')}</span>
            <select
              value={colorMode}
              onChange={(e) => state.setSettings({ colorMode: e.target.value as ColorMode })}
            >
              <option value="decay">{t('decay')}</option>
              <option value="halflife">{t('halflife')}</option>
              <option value="binding">{t('binding')}</option>
            </select>
          </label>
          <button
            className="icon-button"
            aria-label={`${t('theme')}: ${t(theme)}`}
            title={t('theme')}
            onClick={() =>
              state.setSettings({
                theme: theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system',
              })
            }
          >
            {theme === 'system' ? (
              <Monitor size={18} />
            ) : theme === 'light' ? (
              <Sun size={18} />
            ) : (
              <Moon size={18} />
            )}
          </button>
          <button
            className="language-button"
            aria-label={t('language')}
            onClick={() => state.setSettings({ locale: locale === 'ko' ? 'en' : 'ko' })}
          >
            {locale === 'ko' ? '한' : 'EN'}
          </button>
          <button
            className="icon-button"
            aria-label={t('settings')}
            onClick={() => setSettings(!settings)}
          >
            <Settings2 size={18} />
          </button>
          <button className="icon-button" aria-label={t('help')} onClick={() => setHelp(true)}>
            <HelpCircle size={18} />
          </button>
        </nav>
        <button
          className="mobile-menu card icon-button"
          aria-label={t('settings')}
          onClick={() => setSettings(!settings)}
        >
          <Menu size={20} />
        </button>
      </header>
      <div
        ref={chart}
        className="chart"
        role="application"
        tabIndex={0}
        aria-label={t('map')}
        aria-describedby="chart-instructions"
        data-testid="chart"
        onPointerDown={() => state.setSettings({ hintSeen: true })}
        onWheel={() => state.setSettings({ hintSeen: true })}
      />
      <p id="chart-instructions" className="sr-only">
        {t('chartHint')}
      </p>
      {status !== 'ready' && (
        <div className="loading-overlay">
          <Atom className={status === 'loading' ? 'spin' : ''} size={32} />
          <p>{t(status === 'loading' ? 'loading' : 'loadError')}</p>
          {status === 'error' && <button onClick={load}>{t('retry')}</button>}
        </div>
      )}
      {settings && (
        <div className="settings-popover card">
          <header>
            <h2>{t('settings')}</h2>
            <button
              className="icon-button"
              aria-label={t('close')}
              onClick={() => setSettings(false)}
            >
              <X size={17} />
            </button>
          </header>
          {mobile && (
            <>
              <label>
                {t('colorMode')}
                <select
                  value={colorMode}
                  onChange={(e) => state.setSettings({ colorMode: e.target.value as ColorMode })}
                >
                  <option value="decay">{t('decay')}</option>
                  <option value="halflife">{t('halflife')}</option>
                  <option value="binding">{t('binding')}</option>
                </select>
              </label>
              <label>
                {t('theme')}
                <select
                  value={theme}
                  onChange={(e) =>
                    state.setSettings({ theme: e.target.value as 'system' | 'light' | 'dark' })
                  }
                >
                  <option value="system">{t('system')}</option>
                  <option value="light">{t('light')}</option>
                  <option value="dark">{t('dark')}</option>
                </select>
              </label>
              <button onClick={() => state.setSettings({ locale: locale === 'ko' ? 'en' : 'ko' })}>
                한국어 / English
              </button>
            </>
          )}
          <label>
            {t('wheel')}
            <select
              value={wheelMode}
              onChange={(e) =>
                state.setSettings({ wheelMode: e.target.value as 'scroll' | 'zoom' })
              }
            >
              <option value="scroll">{t('scroll')}</option>
              <option value="zoom">{t('zoom')}</option>
            </select>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={showPredicted}
              onChange={(e) => state.setSettings({ showPredicted: e.target.checked })}
            />
            {t('showPredicted')}
          </label>
          <button
            onClick={() => {
              setHelp(true);
              setSettings(false);
            }}
          >
            <HelpCircle size={16} />
            {t('help')}
          </button>
        </div>
      )}
      <div className="map-meta">
        <span className="status-dot" />
        {visibleCount.toLocaleString(locale)} <span>{t('appName')}</span>
        <span className="meta-divider" />
        NUBASE2020 + AME2020
        <span className="meta-divider map-axes" />
        <span className="map-axes">{t('mapDescription')}</span>
      </div>
      <div className="zoom-controls card">
        <button
          className="zoom-desktop"
          aria-label={t('zoomIn')}
          title={t('zoomIn')}
          disabled={scale >= 256}
          onClick={() => engine?.zoomBy(2)}
        >
          <Plus size={20} />
        </button>
        <button
          className="zoom-desktop"
          aria-label={t('zoomOut')}
          title={t('zoomOut')}
          onClick={() => engine?.zoomBy(0.5)}
        >
          <Minus size={20} />
        </button>
        <button aria-label={t('fit')} title={t('fit')} onClick={() => engine?.fitAll()}>
          <Maximize size={19} />
        </button>
      </div>
      <section className={`legend card ${legend ? 'expanded' : ''}`} aria-label={t('legend')}>
        <button
          className="legend-heading"
          aria-expanded={legend}
          onClick={() => setLegend(!legend)}
        >
          <span>
            {t('legend')}
            <small> · {t(colorMode)}</small>
          </span>
          <ChevronDown size={16} className={legend ? 'rotate' : ''} />
        </button>
        {legend && (
          <div className="legend-body">
            {colorMode === 'decay' ? (
              categories.map((cat) => (
                <button
                  key={cat}
                  className="legend-row"
                  onMouseEnter={() => engine?.setHighlight({ type: 'decay', category: cat })}
                  onMouseLeave={() => engine?.setHighlight(null)}
                  onFocus={() => engine?.setHighlight({ type: 'decay', category: cat })}
                  onBlur={() => engine?.setHighlight(null)}
                >
                  <span
                    className="swatch"
                    style={{
                      background:
                        cat === 'stable' && tokens.name === 'dark' ? '#e5e7eb' : decayColors[cat],
                    }}
                  />
                  <span>{t(cat)}</span>
                  <span className="legend-count">
                    {
                      index?.nuclides.filter(
                        (n) => n.primary === cat && (showPredicted || n.observed),
                      ).length
                    }
                  </span>
                </button>
              ))
            ) : (
              <div className="continuous-legend">
                <div className={`gradient ${colorMode}`} />
                <div className="scale-labels">
                  <span>{colorMode === 'halflife' ? '1 ns' : '7.0 MeV'}</span>
                  <span>{colorMode === 'halflife' ? '32 Gy' : '8.8 MeV'}</span>
                </div>
                <p>
                  {t('stable')} · {t('missing')}
                </p>
              </div>
            )}
            <div className="legend-markers">
              <span>◩ {t('isomer')}</span>
              <span>▔ {t('natural')}</span>
              <span>
                ┄ {t('predicted')} <b>#</b> {t('estimated')}
              </span>
            </div>
          </div>
        )}
      </section>
      {engine && index && <Minimap engine={engine} index={index} theme={tokens} />}
      {!hintSeen && status === 'ready' && (
        <div className="hint-card card">
          <button
            className="icon-button"
            aria-label={t('close')}
            onClick={() => state.setSettings({ hintSeen: true })}
          >
            <X size={16} />
          </button>
          <strong>{t('hintTitle')}</strong>
          <p>{t('hintBody')}</p>
          <small>{t(mobile ? 'touchHints' : 'hints')}</small>
        </div>
      )}
      {hover && hovered && scale < 64 && (
        <div
          role="tooltip"
          className="map-tooltip"
          style={{
            left: Math.min(hover.x + 14, window.innerWidth - 250),
            top: Math.max(80, Math.min(hover.y + 18, window.innerHeight - 72)),
          }}
        >
          <b>{hovered.id}</b> · {formatHalfLife(hovered.halfLife, locale)} · {t(hovered.primary)}
        </div>
      )}
      {panelOpen && selected && (
        <InfoPanel
          goTo={goTo}
          close={closePanel}
          mobile={mobile}
          sheet={sheet}
          setSheet={setSheet}
          notify={setToast}
          syncUrl={syncUrl}
        />
      )}
      {help && <HelpDialog close={() => setHelp(false)} />}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {selected ? `${selected.id} · Z ${selected.z}, N ${selected.n} · ${t('selected')}` : ''}
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}
