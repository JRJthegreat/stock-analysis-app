/**
 * Dark theme color tokens for runtime-driven styling (dynamic pill colors, alpha
 * compositing, the SVG sparkline stroke) where a static Tailwind class can't be
 * used. Static layout/styling uses Tailwind utilities instead.
 *
 * These MUST mirror the @theme tokens in src/app/globals.css. Keep them in sync.
 */
export const colors = {
  bg: '#0B0E14',
  card: '#151A23',
  cardBorder: '#222A36',
  text: '#E6EAF0',
  subtext: '#8A93A3',
  accent: '#4F8CFF',
  green: '#2ECC71',
  red: '#FF5C5C',
  amber: '#F5A623',
};
