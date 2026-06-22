/** One label/value pair inside a metrics grid. The parent owns the grid columns. */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2">
      <div className="mb-0.5 text-xs text-muted">{label}</div>
      <div className="text-[17px] font-semibold text-fg">{value}</div>
    </div>
  );
}
