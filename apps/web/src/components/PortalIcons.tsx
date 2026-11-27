import type { CSSProperties } from 'react';

const PATHS = {
  search: 'M20 20l-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  down: 'm6 9 6 6 6-6',
  next: 'm9 6 6 6-6 6',
  back: 'm15 6-6 6 6 6',
  user: 'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z M4 21v-2c0-6 16-6 16 0v2Z',
  login: 'M13 4h7v16h-7 M3 12h12 m-5-5 5 5-5 5',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  doc: 'M6 2h8l5 5v15H6z M14 2v6h5 M9 12h7 M9 16h5',
  chat: 'M21 11c0 5-4 8-9 8H9l-5 3 1-6a8 8 0 0 1-2-5c0-5 4-8 9-8s9 3 9 8Z M8 10h8 M8 13h5',
  bag: 'M3 7h18v13H3z M8 7V4h8v3 M3 11q9 6 18 0 M10 13h4',
  flag: 'M5 22V3 M5 4q4-3 8 0t7 0v10q-4 3-8 0t-7 0',
  calendar: 'M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4 M8 14h3 M14 14h2',
  pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z M14.5 10a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z',
  layers: 'm2 8 10-5 10 5-10 5Z M3 12l9 5 9-5 M3 16l9 5 9-5',
  compass: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z m-5-4-2.5 5.5L8 16l2.5-5.5Z',
  book: 'M12 6Q7 2 2 5v14q6-2 10 1 5-3 10-1V5q-6-2-10 1Z M12 6v14',
  spark: 'm13 3 2.2 6.8L22 12l-6.8 2.2L13 21l-2.2-6.8L4 12l6.8-2.2Z M4 2v4 M2 4h4',
  menu: 'M3 6h18 M3 12h18 M3 18h18',
  close: 'm5 5 14 14 M19 5 5 19',
  external: 'M13 4h7v7 M20 4l-9 9 M9 5H4v15h15v-5',
  bars: 'M4 20V12h4v8z M10 20V8h4v12z M16 20V3h4v17z',
} as const;

export type PortalIconName = keyof typeof PATHS;

export function PortalIcon({ name, size = 20, style }: { name: PortalIconName; size?: number; style?: CSSProperties }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d={PATHS[name]} />
    </svg>
  );
}
