import { useEffect, useRef, useState } from 'react';
import { atCell } from '../chart/hitTest';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, X } from 'lucide-react';
import { useAppStore } from '../app/store';
import { useT } from '../i18n';
import type { Measured, NuclearState, Nuclide, DecayBranch } from '../data/types';
import { elements } from '../data/elements';
import {
  decayModeLabel,
  formatAbundance,
  formatAtomicMass,
  formatBranch,
  formatHalfLife,
  formatHalfLifeHuman,
  formatMeasured,
} from '../data/format';

/** 질량·에너지 섹션의 AME 값 순서 (03 §7.6). 원자 질량은 u로 따로 표기한다. */
const AME_ROWS = ['bindingPerA', 'qAlpha', 'qBetaMinus', 'qEC', 'sn', 'sp', 's2n', 's2p'] as const;
const AME_LABELS: Record<(typeof AME_ROWS)[number], string> = {
  bindingPerA: '',
  qAlpha: 'Qα',
  qBetaMinus: 'Qβ−',
  qEC: 'QEC',
  sn: 'Sn',
  sp: 'Sp',
  s2n: 'S2n',
  s2p: 'S2p',
};

export function NuclideSymbol({ nuclide, level = 0 }: { nuclide: Nuclide; level?: number }) {
  return (
    <span className="nuclide-symbol">
      <sup>
        {nuclide.a}
        {level > 0 ? `m${level > 1 ? level : ''}` : ''}
      </sup>
      {nuclide.symbol}
    </span>
  );
}
export default function InfoPanel({
  goTo,
  close,
  mobile,
  sheet,
  setSheet,
  notify,
  syncUrl,
}: {
  goTo: (id: string, stateId?: string) => void;
  close: () => void;
  mobile: boolean;
  sheet: number;
  setSheet: (value: number) => void;
  notify: (message: string) => void;
  syncUrl: () => void;
}) {
  const t = useT();
  const { index, selectedId, expandedStateId, locale, ameReady } = useAppStore();
  const nuclide = index?.byId.get(selectedId || '');
  const swipeStart = useRef<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [expanded, setExpanded] = useState<string | null>(expandedStateId);
  useEffect(() => setExpanded(expandedStateId), [expandedStateId, selectedId]);
  if (!nuclide || !index) return null;
  const element = elements[nuclide.z];
  const fullName = `${locale === 'ko' ? element?.nameKo : element?.nameEn}-${nuclide.a}`;
  const measured = (m?: Measured, unit = '', format: (m: Measured) => string = formatMeasured) =>
    m ? `${format(m)}${unit ? ` ${unit}` : ''}` : '—';
  const ameValue = (m: Measured) => formatMeasured(m, { round: true });
  const row = (name: string, value: React.ReactNode) => (
    <div className="property" key={name}>
      <dt>{name}</dt>
      <dd>{value}</dd>
    </div>
  );
  const branches = (state: NuclearState) =>
    state.decays.length ? (
      state.decays.map((branch: DecayBranch, i: number) => {
        const dz = nuclide.z + (branch.daughter?.dz ?? 0);
        const dn = nuclide.n + (branch.daughter?.dn ?? 0);
        const cell =
          branch.daughter && dz >= 0 && dn >= 0 && dz < index.gridHeight && dn < index.gridWidth
            ? index.grid[dz * index.gridWidth + dn]!
            : -1;
        const target = cell >= 0 ? index.nuclides[cell] : undefined;
        return (
          <li key={`${branch.mode}-${i}`} className="branch-row">
            <span
              className={`decay-badge decay-${branch.cat.replace('+', 'plus').replace('-', 'minus')}`}
            >
              {decayModeLabel(branch.mode)}
            </span>
            <span className="branch-value">{formatBranch(branch)}</span>
            {target ? (
              <button className="daughter" onClick={() => goTo(target.id)} title={target.id}>
                → <NuclideSymbol nuclide={target} />
              </button>
            ) : (
              <span className="muted branch-target">
                {branch.cat === 'sf' ? t('sf') : t('noData')}
              </span>
            )}
            {branch.note && <small className="branch-note">{branch.note}</small>}
          </li>
        );
      })
    ) : (
      <li className="muted">{t('noBranches')}</li>
    );
  const spin = (state: NuclearState) => (
    <>
      {state.jpi?.replace(/[*#]/g, '').replace(/-/g, '−') || '—'}{' '}
      {state.jpi?.includes('*') && <small className="badge">{t('measured')}</small>}{' '}
      {state.jpi?.includes('#') && <small className="badge">{t('estimated')}</small>}
    </>
  );
  function neighbor(dn: number, dz: number) {
    if (!index || !nuclide) return;
    const showPredicted = useAppStore.getState().showPredicted;
    const limit = Math.max(index.gridWidth, index.gridHeight);
    for (let step = 1; step < limit; step++) {
      const found = atCell(index, nuclide.n + dn * step, nuclide.z + dz * step, showPredicted);
      if (found) {
        goTo(found.id);
        return;
      }
    }
  }
  async function copy() {
    syncUrl();
    try {
      await navigator.clipboard.writeText(location.href);
      notify(t('copied'));
    } catch {
      notify(t('copyFailed'));
    }
  }
  return (
    <aside
      role={mobile ? 'dialog' : 'complementary'}
      aria-label={t('information')}
      className={`info-panel card sheet-${sheet}`}
      data-testid="info-panel"
    >
      {mobile && (
        <button
          className="sheet-handle"
          aria-label={t('sheetSize')}
          onPointerDown={(e) => {
            swipeStart.current = e.clientY;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            const dy = e.clientY - (swipeStart.current ?? e.clientY);
            setSheet(Math.max(0, Math.min(2, sheet + (dy < -30 ? 1 : dy > 30 ? -1 : 1))) % 3);
            swipeStart.current = null;
          }}
        >
          <span />
        </button>
      )}
      <header className="panel-header">
        <button className="icon-button panel-close" aria-label={t('close')} onClick={close}>
          <X size={18} />
        </button>
        <div className="panel-symbol">
          <NuclideSymbol nuclide={nuclide} />
        </div>
        <h2 ref={heading} tabIndex={-1}>
          {fullName}
        </h2>
        <p className="muted">
          {element?.nameEn}-{nuclide.a} <span className="source-small">NUBASE2020</span>
        </p>
        <div className="chips">
          <span>
            Z <b>{nuclide.z}</b>
          </span>
          <span>
            N <b>{nuclide.n}</b>
          </span>
          <span>
            A <b>{nuclide.a}</b>
          </span>
          <span className="primary-chip">{t(nuclide.primary)}</span>
        </div>
        {!nuclide.observed && <span className="badge">{t('unobserved')}</span>}
        <nav className="neighbor-controls" aria-label={t('map')}>
          <button onClick={() => neighbor(-1, 0)} aria-label="N − 1">
            <ArrowLeft size={14} /> N−1
          </button>
          <button onClick={() => neighbor(1, 0)} aria-label="N + 1">
            N+1 <ArrowRight size={14} />
          </button>
          <button onClick={() => neighbor(0, 1)} aria-label="Z + 1">
            <ArrowUp size={14} /> Z+1
          </button>
          <button onClick={() => neighbor(0, -1)} aria-label="Z − 1">
            <ArrowDown size={14} /> Z−1
          </button>
        </nav>
      </header>
      <section className="panel-section">
        <h3>{t('basic')}</h3>
        <dl>
          {row(
            t('halflife'),
            <>
              {formatHalfLife(nuclide.halfLife, locale)}{' '}
              {nuclide.halfLife.est && <small className="badge">{t('estimated')}</small>}{' '}
              {formatHalfLifeHuman(nuclide.halfLife, locale) && (
                <span className="human-value">{formatHalfLifeHuman(nuclide.halfLife, locale)}</span>
              )}
            </>,
          )}
          {row(t('abundance'), measured(nuclide.abundance, '%', formatAbundance))}
          {row(t('spin'), spin(nuclide))}
          {row(t('discovery'), nuclide.discovery || t('unobserved'))}
        </dl>
        {nuclide.id === 'Ta-180' && <p className="notice">{t('taNote')}</p>}
      </section>
      <section className="panel-section">
        <h3>{t('branches')}</h3>
        <ul className="branch-list">{branches(nuclide)}</ul>
      </section>
      {nuclide.excited.length > 0 && (
        <section className="panel-section">
          <h3>
            {t('excited')} <span className="count">{nuclide.excited.length}</span>
          </h3>
          {nuclide.excited.map((state) => (
            <div className="excited-state" key={state.id}>
              <button
                className="state-toggle"
                aria-expanded={expanded === state.id}
                onClick={() => {
                  const next = expanded === state.id ? null : state.id;
                  setExpanded(next);
                  useAppStore.setState({ expandedStateId: next });
                }}
              >
                <NuclideSymbol nuclide={nuclide} level={state.level} />
                <span>
                  {state.nonExistent ? (
                    <span className="badge badge-warn">{t('nonExistent')}</span>
                  ) : (
                    measured(state.exc, 'keV')
                  )}
                  <small>{formatHalfLife(state.halfLife, locale)}</small>
                </span>
                <span>{expanded === state.id ? '−' : '+'}</span>
              </button>
              {expanded === state.id && (
                <div className="state-detail">
                  {state.nonExistent && <p className="notice">{t('nonExistentNote')}</p>}
                  <dl>
                    {row(t('halflife'), formatHalfLife(state.halfLife, locale))}
                    {row(t('spin'), spin(state))}
                    {state.abundance &&
                      row(t('abundance'), measured(state.abundance, '%', formatAbundance))}
                    {row(t('massExcess'), measured(state.massExcess, 'keV'))}
                  </dl>
                  {state.orderUncertain && <p className="badge">{t('uncertainOrder')}</p>}
                  {state.orderInverted && <p className="badge">{t('invertedOrder')}</p>}
                  <ul className="branch-list">{branches(state)}</ul>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
      <section className="panel-section">
        <h3>
          {t('energy')} <small>keV</small>
        </h3>
        <dl>
          {row(t('massExcess'), measured(nuclide.massExcess))}
          {nuclide.ame?.atomicMass &&
            row(`${t('atomicMass')} (u)`, measured(nuclide.ame.atomicMass, '', formatAtomicMass))}
          {AME_ROWS.map((key) => {
            const value = nuclide.ame?.[key];
            return (
              value &&
              row(
                key === 'bindingPerA' ? t('binding') : AME_LABELS[key],
                measured(value, '', ameValue),
              )
            );
          })}
        </dl>
        {!ameReady && (
          <p className="muted ame-loading" role="status">
            {t('ameLoading')}
          </p>
        )}
      </section>
      <footer className="panel-section panel-source">
        <h3>{t('sources')}</h3>
        <p>NUBASE2020 · AME2020</p>
        <button className="copy-button" onClick={copy}>
          <Copy size={15} />
          {t('copyLink')}
        </button>
      </footer>
    </aside>
  );
}
