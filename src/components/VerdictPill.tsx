import { Verdict } from '../engine';
import { colors } from '../theme';

const COLOR: Record<Verdict, string> = {
  Undervalued: colors.green,
  'Fairly valued': colors.amber,
  Overvalued: colors.red,
};

export function VerdictPill({ verdict }: { verdict: Verdict }) {
  const color = COLOR[verdict];
  return (
    <span
      className="inline-block rounded-full border px-3 py-[5px] text-[13px] font-bold"
      style={{ color, borderColor: color, backgroundColor: color + '22' }}
    >
      {verdict}
    </span>
  );
}
