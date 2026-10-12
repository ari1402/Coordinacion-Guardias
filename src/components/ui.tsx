import clsx from 'clsx';
import { useEffect, type ReactNode } from 'react';
import { monthLabel } from '../lib/dates';

export function Card({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx('bg-surface border border-border rounded-2xl p-4 sm:p-5 min-w-0', className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {subtitle && <p className="text-xs text-text-dim mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap mb-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-text-dim mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function MonthNav({ monthKey, prev, next }: { monthKey: string; prev: () => void; next: () => void }) {
  return (
    <div className="inline-flex items-center gap-1 bg-surface border border-border rounded-xl p-1">
      <button onClick={prev} className="px-2.5 py-1 rounded-lg hover:bg-surface-2 text-sm" aria-label="Mes anterior">
        ←
      </button>
      <span className="px-2 text-sm font-medium min-w-[9rem] text-center">{monthLabel(monthKey)}</span>
      <button onClick={next} className="px-2.5 py-1 rounded-lg hover:bg-surface-2 text-sm" aria-label="Mes siguiente">
        →
      </button>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-40" onClick={onClose}>
      <div
        className={clsx(
          'bg-surface border border-border rounded-t-2xl sm:rounded-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5 w-full max-h-[90dvh] overflow-y-auto',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-text-dim hover:text-text" aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ResidentChip({ name, color, size = 'sm' }: { name: string; color: string; size?: 'xs' | 'sm' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full text-white font-medium whitespace-nowrap',
        size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5',
      )}
      style={{ background: color }}
    >
      {name}
    </span>
  );
}

export function Dot({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-text-dim py-3">{children}</p>;
}

/** Input sin ancho: combinar con un w-* propio. */
export const inputBase =
  'rounded-lg border border-border bg-surface-2 px-3 py-2 text-base sm:text-sm text-text outline-none focus:border-accent';

export const inputCls = `${inputBase} w-full`;

export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent text-accent-contrast px-4 py-2 text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity';

export const btnSecondary =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-50 transition-colors';

export const btnGhost = 'text-sm text-text-dim hover:text-text underline-offset-2 hover:underline';

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex bg-surface-2 rounded-xl p-1 gap-1 flex-wrap">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'px-3 py-1.5 rounded-lg text-sm transition-colors',
            value === o.value ? 'bg-surface shadow-sm font-medium text-text' : 'text-text-dim hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
