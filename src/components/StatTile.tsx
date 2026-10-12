import type { ReactNode } from 'react';

export default function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl px-4 py-3 flex flex-col gap-1 min-w-[120px]">
      <span className="text-xs text-text-dim uppercase tracking-wide">{label}</span>
      <span
        className="text-2xl font-semibold tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-text-dim">{hint}</span>}
    </div>
  );
}
