import { formatTime, relativeDays, parseDate, daysBetween, milesText, t, tn, tList } from '@agora/core';

export function DateBox({ date, status, today }) {
  const { m, d } = parseDate(date);
  const soon = today && daysBetween(today, date) <= 3 && status !== 'cancelled';
  return (
    <div className={`datebox${soon ? ' soon' : ''}${status === 'cancelled' ? ' cancelled' : ''}`} aria-hidden="true">
      <div className="m">{tList('format.monthsShort')[m - 1]}</div>
      <div className="d">{d}</div>
    </div>
  );
}

/** One meeting occurrence, rendered as a row in a ruled list. */
export default function MeetingCard({ meeting, today, onSelect, selected = false, showCity = true, compact = false }) {
  const interactive = typeof onSelect === 'function';
  const Tag = interactive ? 'button' : 'div';
  const props = interactive ? { type: 'button', onClick: () => onSelect(meeting), 'aria-haspopup': 'dialog', 'aria-current': selected ? 'true' : undefined } : {};
  const positives = (meeting.reasons || []).filter((r) => r.points > 0).slice(0, 2);
  const negatives = (meeting.reasons || []).filter((r) => r.points < 0).slice(0, 1);

  return (
    <Tag className={`meeting-row${selected ? ' selected' : ''}`} {...props}>
      <DateBox date={meeting.date} status={meeting.status} today={today} />
      <div>
        <p className="title">
          {showCity ? `${meeting.cityName}: ` : ''}
          {meeting.label}
        </p>
        <p className="sub">
          {formatTime(meeting.time)}
          {today ? ` · ${relativeDays(meeting.date, today)}` : ''}
          {meeting.distanceMiles != null ? ` · ${milesText(meeting.distanceMiles)}` : ''}
        </p>
        <div className="labels">
          {meeting.status === 'cancelled' && <span className="tag warn">{t('common.cancelled')}</span>}
          {meeting.status === 'rescheduled' && <span className="tag warn">{t('common.rescheduled')}</span>}
          {meeting.status === 'special' && <span className="tag warn">{t('common.special')}</span>}
          <span className={`tag${meeting.isEvening ? ' good' : ''}`}>{meeting.isEvening ? t('common.evening') : meeting.isSchoolHours ? t('common.schoolHours') : t('common.daytime')}</span>
          <span className={`tag${meeting.openToPublicComment ? ' brand' : ''}`}>{meeting.openToPublicComment ? t('common.youCanSpeak') : t('common.watchOnly')}</span>
          {meeting.agendaItems && meeting.agendaItems.length > 0 && <span className="tag">{tn('common.agendaItems', meeting.agendaItems.length)}</span>}
        </div>
        {!compact && (positives.length > 0 || negatives.length > 0) && (
          <div className="why" aria-label={t('common.whyMatches')}>
            {positives.map((r) => (
              <span key={r.text}>{r.text}</span>
            ))}
            {negatives.map((r) => (
              <span key={r.text} className="minus">
                {r.text}
              </span>
            ))}
          </div>
        )}
      </div>
    </Tag>
  );
}
