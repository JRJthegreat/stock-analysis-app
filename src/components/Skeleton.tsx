import type { CSSProperties } from 'react';

/** A single pulsing placeholder block (CSS animation, no JS timers). */
export function SkeletonBlock({
  width = '100%',
  height = 14,
  className = '',
}: {
  width?: CSSProperties['width'];
  height?: number;
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse bg-border ${className}`}
      style={{ width, height, borderRadius: height / 2 }}
    />
  );
}

/** Card-shaped skeleton standing in for an analysis card while it loads. */
export function SkeletonCard() {
  return (
    <div className="mt-2 rounded-2xl border border-border bg-card p-4">
      <SkeletonBlock width="55%" height={18} />
      <SkeletonBlock width="35%" height={12} className="mt-2" />
      <div className="mt-4 flex justify-between">
        <SkeletonBlock width="40%" height={14} />
        <SkeletonBlock width="30%" height={14} />
      </div>
      <div className="mt-4 flex justify-between">
        <SkeletonBlock width="45%" height={14} />
        <SkeletonBlock width="25%" height={14} />
      </div>
    </div>
  );
}

/** A vertical stack of skeleton cards for the initial full-page load. */
export function SkeletonScreen() {
  return (
    <div>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
