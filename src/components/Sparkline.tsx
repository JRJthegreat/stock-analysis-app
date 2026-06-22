'use client';

import { useMemo } from 'react';
import type { PricePoint } from '../data/fundamentals';
import { colors } from '../theme';

interface SparklineProps {
  data: PricePoint[];
  loading: boolean;
  failed: boolean;
  width?: number;
  height?: number;
}

const signedPct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;

/**
 * Minimal price sparkline (no axes), drawn with an inline SVG polyline that
 * stretches to its container via viewBox. Green when the window closed up, red
 * when down. Loading + failure render inline so a chart problem never blocks the
 * rest of the page.
 */
export function Sparkline({
  data,
  loading,
  failed,
  width = 320,
  height = 56,
}: SparklineProps) {
  const geometry = useMemo(() => {
    if (data.length < 2) return null;
    const prices = data.map((p) => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = max - min || 1; // avoid divide-by-zero on a flat line
    const stepX = width / (data.length - 1);
    const pad = 4; // keep the stroke off the top/bottom edges
    const usableH = height - pad * 2;

    const points = prices
      .map((price, i) => {
        const x = i * stepX;
        const y = pad + usableH - ((price - min) / span) * usableH;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');

    const change = prices[prices.length - 1] / prices[0] - 1;
    return { points, change };
  }, [data, width, height]);

  if (loading) {
    return (
      <div className="flex items-center" style={{ height }}>
        <span className="text-xs italic text-muted">Loading price history…</span>
      </div>
    );
  }
  if (failed || !geometry) {
    return (
      <div className="flex items-center" style={{ height }}>
        <span className="text-xs italic text-muted">Price history unavailable</span>
      </div>
    );
  }

  const up = geometry.change >= 0;
  const stroke = up ? colors.green : colors.red;

  return (
    <div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <polyline
          points={geometry.points}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted">
          {periodLabel(data.length)}
        </span>
        <span className="text-xs font-bold" style={{ color: stroke }}>
          {signedPct(geometry.change)}
        </span>
      </div>
    </div>
  );
}

/** Rough trading-day → calendar window label for the sparkline footer. */
function periodLabel(points: number): string {
  if (points >= 230) return '1Y';
  if (points >= 115) return '6M';
  if (points >= 55) return '3M';
  if (points >= 18) return '1M';
  return `${points}d`;
}
