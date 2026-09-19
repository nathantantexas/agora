import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t, tList } from '@agora/core';
import { useStore } from '../lib/store.jsx';
import TopicChips from '../components/TopicChips.jsx';
import LocationPicker from '../components/LocationPicker.jsx';
import { ArrowIcon, CheckIcon } from '../components/icons.jsx';

/** Three quick questions, no account. Saves to localStorage and lands on For you. */
export default function Onboarding() {
  const { prefs, setPrefs } = useStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(prefs);
  const steps = tList('onboarding.steps');

  const finish = () => {
    setPrefs(draft);
    navigate('/for-you');
  };

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <div className="steps" aria-hidden="true">
        {steps.map((s, i) => (
          <span key={s} className={i <= step ? 'done' : ''} />
        ))}
      </div>
      <h1>{steps[step]}</h1>

      {step === 0 && (
        <>
          <p className="muted">{t('onboarding.topicsIntro')}</p>
          <TopicChips value={draft.interests} onChange={(interests) => setDraft({ ...draft, interests })} />
        </>
      )}

      {step === 1 && (
        <>
          <p className="muted">{t('onboarding.availabilityIntro')}</p>
          <div className="option-cards" role="group" aria-label={t('onboarding.availability')}>
            <OptionCard title={t('onboarding.weekdayEvenings')} sub={t('onboarding.weekdayEveningsSub')} on={draft.availability.evenings} onClick={() => setDraft({ ...draft, availability: { ...draft.availability, evenings: !draft.availability.evenings } })} />
            <OptionCard title={t('onboarding.weekdayDaytime')} sub={t('onboarding.weekdayDaytimeSub')} on={draft.availability.daytime} onClick={() => setDraft({ ...draft, availability: { ...draft.availability, daytime: !draft.availability.daytime } })} />
            <OptionCard title={t('onboarding.weekends')} sub={t('onboarding.weekendsSub')} on={draft.availability.weekends} onClick={() => setDraft({ ...draft, availability: { ...draft.availability, weekends: !draft.availability.weekends } })} />
            <OptionCard title={t('onboarding.student')} sub={t('onboarding.studentSub')} on={draft.student} onClick={() => setDraft({ ...draft, student: !draft.student })} />
            <OptionCard title={t('onboarding.canSpeakOnly')} sub={t('onboarding.canSpeakOnlySub')} on={draft.canSpeakOnly} onClick={() => setDraft({ ...draft, canSpeakOnly: !draft.canSpeakOnly })} />
            <OptionCard title={t('onboarding.remoteCounts')} sub={t('onboarding.remoteCountsSub')} on={draft.virtualOk} onClick={() => setDraft({ ...draft, virtualOk: !draft.virtualOk })} />
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <p className="muted">{t('onboarding.whereIntro')}</p>
          <LocationPicker value={draft} onChange={setDraft} />
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="max-miles">{t('onboarding.howFar')}</label>
            <select id="max-miles" value={draft.maxMiles} onChange={(e) => setDraft({ ...draft, maxMiles: Number(e.target.value) })}>
              {[5, 10, 15, 25, 40].map((n) => (
                <option key={n} value={n}>
                  {t('onboarding.milesOption', { n })}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div className="row between" style={{ marginTop: 24 }}>
        <button type="button" className="btn" onClick={() => (step === 0 ? navigate(-1) : setStep(step - 1))}>
          {t('common.back')}
        </button>
        {step < steps.length - 1 ? (
          <button type="button" className="btn primary" onClick={() => setStep(step + 1)} disabled={step === 0 && draft.interests.length === 0}>
            {t('common.next')} <ArrowIcon />
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={finish}>
            <CheckIcon /> {t('onboarding.showMyMatches')}
          </button>
        )}
      </div>
    </div>
  );
}

function OptionCard({ title, sub, on, onClick }) {
  return (
    <button type="button" className="option-card" aria-pressed={on} onClick={onClick}>
      <span className="t">{title}</span>
      <span className="s">{sub}</span>
    </button>
  );
}
