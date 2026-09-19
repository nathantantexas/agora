/* Small inline icon set. Every icon is decorative (aria-hidden) unless a label is passed. */
const base = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

function Svg({ label, children, ...rest }) {
  return (
    <svg {...base} {...rest} aria-hidden={label ? undefined : 'true'} role={label ? 'img' : undefined} aria-label={label}>
      {children}
    </svg>
  );
}

/* A stoa: the colonnade that edged the agora and sheltered the people arguing under it.
   Three columns rather than four so the mark still reads at 26px in the masthead. */
export const Logo = (props) => (
  <svg viewBox="0 0 64 64" aria-hidden="true" {...props}>
    <rect width="64" height="64" fill="var(--ink)" />
    <g fill="var(--page)">
      <rect x="6" y="13" width="52" height="5" />
      <rect x="10" y="19" width="44" height="4" />
      <rect x="15" y="25" width="7" height="20" />
      <rect x="29" y="25" width="7" height="20" />
      <rect x="43" y="25" width="7" height="20" />
      <rect x="6" y="46" width="52" height="5" />
    </g>
  </svg>
);

export const MapIcon = (p) => (
  <Svg {...p}>
    <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4z" />
    <path d="M8 2v16M16 6v16" />
  </Svg>
);
export const StarIcon = (p) => (
  <Svg {...p}>
    <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
  </Svg>
);
export const BuildingIcon = (p) => (
  <Svg {...p}>
    <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
  </Svg>
);
export const ChartIcon = (p) => (
  <Svg {...p}>
    <path d="M3 3v18h18M7 15v-4M12 15V8M17 15v-6" />
  </Svg>
);
export const BookIcon = (p) => (
  <Svg {...p}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v15M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
  </Svg>
);
export const NewsIcon = (p) => (
  <Svg {...p}>
    <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9h4M18 14h-8M18 18h-8M10 6h8v4h-8z" />
  </Svg>
);
export const SunIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);
export const MoonIcon = (p) => (
  <Svg {...p}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </Svg>
);
export const TextIcon = (p) => (
  <Svg {...p}>
    <path d="M4 7V4h16v3M9 20h6M12 4v16" />
  </Svg>
);
export const CloseIcon = (p) => (
  <Svg {...p}>
    <path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);
export const PinIcon = (p) => (
  <Svg {...p}>
    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </Svg>
);
export const CalendarIcon = (p) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Svg>
);
export const ExternalIcon = (p) => (
  <Svg {...p}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
  </Svg>
);
export const MicIcon = (p) => (
  <Svg {...p}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
  </Svg>
);
export const DirectionsIcon = (p) => (
  <Svg {...p}>
    <path d="M12 2l10 10-10 10L2 12z" />
    <path d="M9 12h5l-2-2M14 12l-2 2" />
  </Svg>
);
export const ShareIcon = (p) => (
  <Svg {...p}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
  </Svg>
);
export const ListIcon = (p) => (
  <Svg {...p}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </Svg>
);
export const LocateIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    <circle cx="12" cy="12" r="8" />
  </Svg>
);
export const SparkIcon = (p) => (
  <Svg {...p}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z" />
  </Svg>
);
export const CheckIcon = (p) => (
  <Svg {...p}>
    <path d="M20 6L9 17l-5-5" />
  </Svg>
);
export const ArrowIcon = (p) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
export const InfoIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </Svg>
);
export const MoreIcon = (p) => (
  <Svg {...p}>
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="19" cy="12" r="1.5" />
  </Svg>
);
