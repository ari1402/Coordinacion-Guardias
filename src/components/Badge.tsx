import type { ReactNode } from 'react';
import clsx from 'clsx';

const TONES = {
  good: 'bg-ok-soft text-ok',
  warning: 'bg-warn-soft text-warn',
  critical: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-surface-2 text-text-dim',
  accent: 'bg-accent-soft text-accent',
} as const;

export default function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
