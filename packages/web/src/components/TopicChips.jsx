import { topicList, t } from '@agora/core';
import TopicIcon from './TopicIcon.jsx';

/** Multi-select topic picker. Uses aria-pressed toggles so screen readers announce state. */
export default function TopicChips({ value = [], onChange, includeOther = false, small = false }) {
  const topics = topicList().filter((x) => includeOther || x.id !== 'other');
  const toggle = (id) => {
    const set = new Set(value);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange([...set]);
  };
  return (
    <div className="chips" role="group" aria-label={t('learn.topic')}>
      {topics.map((topic) => (
        <button key={topic.id} type="button" className={`chip${small ? ' small' : ''}`} aria-pressed={value.includes(topic.id)} onClick={() => toggle(topic.id)} title={topic.youthAngle}>
          <TopicIcon id={topic.id} size={small ? 14 : 16} /> {topic.label}
        </button>
      ))}
    </div>
  );
}

/** Small read-only topic tag with its icon. */
export function TopicTag({ id, className = 'tag brand' }) {
  const topic = topicList().find((x) => x.id === id) || topicList().find((x) => x.id === 'other');
  return (
    <span className={className}>
      <TopicIcon id={topic.id} size={13} /> {topic.label}
    </span>
  );
}
