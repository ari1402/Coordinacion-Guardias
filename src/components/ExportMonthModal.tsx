import type { ReactNode } from 'react';
import { monthSheets, groupIcs, type MonthExportInput } from '../lib/exportMonth';
import { downloadFile, shiftsToIcs } from '../lib/ics';
import { monthLabel } from '../lib/dates';
import { downloadXlsx } from '../lib/xlsx';
import { Modal } from './ui';

function Option({ icon, title, detail, onClick }: { icon: string; title: string; detail: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left flex items-start gap-3 rounded-xl border border-border p-3 hover:bg-surface-2 transition-colors">
      <span className="text-2xl leading-none">{icon}</span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-text-dim mt-0.5">{detail}</span>
      </span>
    </button>
  );
}

/** Descargas del mes: Excel (calendario + por persona), calendario del grupo y mis guardias. */
export default function ExportMonthModal({ input, meId, onClose }: { input: MonthExportInput; meId?: string; onClose: () => void }) {
  const { monthKey, shifts, residents } = input;
  const label = monthLabel(monthKey);
  const slug = monthKey;
  const nameOf = (id: string) => residents.find((r) => r.id === id)?.shortName ?? '?';
  const valid = shifts.filter((s) => s.status !== 'cancelada');

  return (
    <Modal open onClose={onClose} title={`Exportar ${label}`}>
      <div className="flex flex-col gap-2">
        <Option
          icon="📊"
          title="Excel del mes"
          detail="Calendario del mes, resumen por persona (fechas, días, sábados, feriados, total), lista de las guardias de cada una y lista por día."
          onClick={() => downloadXlsx(`guardias-r1-${slug}.xlsx`, monthSheets(input))}
        />
        <Option
          icon="🗓️"
          title="Calendario del grupo (.ics)"
          detail="Las guardias de todas en el mes, para importar en Google Calendar, Apple o Outlook."
          onClick={() =>
            downloadFile(`guardias-r1-grupo-${slug}.ics`, groupIcs(valid.filter((s) => s.date.startsWith(monthKey)), nameOf), 'text/calendar')
          }
        />
        {meId && (
          <Option
            icon="🌙"
            title="Mis guardias (.ics)"
            detail="Todas tus guardias publicadas (todos los meses) para tu calendario."
            onClick={() => downloadFile('mis-guardias.ics', shiftsToIcs(valid.filter((s) => s.actualResidentId === meId), 'Guardia'), 'text/calendar')}
          />
        )}
      </div>
    </Modal>
  );
}
