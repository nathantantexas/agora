import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { t, tn } from '@agora/core';
import { useCities } from '../lib/DataProvider.jsx';
import { useStore } from '../lib/store.jsx';
import { analyzeTranscript, paceSeries, PACE_TARGET } from '../lib/rehearse/speech.js';
import { startAudioCapture, summarizeEnvelope, pitchStats, estimateSyllables, loudnessSeries, paceEstimateSeries } from '../lib/rehearse/audio.js';
import { loadVision, warmUp, analyzeFrame, summarizeBody } from '../lib/rehearse/vision.js';
import { buildFindings } from '../lib/rehearse/coach.js';
import { StatTile } from '../components/charts.jsx';
import { SpeakingRuler } from '../components/viz.jsx';
import { TimeSeries, TimeStrip } from '../components/timecharts.jsx';
import { MicIcon, CheckIcon } from '../components/icons.jsx';

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const SR_LANG = { en: 'en-US', es: 'es-US', vi: 'vi-VN' };
const VISION_FPS = 8;
const MAX_SEC = 15 * 60;
const HISTORY_MAX = 20;

/**
 * Rehearse: record yourself giving your comment and get told, specifically, what to fix.
 * Audio and video are analyzed on this device and thrown away; only a few summary numbers
 * are kept per attempt so you can watch yourself improve. The one exception is the live
 * transcript, which uses the browser's own speech service and can be turned off.
 */
