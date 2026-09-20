import { useNavigate } from 'react-router-dom';
import { t } from '@agora/core';
import { useStore } from '../lib/store.jsx';

const MANAGE = '__manage__';

/**
 * Switch between the setups saved on this device. Kept to a single control so the
 * masthead does not grow a row of buttons; everything else lives on the profile page.
 */
export default function ProfileSwitcher() {
  const { profile, profiles, switchProfile } = useStore();
  const navigate = useNavigate();

  const onChange = (e) => {
    if (e.target.value === MANAGE) navigate('/profile');
    else switchProfile(e.target.value);
  };

  return (
    <label className="lang">
      <span className="visually-hidden">{t('profile.switcherLabel')}</span>
      <select value={profile.id} onChange={onChange} aria-label={t('profile.switcherLabel')}>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        <option value={MANAGE}>{t('profile.manage')}</option>
      </select>
    </label>
  );
}
