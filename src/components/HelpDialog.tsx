import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useT } from '../i18n';
import { version } from '../../package.json';
export default function HelpDialog({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const t = useT();
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="help-dialog"
      aria-labelledby="help-heading"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <header>
        <h2 id="help-heading">
          Nuclide Map <span>· {t('help')}</span>
        </h2>
        <button className="icon-button" aria-label={t('close')} onClick={close}>
          <X size={20} />
        </button>
      </header>
      <section>
        <h3>{t('shortcuts')}</h3>
        <p className="help-lines">{t('shortcutText')}</p>
      </section>
      <section>
        <h3>{t('notation')}</h3>
        <p className="help-lines">{t('notationText')}</p>
      </section>
      <section>
        <h3>{t('sources')}</h3>
        <p>{t('sourceText')}</p>
        <p>
          F. G. Kondev et al., <em>The NUBASE2020 evaluation of nuclear physics properties</em>,
          Chinese Physics C 45, 030001 (2021). DOI: 10.1088/1674-1137/abddae
        </p>
        <p>
          M. Wang et al., <em>The AME 2020 atomic mass evaluation (II)</em>, Chinese Physics C 45,
          030003 (2021). DOI: 10.1088/1674-1137/abddaf
        </p>
        <p>AMDC · NUBASE2020 / AME2020</p>
      </section>
      <footer>
        {t('version')} {version}
      </footer>
    </dialog>
  );
}
