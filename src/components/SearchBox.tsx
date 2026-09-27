import { useMemo, useState, type RefObject } from 'react';
import { Search, X } from 'lucide-react';
import { useAppStore } from '../app/store';
import { useT } from '../i18n';
import { searchNuclides, type SearchResult } from '../data/search';

export default function SearchBox({
  inputRef,
  onChoose,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onChoose: (result: SearchResult) => void;
}) {
  const t = useT();
  const index = useAppStore((s) => s.index);
  const locale = useAppStore((s) => s.locale);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(
    () => (index && query.trim() ? searchNuclides(index, query) : []),
    [index, query],
  );
  function choose(result: SearchResult) {
    onChoose(result);
    setOpen(false);
    setQuery('');
  }
  return (
    <div className="search-wrap">
      <div className="search-box card">
        <Search size={18} aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={t('search')}
          placeholder={t('searchPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          value={query}
          aria-expanded={open && !!query}
          aria-controls="search-results"
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `result-${active}` : undefined}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
              inputRef.current?.blur();
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setOpen(true);
              setActive(
                (v) =>
                  (v + (e.key === 'ArrowDown' ? 1 : -1) + Math.max(1, results.length)) %
                  Math.max(1, results.length),
              );
            }
            if (e.key === 'Enter' && results[active]) {
              e.preventDefault();
              choose(results[active]);
            }
          }}
        />
        {query ? (
          <button
            className="icon-button"
            aria-label={t('close')}
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <X size={16} />
          </button>
        ) : (
          <kbd>/</kbd>
        )}
      </div>
      {open && query && (
        <div
          className="search-results card"
          id="search-results"
          role="listbox"
          aria-label={t('search')}
        >
          {results.length ? (
            results.map((result, i) => (
              <button
                type="button"
                role="option"
                aria-selected={active === i}
                id={`result-${i}`}
                key={i}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(result)}
                className={active === i ? 'active' : ''}
              >
                <span>{result.label}</span>
                <small>{locale === 'ko' ? result.descriptionKo : result.descriptionEn}</small>
              </button>
            ))
          ) : (
            <p>
              {t('noResults')}
              <small>{t('searchExamples')}</small>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
