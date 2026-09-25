import { Component, lazy, Suspense, useEffect } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { BRAND, t } from '@agora/core';
import { useStore } from './lib/store.jsx';
import { DataProvider } from './lib/DataProvider.jsx';
import { isChunkLoadError, isReloadPending, reloadOnce } from './lib/recover.js';
import { Logo, MapIcon, StarIcon, BuildingIcon, BookIcon, NewsIcon, MoreIcon } from './components/icons.jsx';
import LanguageSwitcher from './components/LanguageSwitcher.jsx';
import ProfileSwitcher from './components/ProfileSwitcher.jsx';
import Home from './pages/Home.jsx';

// The map is no longer the landing page, so Leaflet can load on demand instead of
// shipping with the first screen.
const MapPage = lazy(() => import('./pages/MapPage.jsx'));
const Onboarding = lazy(() => import('./pages/Onboarding.jsx'));
const ForYou = lazy(() => import('./pages/ForYou.jsx'));
const Cities = lazy(() => import('./pages/Cities.jsx'));
const CityPage = lazy(() => import('./pages/CityPage.jsx'));
const Insights = lazy(() => import('./pages/Insights.jsx'));
const News = lazy(() => import('./pages/News.jsx'));
const Learn = lazy(() => import('./pages/Learn.jsx'));
const About = lazy(() => import('./pages/About.jsx'));
const More = lazy(() => import('./pages/More.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Community = lazy(() => import('./pages/Community.jsx'));

// Home has no entry of its own: the wordmark links there, the way a masthead does.
const NAV = [
  { to: '/map', key: 'nav.map', icon: MapIcon },
  { to: '/for-you', key: 'nav.forYou', icon: StarIcon },
  { to: '/cities', key: 'nav.cities', icon: BuildingIcon },
  { to: '/insights', key: 'nav.insights' },
  { to: '/news', key: 'nav.news', icon: NewsIcon },
  { to: '/community', key: 'nav.community' },
  { to: '/learn', key: 'nav.learn', icon: BookIcon },
  { to: '/about', key: 'nav.about' },
];
const TABS = [NAV[0], NAV[1], NAV[2], NAV[6], { to: '/more', key: 'nav.more', icon: MoreIcon }];

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!location.hash) window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Loading() {
  return (
    <div className="container" role="status" aria-live="polite">
      <span className="spinner" /> {t('common.loading')}
    </div>
  );
}

/** Keeps one broken page from blanking the whole app. */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Never swallow it silently: the console is where the reason lives for a bug report.
    console.error('Agora page error:', error, info && info.componentStack);
    // A chunk from a superseded deploy is not a bug in the page. Reload into the current build.
    if (isChunkLoadError(error)) reloadOnce();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    // A reload is already on its way: say so instead of showing an error that is about
    // to disappear.
    if (isReloadPending()) {
      return (
        <div className="container" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" /> {t('errors.updating')}
        </div>
      );
    }
    const message = String((this.state.error && this.state.error.message) || this.state.error || '');
    return (
      <div className="container" role="alert">
        <h1>{t('errors.boundaryTitle')}</h1>
        <p className="muted">{t('errors.boundaryBody')}</p>
        <p className="row">
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>
            {t('errors.reload')}
          </button>
          <NavLink to="/map" className="btn">
            {t('errors.backToMap')}
          </NavLink>
        </p>
        {message && (
          <p className="hint">
            {t('errors.detail')} <code>{message.slice(0, 300)}</code>
          </p>
        )}
      </div>
    );
  }
}

export default function App() {
  const { lang } = useStore();
  const { pathname } = useLocation();

  return (
    <DataProvider>
      <div className="app" key={lang}>
        <a className="skip-link" href="#main">
          {t('nav.skip')}
        </a>
        <div className="frieze" aria-hidden="true" />
        <header className="topnav">
          <NavLink to="/" className="brand" aria-label={t('nav.home', { app: BRAND.name })}>
            <Logo /> {BRAND.name}
          </NavLink>
          <nav aria-label={t('nav.primary')}>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                {t(n.key)}
              </NavLink>
            ))}
          </nav>
          <div className="nav-tools">
            <ProfileSwitcher />
            <LanguageSwitcher />
          </div>
        </header>

        <main id="main" tabIndex={-1}>
          <ScrollToTop />
          <ErrorBoundary resetKey={pathname}>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/map" element={<MapPage />} />
                <Route path="/start" element={<Onboarding />} />
                <Route path="/for-you" element={<ForYou />} />
                <Route path="/cities" element={<Cities />} />
                <Route path="/city/:id" element={<CityPage />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/news" element={<News />} />
                <Route path="/learn" element={<Learn />} />
                <Route path="/about" element={<About />} />
                <Route path="/more" element={<More />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/community" element={<Community />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>

        <nav className="tabbar" aria-label={t('nav.primaryMobile')}>
          {TABS.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              <n.icon /> {t(n.key)}
            </NavLink>
          ))}
        </nav>
      </div>
    </DataProvider>
  );
}

function NotFound() {
  return (
    <div className="container">
      <h1>{t('errors.notFoundTitle')}</h1>
      <p>
        <NavLink to="/map">{t('nav.map')}</NavLink> · <NavLink to="/cities">{t('nav.cities')}</NavLink>
      </p>
    </div>
  );
}
