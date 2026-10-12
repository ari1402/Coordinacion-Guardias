import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface BarDatum {
  id: string;
  label: string;
  value: number;
  color: string;
  highlight?: boolean;
}

export default function EquityBarChart({ data, unit }: { data: BarDatum[]; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap={14}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--chart-muted)' }}
          axisLine={{ stroke: 'var(--chart-grid)' }}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: 'var(--chart-muted)' }}
          axisLine={false}
          tickLine={false}
          width={28}
        />
        <Tooltip
          cursor={{ fill: 'var(--surface-2)' }}
          contentStyle={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value) => [unit ? `${value} ${unit}` : value, '']}
          labelStyle={{ color: 'var(--text)' }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36}>
          {data.map((d) => (
            <Cell key={d.id} fill={d.color} opacity={d.highlight === false ? 0.45 : 1} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
