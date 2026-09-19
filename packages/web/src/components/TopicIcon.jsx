/* One plain line icon per topic, drawn in the same stroke style as the rest of the interface. */
const PATHS = {
  housing: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  transit: 'M6 4h12a2 2 0 0 1 2 2v10H4V6a2 2 0 0 1 2-2zM4 16v2h3v-2M17 16v2h3v-2M4 11h16M9 20v-2M15 20v-2',
  'roads-traffic': 'M4 20L9 4h6l5 16M12 4v3M12 11v3M12 18v2',
  'parks-recreation': 'M12 22v-6M12 16c-4 0-7-2-7-5 0-2 1-3 2-4 0-2 2-4 5-4s5 2 5 4c1 1 2 2 2 4 0 3-3 5-7 5z',
  'public-safety': 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z',
  environment: 'M20 4c-9 0-15 5-15 13 0 1 0 2 .5 3C7 14 11 10 16 8c-4 3-7 7-8 12 8 0 12-6 12-16z',
  'budget-taxes': 'M12 2v20M17 6.5c0-1.5-2-2.5-5-2.5s-5 1-5 2.5 2 2.5 5 2.5 5 1 5 2.5-2 2.5-5 2.5-5-1-5-2.5',
  'zoning-development': 'M3 21h18M5 21V8h6v13M11 12h8v9M14 15h2M14 18h2M7 11h2M7 14h2M7 17h2',
  'education-libraries': 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v15',
  youth: 'M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M22 9v6',
  'arts-culture': 'M12 3a9 9 0 0 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 3 0 4-1 3-3 3-5a9 9 0 0 0-9-7zM7.5 10.5h.01M10 7h.01M14 7h.01M16.5 10.5h.01',
  health: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z',
  'economic-development': 'M4 7h16v13H4zM9 7V4h6v3M4 12h16',
  'utilities-water': 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  'animal-services': 'M12 21c-3 0-5-2-5-4 0-2 2-3 5-3s5 1 5 3c0 2-2 4-5 4zM7 10h.01M17 10h.01M9.5 6h.01M14.5 6h.01',
  technology: 'M3 5h18v11H3zM1 19h22',
  'governance-elections': 'M4 10h16v10H4zM8 10V4h8v6M10 7l1.5 1.5L15 5',
  other: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
};

export default function TopicIcon({ id, size = 18, ...rest }) {
  const d = PATHS[id] || PATHS.other;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={d} />
    </svg>
  );
}
