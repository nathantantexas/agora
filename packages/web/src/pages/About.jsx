import { Link } from 'react-router-dom';
import { BRAND, t, tList, formatDate } from '@agora/core';
import { DATA_GENERATED_AT } from '../lib/data.js';
import { useCities } from '../lib/DataProvider.jsx';

export default function About() {
  const { cities } = useCities();
  const verified = cities.map((c) => c.lastVerified).filter(Boolean).sort();
  const high = cities.filter((c) => c.confidence === 'high').length;
  return (
    <div className="container" style={{ maxWidth: 780 }}>
      <h1>{BRAND.name}</h1>
      <p className="lead">{BRAND.shortDescription}</p>

      <h2>{t('about.nameTitle')}</h2>
      <p>{t('about.nameBody')}</p>

      <h2>{t('about.problemTitle')}</h2>
      <p>{t('about.problemBody', { region: BRAND.region, app: BRAND.name })}</p>

      <h2>{t('about.whatTitle')}</h2>
      <ul>
        {tList('about.bullets').map((b) => (
          <li key={b}>{b.replace('{n}', String(cities.length))}</li>
        ))}
      </ul>

      <h2>{t('about.nonpartisanTitle')}</h2>
      <p>
        {BRAND.nonpartisanNote} {t('about.nonpartisanBody')}
      </p>

      <h2>{t('about.dataTitle')}</h2>
      <p>{t('about.dataBody', { high, n: cities.length, verified: verified.length ? t('about.lastVerified', { date: formatDate(verified[verified.length - 1], { withYear: true }) }) : '', generated: DATA_GENERATED_AT ? DATA_GENERATED_AT.slice(0, 10) : '' })}</p>
      <p>{t('about.dataBody2')}</p>
      <p className="hint">{t('about.creditsBody')} {BRAND.builtFor}</p>
      <p>
        <Link to="/start" className="btn primary">
          {t('about.getStarted')}
        </Link>
      </p>
    </div>
  );
}
