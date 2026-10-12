/**
 * "Dónde estoy respecto del grupo": línea del mínimo al máximo del grupo,
 * marca del promedio y un punto con mi valor. Una sola serie, sin leyenda.
 */
export default function RangeBar({
  min,
  max,
  mean,
  value,
  color,
}: {
  min: number;
  max: number;
  mean: number;
  value: number;
  color: string;
}) {
  const span = max - min;
  const pos = (v: number) => (span === 0 ? '50%' : `${((v - min) / span) * 100}%`);
  return (
    <div
      className="relative h-4 mx-2"
      role="img"
      aria-label={`Vos: ${value}. Grupo: de ${min} a ${max}, promedio ${mean.toFixed(1)}`}
      title={`Vos ${value} · grupo ${min}–${max} · promedio ${mean.toFixed(1)}`}
    >
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 rounded-full bg-[var(--chart-grid)]" />
      <div className="absolute top-0.5 bottom-0.5 w-0.5 -translate-x-1/2 bg-[var(--chart-muted)]" style={{ left: pos(mean) }} />
      <div
        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
        style={{ left: pos(value), background: color }}
      />
    </div>
  );
}
