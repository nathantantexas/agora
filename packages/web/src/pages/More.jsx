import { Link } from 'react-router-dom';
import { t } from '@agora/core';

/** Mobile overflow page: the destinations that do not fit in the tab bar. */
const LINKS = [
  { to: '/', key: 'nav.homePage' },
  { to: '/insights', key: 'nav.insights' },
  { to: '/news', key: 'nav.news' },
  { to: '/community', key: 'nav.community' },
  { to: '/profile', key: 'profile.title' },
  { to: '/about', key: 'nav.about' },
];

export default function More() {
  return (
    <div className="container" style={{ maxWidth: 560 }}>
      <h1>{t('nav.more')}</h1>
      <ul className="rows">
        {LINKS.map((l) => (
          <li key={l.to} style={{ padding: '14px 2px' }}>
            <Link to={l.to} style={{ fontWeight: 700, textDecoration: 'none' }}>
              {t(l.key)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
