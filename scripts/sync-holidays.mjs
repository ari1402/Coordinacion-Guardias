#!/usr/bin/env node
// Sincroniza los feriados oficiales (Ministerio del Interior vía
// ArgentinaDatos) + Día de la Sanidad del año actual y el siguiente.
// Lo corre GitHub Actions en cada publicación. No pisa decisiones de las
// admins: si un día fue destildado a mano, se respeta.

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { loadServiceAccount } from './credentials.mjs';

initializeApp({ credential: cert(loadServiceAccount()) });
const db = getFirestore();

const year = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric' }).format(new Date()));
let written = 0;
let respected = 0;

for (const y of [year, year + 1]) {
  let list;
  try {
    const res = await fetch(`https://api.argentinadatos.com/v1/feriados/${y}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    list = (await res.json())
      .filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.fecha))
      .map((h) => ({
        date: h.fecha,
        name: h.tipo === 'puente' ? `${h.nombre} (no laborable)` : h.nombre,
        source: 'oficial',
      }));
  } catch (e) {
    console.log(`::warning::No pude traer los feriados de ${y}: ${e.message}`);
    continue;
  }
  list.push({ date: `${y}-09-21`, name: 'Día de la Sanidad', source: 'sanidad' });

  for (const h of list) {
    const ref = db.collection('calendarDays').doc(h.date);
    const current = (await ref.get()).data();
    if (current?.holidaySource === 'manual' && current.isHoliday === false) {
      respected++;
      continue;
    }
    await ref.set({ id: h.date, date: h.date, isHoliday: true, holidayName: h.name, holidaySource: h.source }, { merge: true });
    written++;
  }
  console.log(`${y}: ${list.length} feriados`);
}

console.log(`Listo: ${written} feriados al día${respected ? `, ${respected} destildados a mano respetados` : ''}.`);
process.exit(0);
