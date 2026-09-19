import { LOCALES, t } from '@agora/core';
import { useStore } from '../lib/store.jsx';

/** Compact language menu. The choice is remembered on this device. */
export default function LanguageSwitcher({ className = '' }) {
  const { lang, setUi } = useStore();
  return (
    <label className={`lang ${className}`.trim()}>
      <span className="visually-hidden">{t('nav.language')}</span>
      <select value={lang} onChange={(e) => setUi({ lang: e.target.value })} aria-label={t('nav.language')}>
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}
