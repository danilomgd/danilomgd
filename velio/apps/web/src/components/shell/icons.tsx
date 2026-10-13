import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export const Icons = {
  map: (p: P) => (
    <svg {...base} {...p} aria-hidden>
      <path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z" />
      <path d="M9 4v13M15 7v13" />
    </svg>
  ),
  list: (p: P) => (
    <svg {...base} {...p} aria-hidden>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  ),
  alert: (p: P) => (
    <svg {...base} {...p} aria-hidden>
      <path d="M12 3l9.5 17h-19z" />
      <path d="M12 10v4M12 17v.5" />
    </svg>
  ),
  scale: (p: P) => (
    <svg {...base} {...p} aria-hidden>
      <path d="M12 3v18M4 8h16M6 8l-3 7h6zM18 8l-3 7h6z" />
    </svg>
  ),
  chart: (p: P) => (
    <svg {...base} {...p} aria-hidden>
      <path d="M4 20h16M7 16v-5M12 16V7M17 16v-9" />
    </svg>
  ),
  grid: (p: P) => (
    <svg {...base} {...p} aria-hidden>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  ),
  wrench: (p: P) => (
    <svg {...base} {...p} aria-hidden>
      <path d="M14.5 6.5a4 4 0 0 0 5 5L9 22l-3-3L16.5 8.5a4 4 0 0 0-2-2z" />
    </svg>
  ),
  pin: (p: P) => (
    <svg {...base} {...p} aria-hidden>
      <path d="M12 21s7-6.5 7-11.5a7 7 0 1 0-14 0C5 14.5 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  ),
  tag: (p: P) => (
    <svg {...base} {...p} aria-hidden>
      <path d="M3 12V4h8l10 10-8 8z" />
      <circle cx="7.5" cy="8.5" r="1" />
    </svg>
  ),
  percent: (p: P) => (
    <svg {...base} {...p} aria-hidden>
      <path d="M19 5L5 19" />
      <circle cx="7.5" cy="7.5" r="2.5" />
      <circle cx="16.5" cy="16.5" r="2.5" />
    </svg>
  ),
  sliders: (p: P) => (
    <svg {...base} {...p} aria-hidden>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  ),
  ticket: (p: P) => (
    <svg {...base} {...p} aria-hidden>
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M10 6v12" strokeDasharray="2 2" />
    </svg>
  ),
  repeat: (p: P) => (
    <svg {...base} {...p} aria-hidden>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  home: (p: P) => (
    <svg {...base} {...p} aria-hidden>
      <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
    </svg>
  ),
  image: (p: P) => (
    <svg {...base} {...p} aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M21 16l-5-5-9 8" />
    </svg>
  ),
  users: (p: P) => (
    <svg {...base} {...p} aria-hidden>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" />
    </svg>
  ),
  shield: (p: P) => (
    <svg {...base} {...p} aria-hidden>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  settings: (p: P) => (
    <svg {...base} {...p} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
  flow: (p: P) => (
    <svg {...base} {...p} aria-hidden>
      <rect x="3" y="4" width="6" height="5" rx="1.5" />
      <rect x="15" y="4" width="6" height="5" rx="1.5" />
      <rect x="9" y="15" width="6" height="5" rx="1.5" />
      <path d="M6 9v3h12V9M12 12v3" />
    </svg>
  ),
  logout: (p: P) => (
    <svg {...base} {...p} aria-hidden>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l5 4-5 4M20 12H10" />
    </svg>
  ),
};

export type IconName = keyof typeof Icons;