export default function Rehearse() {
  const { profile, ui, setUi, lang } = useStore();
  const { cities, cityById } = useCities();
  const last = ui.lastDraft || null;
  const [setup, setSetup] = useState({
    cityId: (last && last.cityId) || profile.prefs.homeCityId || '',
    script: (last && last.text) || '',
    camera: true,
    transcript: Boolean(SR),
  });
  const [phase, setPhase] = useState('setup');
  const [error, setError] = useState('');
  const [live, setLive] = useState({ t: 0, level: 0, words: 0, interim: '', final: '', faceFound: null, models: 'idle' });
  const [countdown, setCountdown] = useState(3);
  const [report, setReport] = useState(null);
  const [playback, setPlayback] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const audioRef = useRef(null);
  const meterRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const srRef = useRef(null);
  const visionRef = useRef(null);
  const loopRef = useRef(null);
  const tickRef = useRef(null);
  const samplesRef = useRef([]);
  const wordsRef = useRef([]);
  const finalRef = useRef('');
  const startRef = useRef(0);
  const recordingRef = useRef(false);

  const city = setup.cityId ? cityById(setup.cityId) : null;
  const limitSec = city && city.publicComment && city.publicComment.timeLimitMinutes ? city.publicComment.timeLimitMinutes * 60 : 180;
  const fields = last && last.fields ? last.fields : {};
  const modelBase = `${import.meta.env.BASE_URL}models`;

  const releaseAll = useCallback(() => {
    recordingRef.current = false;
    clearTimeout(loopRef.current);
    clearInterval(tickRef.current);
    if (srRef.current) {
      try {
        srRef.current.onend = null;
        srRef.current.stop();
      } catch {
        /* not running */
      }
      srRef.current = null;
    }
    if (audioRef.current) audioRef.current.stop();
    if (meterRef.current) meterRef.current.stop();
    audioRef.current = null;
    meterRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    if (streamRef.current) streamRef.current.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (visionRef.current) {
      try {
        visionRef.current.close();
      } catch {
        /* ignore */
      }
      visionRef.current = null;
    }
  }, []);

  useEffect(() => () => releaseAll(), [releaseAll]);
  useEffect(() => () => playback && URL.revokeObjectURL(playback.url), [playback]);

  // The preview element only exists once setup is over, so the stream has to be attached
  // after it mounts rather than in the same call that obtained it.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !streamRef.current || phase === 'setup' || phase === 'report') return;
    if (v.srcObject !== streamRef.current) {
      v.srcObject = streamRef.current;
      v.play().catch(() => {});
    }
  }, [phase]);

  /** Ask for the devices, show the preview, and start loading the vision models. */
  const prepare = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: setup.camera ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
      streamRef.current = stream;
      meterRef.current = startAudioCapture(stream, { intervalMs: 80 });
      tickRef.current = setInterval(() => setLive((l) => ({ ...l, level: meterRef.current ? meterRef.current.level() : 0 })), 100);
      setPhase('ready');
      if (setup.camera) {
        setLive((l) => ({ ...l, models: 'loading' }));
        loadVision(modelBase)
          .then((m) => {
            // Warm up after the next paint so the "loading" line is on screen during the
            // one-time setup, which can take seconds on a machine without a GPU.
            setTimeout(() => {
              try {
                warmUp(m, null);
              } catch {
                /* the first real frame will absorb the setup instead */
              }
              visionRef.current = m;
              setLive((l) => ({ ...l, models: 'ready' }));
            }, 50);
          })
          .catch(() => setLive((l) => ({ ...l, models: 'unavailable' })));
      }
    } catch (e) {
      setError(e && e.name === 'NotAllowedError' ? t('rehearse.errDenied') : e && e.name === 'NotFoundError' ? t('rehearse.errNoDevice') : t('rehearse.errGeneric', { reason: (e && e.message) || '' }));
    }
  };

  const begin = () => {
    setCountdown(3);
    setPhase('countdown');
    let n = 3;
    const timer = setInterval(() => {
      n -= 1;
      setCountdown(n);
      if (n <= 0) {
        clearInterval(timer);
        startRecording();
      }
    }, 1000);
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    if (meterRef.current) {
      meterRef.current.stop();
      meterRef.current = null;
    }
    clearInterval(tickRef.current);
    samplesRef.current = [];
    wordsRef.current = [{ t: 0, words: 0 }];
    finalRef.current = '';
    chunksRef.current = [];
    startRef.current = performance.now();
    recordingRef.current = true;
    audioRef.current = startAudioCapture(stream, { intervalMs: 50 });

    try {
      const mime = ['video/webm;codecs=vp9,opus', 'video/webm', 'audio/webm'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = (e) => e.data && e.data.size && chunksRef.current.push(e.data);
      rec.start(1000);
      recorderRef.current = rec;
    } catch {
      recorderRef.current = null;
    }

    if (setup.transcript && SR) {
      const rec = new SR();
      rec.lang = SR_LANG[lang] || 'en-US';
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i += 1) {
          const text = e.results[i][0].transcript;
          if (e.results[i].isFinal) {
            finalRef.current = `${finalRef.current} ${text}`.trim();
            const words = finalRef.current.split(/\s+/).filter(Boolean).length;
            wordsRef.current.push({ t: (performance.now() - startRef.current) / 1000, words });
          } else interim += text;
        }
        const words = finalRef.current.split(/\s+/).filter(Boolean).length;
        setLive((l) => ({ ...l, words, final: finalRef.current, interim }));
      };
      // The browser stops listening after a silence; keep it going until we say stop. A
      // fatal error (no network, no permission, no service) means it will never work in
      // this session, so give up rather than restart in a tight loop.
      let fatal = false;
      rec.onend = () => {
        if (!recordingRef.current || fatal) return;
        setTimeout(() => {
          if (!recordingRef.current || fatal) return;
          try {
            rec.start();
          } catch {
            /* already restarting */
          }
        }, 300);
      };
      rec.onerror = (e) => {
        if (e && ['not-allowed', 'service-not-allowed', 'network', 'audio-capture', 'language-not-supported'].includes(e.error)) fatal = true;
      };
      try {
        rec.start();
        srRef.current = rec;
      } catch {
        srRef.current = null;
      }
    }

    if (setup.camera && visionRef.current && videoRef.current) {
      let prev = null;
      let reported = false;
      // Inference runs on a small copy of the frame, not the 1280 pixel preview: the
      // landmarks only need to say where the head and hands are, and a 320 pixel frame
      // costs a fraction of the work, which matters on a machine that falls back to the
      // CPU. Ticks are chained rather than fixed, so a slow frame delays the next one
      // instead of stacking up and freezing the page.
      const small = document.createElement('canvas');
      const sctx = small.getContext('2d', { willReadFrequently: true });
      const tick = () => {
        if (!recordingRef.current) return;
        const started = performance.now();
        const v = videoRef.current;
        if (v && v.readyState >= 2 && visionRef.current && v.videoWidth) {
          try {
            const w = 320;
            const h = Math.max(1, Math.round((v.videoHeight / v.videoWidth) * w));
            if (small.width !== w || small.height !== h) {
              small.width = w;
              small.height = h;
            }
            sctx.drawImage(v, 0, 0, w, h);
            const now = performance.now();
            const s = analyzeFrame(visionRef.current, small, now, prev, (now - startRef.current) / 1000);
            prev = s;
            samplesRef.current.push(s);
            setLive((l) => (l.faceFound === s.faceFound ? l : { ...l, faceFound: s.faceFound }));
          } catch (err) {
            // A dropped frame is not worth stopping for, but a loop that fails every frame
            // must say why, once, or the report silently loses its body section.
            if (!reported) {
              reported = true;
              console.warn('Agora vision frame error:', err);
            }
          }
        }
        // Rest at least three times as long as the inference took, so the loop never
        // holds more than a quarter of the main thread. On a GPU that is the full rate;
        // on a slow CPU it degrades to a couple of frames a second instead of a frozen page.
        const took = performance.now() - started;
        const wait = Math.max(20, 1000 / VISION_FPS - took, took * 3);
        loopRef.current = setTimeout(tick, wait);
      };
      loopRef.current = setTimeout(tick, 200);
    }

    tickRef.current = setInterval(() => {
      const sec = (performance.now() - startRef.current) / 1000;
      setLive((l) => ({ ...l, t: sec, level: audioRef.current ? audioRef.current.level() : 0 }));
      if (sec >= MAX_SEC) stopRecording();
    }, 200);
    setPhase('recording');
  };

  const stopRecording = () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    const durationSec = (performance.now() - startRef.current) / 1000;
    clearTimeout(loopRef.current);
    clearInterval(tickRef.current);
    if (srRef.current) {
      try {
        srRef.current.onend = null;
        srRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    const frames = audioRef.current ? audioRef.current.stop() : [];
    const dt = audioRef.current ? audioRef.current.dt : 0.05;
    audioRef.current = null;
    setPhase('processing');

    const finish = () => {
      const blob = chunksRef.current.length ? new Blob(chunksRef.current, { type: chunksRef.current[0].type || 'video/webm' }) : null;
      if (blob) setPlayback({ url: URL.createObjectURL(blob), video: blob.type.startsWith('video'), size: blob.size, type: blob.type });
      const transcript = finalRef.current.trim();
      const speech = transcript ? analyzeTranscript(transcript, { lang, durationSec, script: setup.script, fields }) : null;
      const envelope = summarizeEnvelope(frames, dt);
      const pitch = pitchStats(frames);
      // The loop adapts its rate to the machine, so the summary gets the rate it actually ran at.
      const measuredFps = durationSec > 0 ? samplesRef.current.length / durationSec : VISION_FPS;
      const body = setup.camera && samplesRef.current.length ? summarizeBody(samplesRef.current, { fps: measuredFps || VISION_FPS, durationSec }) : null;
      const syllables = estimateSyllables(frames, dt);
      const estimatedWpm = durationSec > 0 ? Math.round((syllables / 1.4 / durationSec) * 60) : 0;
      const wpm = speech ? speech.wpm : estimatedWpm;
      const coach = buildFindings({ speech, envelope, pitch, body, durationSec, limitSec, wpm, lang, hasScript: Boolean(setup.script.trim()) });
      const result = {
        at: new Date().toISOString(),
        durationSec,
        limitSec,
        cityId: setup.cityId,
        transcript,
        speech,
        envelope,
        pitch,
        body,
        wpm,
        wpmEstimated: !speech,
        pace: speech ? paceSeries(wordsRef.current, durationSec, 15) : paceEstimateSeries(frames, dt, 15),
        loudness: loudnessSeries(frames, dt, 5),
        coach,
      };
      setReport(result);
      const summary = {
        at: result.at,
        cityId: result.cityId,
        durationSec: Math.round(durationSec),
        wpm,
        fillers: speech ? speech.fillerTotal : null,
        eyeContact: body && body.faceShare >= 0.5 ? Math.round(body.eyeContactShare * 100) : null,
        longPauses: envelope.longPauses,
        coverage: speech && speech.script ? Math.round(speech.script.coverage * 100) : null,
        findings: coach.findings.length,
      };
      setUi({ rehearsals: [summary, ...(ui.rehearsals || [])].slice(0, HISTORY_MAX) });
      if (streamRef.current) streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      setPhase('report');
    };

    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.onstop = finish;
      rec.stop();
    } else finish();
  };

  const again = () => {
    releaseAll();
    setReport(null);
    setPlayback(null);
    setLive({ t: 0, level: 0, words: 0, interim: '', final: '', faceFound: null, models: 'idle' });
    setPhase('setup');
  };

  const history = ui.rehearsals || [];

  return (
    <div className="container">
      <h1 style={{ marginBottom: 4 }}>{t('rehearse.heading')}</h1>
      <p className="muted" style={{ maxWidth: '64ch' }}>
        {t('rehearse.intro')}
      </p>

      {phase === 'setup' && (
        <>
          <div className="notice" style={{ margin: '12px 0 20px' }}>
            {t('rehearse.privacy')}
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' }}>
            <div className="card">
              <div className="section-head">
                <h2>{t('rehearse.setupTitle')}</h2>
              </div>
              <div className="field">
                <label htmlFor="rh-city">{t('rehearse.cityLabel')}</label>
                <select id="rh-city" value={setup.cityId} onChange={(e) => setSetup({ ...setup, cityId: e.target.value })}>
                  <option value="">{t('rehearse.cityNone')}</option>
                  {cities.map((c) => (
                    <option key={c.cityId} value={c.cityId}>
                      {c.name}
                      {c.publicComment && c.publicComment.timeLimitMinutes ? ` (${tn('common.minutes', c.publicComment.timeLimitMinutes)})` : ''}
                    </option>
                  ))}
                </select>
                <p className="hint">{t('rehearse.limitHint', { min: Math.round(limitSec / 60) })}</p>
              </div>
              <div className="field">
                <label htmlFor="rh-script">{t('rehearse.scriptLabel')}</label>
                <textarea id="rh-script" value={setup.script} onChange={(e) => setSetup({ ...setup, script: e.target.value })} placeholder={t('rehearse.scriptPlaceholder')} style={{ minHeight: 140 }} />
                <p className="hint">
                  {t('rehearse.scriptHint')} <Link to="/learn?tab=comment">{t('rehearse.openBuilder')}</Link>
                </p>
              </div>
              <fieldset className="field" style={{ border: 0, padding: 0 }}>
                <legend style={{ fontWeight: 600, marginBottom: 6 }}>{t('rehearse.analyzeLabel')}</legend>
                <div className="chips">
                  <button type="button" className="chip" aria-pressed={setup.camera} onClick={() => setSetup({ ...setup, camera: !setup.camera })}>
                    {t('rehearse.optCamera')}
                  </button>
                  <button type="button" className="chip" aria-pressed={setup.transcript} disabled={!SR} onClick={() => setSetup({ ...setup, transcript: !setup.transcript })}>
                    {t('rehearse.optTranscript')}
                  </button>
                </div>
                <p className="hint" style={{ marginTop: 8 }}>
                  {SR ? t('rehearse.transcriptNote') : t('rehearse.transcriptUnsupported')}
                </p>
              </fieldset>
              {error && (
                <p className="hint" role="alert" style={{ color: 'var(--crit)' }}>
                  {error}
                </p>
              )}
              <button type="button" className="btn primary" onClick={prepare}>
                <MicIcon /> {setup.camera ? t('rehearse.prepareBoth') : t('rehearse.prepareMic')}
              </button>
            </div>
            <div>
              <div className="section-head">
                <h2>{t('rehearse.whatYouGet')}</h2>
              </div>
              <ul className="rows">
                {['timing', 'pace', 'fillers', 'voice', 'script', 'body'].map((k) => (
                  <li key={k} style={{ padding: '9px 0 10px' }}>
                    <p style={{ fontWeight: 600, margin: 0 }}>{t(`rehearse.gets.${k}`)}</p>
                    <p className="hint" style={{ margin: 0 }}>
                      {t(`rehearse.gets.${k}Note`)}
                    </p>
                  </li>
                ))}
              </ul>
              {history.length > 0 && <History rows={history} cityById={cityById} />}
            </div>
          </div>
        </>
      )}

      {(phase === 'ready' || phase === 'countdown' || phase === 'recording' || phase === 'processing') && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 1fr)', alignItems: 'start', marginTop: 14 }}>
          <div className="stage">
            <div className={`stage-video${setup.camera ? '' : ' audio-only'}`}>
              <video ref={videoRef} muted playsInline autoPlay aria-label={t('rehearse.previewAlt')} />
              {!setup.camera && (
                <div className="stage-audio-only">
                  <MicIcon /> {t('rehearse.audioOnly')}
                </div>
              )}
              {phase === 'countdown' && (
                <div className="stage-count" role="status" aria-live="assertive">
                  {countdown > 0 ? countdown : t('rehearse.go')}
                </div>
              )}
              {phase === 'recording' && (
                <div className="stage-timer" role="timer">
                  <span className="rec-dot" aria-hidden="true" /> {fmt(live.t)} <span className="muted">/ {fmt(limitSec)}</span>
                </div>
              )}
              {setup.camera && phase === 'ready' && (
                <div className="stage-guide" aria-hidden="true">
                  <span />
                </div>
              )}
            </div>
            <div className="mic-meter" aria-label={t('rehearse.micLevel')} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(live.level * 400))}>
              <span style={{ width: `${Math.min(100, live.level * 400)}%` }} />
            </div>
            {phase === 'recording' && (
              <div style={{ maxWidth: 560 }}>
                <SpeakingRuler seconds={Math.round(live.t)} limitSeconds={limitSec} title={t('rehearse.liveRuler')} />
              </div>
            )}
          </div>

          <div className="stack">
            {phase === 'ready' && (
              <div className="card">
                <div className="section-head">
                  <h2>{t('rehearse.readyTitle')}</h2>
                </div>
                <ul className="list-reset check" style={{ marginBottom: 12 }}>
                  <li>
                    <span className="n">
                      <CheckIcon />
                    </span>
                    <span>{t('rehearse.readyMic')}</span>
                  </li>
                  {setup.camera && (
                    <li>
                      <span className="n">{live.models === 'ready' ? <CheckIcon /> : live.models === 'unavailable' ? '!' : <span className="spinner" aria-hidden="true" />}</span>
                      <span>{live.models === 'ready' ? t('rehearse.readyModels') : live.models === 'unavailable' ? t('rehearse.modelsUnavailable') : t('rehearse.loadingModels')}</span>
                    </li>
                  )}
                </ul>
                <p className="muted">{setup.camera ? t('rehearse.framingTip') : t('rehearse.micTip')}</p>
                <div className="row">
                  <button type="button" className="btn primary" onClick={begin} disabled={setup.camera && live.models === 'loading'}>
                    {t('rehearse.start')}
                  </button>
                  <button type="button" className="btn quiet" onClick={again}>
                    {t('common.back')}
                  </button>
                </div>
              </div>
            )}
            {phase === 'recording' && (
              <div className="card">
                <div className="section-head">
                  <h2>{t('rehearse.recordingTitle')}</h2>
                </div>
                {setup.transcript && SR && (
                  <p className="transcript-live" aria-live="off">
                    {live.final} <span className="muted">{live.interim}</span>
                    {!live.final && !live.interim && <span className="muted">{t('rehearse.listening')}</span>}
                  </p>
                )}
                <dl className="facts">
                  {setup.transcript && SR && (
                    <>
                      <dt>{t('rehearse.wordsSoFar')}</dt>
                      <dd>{live.words}</dd>
                    </>
                  )}
                  {setup.camera && (
                    <>
                      <dt>{t('rehearse.face')}</dt>
                      <dd>{live.faceFound === null ? t('rehearse.faceUnknown') : live.faceFound ? t('rehearse.faceSeen') : t('rehearse.faceLost')}</dd>
                    </>
                  )}
                </dl>
                <button type="button" className="btn primary" onClick={stopRecording}>
                  {t('rehearse.stop')}
                </button>
              </div>
            )}
            {phase === 'processing' && (
              <p role="status">
                <span className="spinner" aria-hidden="true" /> {t('rehearse.processing')}
              </p>
            )}
          </div>
        </div>
      )}

      {phase === 'report' && report && <Report report={report} setup={setup} playback={playback} lang={lang} onAgain={again} history={history} cityById={cityById} />}
    </div>
  );
}

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function Report({ report, setup, playback, lang, onAgain, history, cityById }) {
  const { speech, envelope, pitch, body, coach } = report;
  const [lo, hi] = PACE_TARGET[lang] || PACE_TARGET.en;
  const marked = useMemo(() => (speech ? speech.marked : []), [speech]);

  return (
    <div className="stack" style={{ marginTop: 14 }}>
      <div className="row between">
        <h2 style={{ margin: 0 }}>{t('rehearse.reportTitle')}</h2>
        <button type="button" className="btn primary" onClick={onAgain}>
          {t('rehearse.again')}
        </button>
      </div>

      <div className="tiles">
        <StatTile value={fmt(report.durationSec)} label={t('rehearse.tileTime', { limit: fmt(report.limitSec) })} />
        <StatTile value={report.wpm} label={report.wpmEstimated ? t('rehearse.tilePaceEst') : t('rehearse.tilePace')} />
        {speech && <StatTile value={speech.fillerTotal} label={t('rehearse.tileFillers')} />}
        <StatTile value={envelope.longPauses} label={t('rehearse.tilePauses')} />
        {body && body.faceShare >= 0.5 && <StatTile value={`${Math.round(body.eyeContactShare * 100)}%`} label={t('rehearse.tileEye')} />}
        {speech && speech.script && <StatTile value={`${Math.round(speech.script.coverage * 100)}%`} label={t('rehearse.tileScript')} />}
      </div>

      <section aria-labelledby="h-first">
        <div className="section-head">
          <h2 id="h-first">{t('rehearse.workOnFirst')}</h2>
        </div>
        {coach.findings.length === 0 && <p className="muted">{t('rehearse.nothingToFix')}</p>}
        <ol className="rows findings">
          {coach.findings.map((f, i) => {
            // The coach names missing pieces by field key; the reader gets them in words.
            const params = f.id === 'missing_elements' ? { ...f.params, missing: String(f.params.missing).split(', ').map((k) => t(`rehearse.elements.${k}`)).join(', ') } : f.params;
            return (
              <li key={f.id} className="finding">
                <div className="finding-rank" aria-hidden="true">
                  {i + 1}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p className="finding-title">{t(`rehearse.findings.${f.id}.title`, params)}</p>
                  <p className="muted" style={{ margin: '2px 0 6px' }}>
                    {t(`rehearse.findings.${f.id}.detail`, params)}
                  </p>
                  <p className="finding-drill">
                    <span className="tag brand">{t('rehearse.drill')}</span> {t(`rehearse.findings.${f.id}.drill`, params)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {coach.strengths.length > 0 && (
        <section aria-labelledby="h-good">
          <div className="section-head">
            <h2 id="h-good">{t('rehearse.whatWorked')}</h2>
          </div>
          <ul className="why" style={{ gap: '6px 22px' }}>
            {coach.strengths.map((s) => (
              <span key={s.id}>{t(`rehearse.strengths.${s.id}`, s.params)}</span>
            ))}
          </ul>
        </section>
      )}

      <div style={{ maxWidth: 640 }}>
        <SpeakingRuler seconds={Math.round(report.durationSec)} limitSeconds={report.limitSec} title={t('rehearse.rulerTitle')} />
      </div>

      {report.pace.length > 1 && (
        <TimeSeries title={report.wpmEstimated ? t('rehearse.paceChartEst') : t('rehearse.paceChart')} series={[{ label: t('rehearse.paceSeries'), points: report.pace }]} band={[lo, hi]} note={report.wpmEstimated ? t('rehearse.paceEstNote') : t('rehearse.paceNote')} />
      )}
      {report.loudness.length > 1 && <TimeSeries title={t('rehearse.volumeChart')} series={[{ label: t('rehearse.volumeSeries'), points: report.loudness }]} unit="%" yMax={100} note={t('rehearse.volumeNote', { pauses: envelope.longPauses })} />}

      {body && body.faceShare >= 0.3 && (
        <TimeStrip title={t('rehearse.eyeStrip')} cells={body.timeline} labels={{ on: t('rehearse.eyeOn'), off: t('rehearse.eyeOff'), none: t('rehearse.eyeNone') }} note={t('rehearse.eyeNote')} />
      )}

      {body && body.frames > 0 && (
        <section aria-labelledby="h-body">
          <div className="section-head">
            <h2 id="h-body">{t('rehearse.bodyTitle')}</h2>
          </div>
          <dl className="facts">
            <dt>{t('rehearse.bodyFace')}</dt>
            <dd>{Math.round(body.faceShare * 100)}%</dd>
            <dt>{t('rehearse.bodyEye')}</dt>
            <dd>{Math.round(body.eyeContactShare * 100)}%</dd>
            <dt>{t('rehearse.bodyDown')}</dt>
            <dd>{Math.round(body.lookingDownShare * 100)}%</dd>
            <dt>{t('rehearse.bodySway')}</dt>
            <dd>{body.swayStd < 0.02 ? t('rehearse.low') : body.swayStd < 0.035 ? t('rehearse.some') : t('rehearse.high')}</dd>
            <dt>{t('rehearse.bodyHands')}</dt>
            <dd>{t('rehearse.bodyHandsValue', { visible: Math.round(body.handsVisibleShare * 100), face: Math.round(body.handsNearFaceShare * 100) })}</dd>
            <dt>{t('rehearse.bodySmile')}</dt>
            <dd>{Math.round(body.smileShare * 100)}%</dd>
          </dl>
        </section>
      )}

      {speech && (
        <section aria-labelledby="h-said">
          <div className="section-head">
            <h2 id="h-said">{t('rehearse.transcriptTitle')}</h2>
          </div>
          <p className="hint">{t('rehearse.transcriptNoteReport')}</p>
          <p className="transcript">
            {marked.map((m, i) => (
              <span key={i} className={m.filler ? 'filler' : undefined}>
                {m.text}{' '}
              </span>
            ))}
          </p>
          {speech.script && speech.script.skipped.length > 0 && (
            <>
              <h3>{tn('rehearse.skippedTitle', speech.script.skipped.length)}</h3>
              <ul>
                {speech.script.skipped.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      {!speech && setup.transcript && <p className="hint">{t('rehearse.noSpeechHeard')}</p>}

      {playback && (
        <section aria-labelledby="h-play">
          <div className="section-head">
            <h2 id="h-play">{t('rehearse.playbackTitle')}</h2>
          </div>
          <p className="hint">{t('rehearse.playbackNote')}</p>
          {playback.video ? <video className="playback" controls src={playback.url} /> : <audio controls src={playback.url} style={{ width: '100%' }} />}
          <p>
            <a className="btn small" href={playback.url} download="agora-rehearsal.webm">
              {t('rehearse.download', { mb: (playback.size / 1024 / 1024).toFixed(1) })}
            </a>
          </p>
        </section>
      )}

      {history.length > 0 && <History rows={history} cityById={cityById} />}
    </div>
  );
}

function History({ rows, cityById }) {
  return (
    <section aria-labelledby="h-hist" className="section">
      <div className="section-head">
        <h2 id="h-hist">{tn('rehearse.historyTitle', rows.length)}</h2>
      </div>
      <p className="hint">{t('rehearse.historyNote')}</p>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>{t('rehearse.hWhen')}</th>
              <th>{t('rehearse.hCity')}</th>
              <th className="num">{t('rehearse.hTime')}</th>
              <th className="num">{t('rehearse.hPace')}</th>
              <th className="num">{t('rehearse.hFillers')}</th>
              <th className="num">{t('rehearse.hEye')}</th>
              <th className="num">{t('rehearse.hScript')}</th>
              <th className="num">{t('rehearse.hFindings')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = r.cityId ? cityById(r.cityId) : null;
              return (
                <tr key={r.at}>
                  <td>{new Date(r.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td>{c ? c.name : ''}</td>
                  <td className="num">{fmt(r.durationSec)}</td>
                  <td className="num">{r.wpm || ''}</td>
                  <td className="num">{r.fillers === null ? '' : r.fillers}</td>
                  <td className="num">{r.eyeContact === null ? '' : `${r.eyeContact}%`}</td>
                  <td className="num">{r.coverage === null ? '' : `${r.coverage}%`}</td>
                  <td className="num">{r.findings}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
