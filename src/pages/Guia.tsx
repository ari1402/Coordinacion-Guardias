import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, Segmented } from '../components/ui';
import { useAuthContext } from '../context/AuthContext';
import { useAdminNames } from '../hooks/data';

type Tab = 'todas' | 'admin';

function Section({ icon, title, children, open }: { icon: string; title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group bg-surface border border-border rounded-2xl">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
        <span className="font-semibold">
          <span className="mr-2">{icon}</span>
          {title}
        </span>
        <span className="text-text-dim transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="px-4 pb-4 sm:px-5 text-sm leading-relaxed flex flex-col gap-2.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1">
        {children}
      </div>
    </details>
  );
}

const Go = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="text-accent underline">
    {children}
  </Link>
);

function GuiaTodas() {
  const admins = useAdminNames();
  return (
    <div className="flex flex-col gap-3">
      <Section icon="👋" title="Primeros pasos (2 minutos)" open>
        <ol>
          <li>
            Entrá con tu mail y la contraseña temporal que te pasaron. Después, en <Go to="/cuenta">🔑 Mi cuenta</Go>, cambiala por
            una tuya.
          </li>
          <li>
            <b>Instalá la app en el celu</b> (queda como un ícono, sin barra del navegador):
            <ul>
              <li>
                <b>iPhone:</b> abrí la página en Safari → botón Compartir (□↑) → <i>Agregar a pantalla de inicio</i>. Abrila
                siempre desde ese ícono.
              </li>
              <li>
                <b>Android:</b> en Chrome, menú ⋮ → <i>Instalar app</i> (o <i>Agregar a pantalla principal</i>).
              </li>
            </ul>
          </li>
          <li>
            <b>Activá las notificaciones</b> desde el Inicio o Mi cuenta. Te avisan cuando se publican las guardias, el 8 de cada
            mes para cargar pedidos y a la mañana después de cada guardia para el feedback.
          </li>
          <li>¿Olvidaste la contraseña? En la pantalla de entrada escribí tu mail y tocá “Olvidé mi contraseña”.</li>
        </ol>
      </Section>

      <Section icon="🗓️" title="El mes, paso a paso">
        <ol>
          <li>
            <b>Día 8:</b> llega el aviso para cargar los <Go to="/pedidos">pedidos</Go> del mes siguiente. El Inicio te lo recuerda
            dos días.
          </li>
          <li>
            <b>Día 10:</b> {admins} generan las guardias. Lo que no esté cargado para ese día no se tiene en cuenta.
          </li>
          <li>
            <b>Cuando se publican:</b> te llega un aviso. <b>Pedí tus guardias en HIBA 2</b> y en el Inicio contestá si estás OK
            con las que te tocaron. Si ponés que no, escribí qué necesitás: les llega a {admins} para corregirlo.
          </li>
          <li>
            <b>Después de cada guardia:</b> a las 8 AM te llega el recordatorio para el feedback.
          </li>
        </ol>
      </Section>

      <Section icon="🙋" title="Pedidos: cómo pedir">
        <p>En <Go to="/pedidos">Pedidos</Go> elegís qué querés y qué tan importante es:</p>
        <ul>
          <li>
            <b>🙅 Sin guardia:</b> días que no podés o no querés estar.
          </li>
          <li>
            <b>🙋 Quiero esta guardia:</b> si ponés varias fechas, alcanza con que te toque una (ej. “sábado 7 o 21”).
          </li>
          <li>
            <b>🌅 Necesito el posguardia:</b> elegís el día que necesitás libre después; te ponen de guardia el día anterior.
          </li>
        </ul>
        <p>Y la fuerza del pedido:</p>
        <ul>
          <li>
            <b>Bloqueo:</b> imposible (examen, casamiento, viaje). El generador nunca te pone ese día.
          </li>
          <li>
            <b>Pedido fuerte:</b> se respeta salvo que sea imposible.
          </li>
          <li>
            <b>Preferencia:</b> sería mejor, pero se puede sacrificar por equidad.
          </li>
        </ul>
        <p>
          Podés cargar días sueltos o un rango (vacaciones, congreso). Los pedidos los ve todo el grupo y los podés borrar mientras
          estén pendientes.
        </p>
      </Section>

      <Section icon="📅" title="Calendario y exportar">
        <ul>
          <li>Tocá un día para ver quién está, los pedidos de ese día y los eventos.</li>
          <li>
            Colores y emojis: 🇦🇷 feriado · ⏳ preferiado · 🌟 finde XL · 😊 jueves feliz · 🎓 AAARBA/cursos · 🚫 la toma otra
            persona (p. ej. un residente mayor) · 🎂 cumple.
          </li>
          <li>
            <b>📥 Exportar:</b> el Excel del mes (calendario + lista por persona), el calendario del grupo o tus guardias para
            Google Calendar / Apple / Outlook.
          </li>
        </ul>
      </Section>

      <Section icon="🌙" title="Feedback después de la guardia">
        <ul>
          <li>
            Dos preguntas: <b>¿dormiste?</b> y <b>qué tan pesada fue</b> (1 a 10). Se carga desde el Inicio o en{' '}
            <Go to="/feedback">Mis guardias</Go>.
          </li>
          <li>
            El detalle (carga y comentario) <b>solo lo ven {admins}</b>. Lo único visible para todas es si dormiste o no
            (para contar las noches sin dormir).
          </li>
          <li>Sirve para repartir mejor: muestra qué días son más pesados.</li>
        </ul>
      </Section>

      <Section icon="🔁" title="Cambios, sorteos y camada">
        <ul>
          <li>
            <b><Go to="/cambios">Cambios</Go>:</b> registrás que le pasás una guardia a otra; ella lo confirma. Si no hay devolución
            inmediata, queda como deuda hasta que se salde. Las métricas cuentan a quien realmente la hizo.
          </li>
          <li>
            <b><Go to="/sorteos">Sorteos</Go>:</b> sorteos al azar entre quienes elijas, con el resultado a la vista de todas.
          </li>
          <li>
            <b><Go to="/camada">Camada</Go>:</b> tareas de la camada, eventos (AAARBA, cursos), carriles de cada una, info útil y
            links.
          </li>
        </ul>
      </Section>

      <Section icon="📊" title="Métricas: cómo se reparte">
        <p>
          Todo es transparente: en <Go to="/metricas">Métricas</Go> y en “Tu reparto vs. el grupo” del Inicio ves cuántas guardias,
          sábados, feriados, findes libres, etc. tiene cada una. El generador usa ese acumulado para compensar mes a mes:
        </p>
        <ul>
          <li>Reparte parejo: guardias totales, sábados y preferiados, feriados, viernes y domingos.</li>
          <li>
            <b>Feriados por turnos:</b> nadie hace un segundo feriado hasta que todas hayan hecho uno (24/12 y 31/12 cuentan
            como feriado).
          </li>
          <li>Nadie hace guardia el día de su cumple ni el anterior, ni en el mes de vacaciones de su carril.</li>
          <li>Respeta la distancia mínima entre guardias.</li>
          <li>Si hacés guardia un jueves, ese finde queda libre hasta el primer día hábil.</li>
          <li>
            <b>Finde XL</b> (jueves antes de un finde largo): va por turnos, al azar entre quienes todavía no tuvieron.
          </li>
          <li>
            <b>Sábado → jueves feliz:</b> quien tiene un sábado en el mes, tiene un jueves feliz para compensar.
          </li>
          <li>Los findes largos libres (vie a la noche a lunes feriado) también rotan.</li>
          <li>Siempre manda lo que pidieron, salvo que sea imposible.</li>
        </ul>
      </Section>
    </div>
  );
}

function GuiaAdmin() {
  return (
    <div className="flex flex-col gap-3">
      <Section icon="🛠️" title="Qué pueden hacer las admins" open>
        <ul>
          <li>
            <Go to="/admin">Admin</Go>: reglas de cada mes, residentes (nombre, cumple, rol, activa), conformidad, feedback privado e
            historial de todo lo que se hace en la app.
          </li>
          <li>
            <Go to="/admin/generador">✨ Generador</Go>: armar, editar y publicar el cronograma.
          </li>
          <li>Editar cualquier guardia publicada desde el Calendario.</li>
          <li>Cargar pedidos en nombre de otra (o de alguien de afuera) y aceptarlos o rechazarlos.</li>
          <li>Editar los carriles de la camada.</li>
          <li>Todo lo que hacen queda en el Historial (quién, qué, cuándo, antes → después).</li>
        </ul>
      </Section>

      <Section icon="🔄" title="El ciclo de cada mes">
        <ol>
          <li>
            <b>Día 8:</b> a todas les llega el aviso para cargar pedidos (no hay que hacer nada).
          </li>
          <li>
            <b>Día 10:</b> llega el aviso de generar. En el Inicio de las admins aparece “Toca generar las guardias…”.
          </li>
          <li>
            <b>Revisar las reglas del mes</b> (Admin → Reglas del mes):
            <ul>
              <li>R1 por día de la semana, distancia mínima/ideal entre guardias y tope por persona.</li>
              <li>Opciones: no repetir día de semana, máximo un sábado/preferiado, sábado → jueves feliz, jueves libera el finde.</li>
              <li>
                <b>🔒 Notas y acuerdos del mes:</b> solo los ve quien los escribe (ni el grupo ni la otra admin).
              </li>
              <li>Si un mes no tiene reglas propias, hereda las del mes anterior.</li>
            </ul>
          </li>
          <li>
            <b>Días especiales</b> (misma pantalla, tabla de abajo): feriados (se cargan solos), días con más o menos R1, notas.
          </li>
          <li>
            <b>Generador:</b> “✨ Generar 3 opciones” (máxima equidad, respeto de pedidos y descanso). Compará las tarjetas y “Ver
            detalle por persona”, usá la que más te guste y retocá a mano:
            <ul>
              <li>Cambiar una guardia la fija 🔒 para que regenerar no la toque.</li>
              <li>🎲 marca una guardia para sortear entre quienes elijas.</li>
              <li>🚫 deshabilita un lugar (lo toma un residente mayor u otra persona).</li>
              <li>“Problemas a revisar” lista todo lo que no cierra (distancias, pedidos, finde XL fuera de turno…).</li>
              <li>Si lo armaste afuera, “📋 Importar desde texto”.</li>
            </ul>
          </li>
          <li>
            <b>Guardar borrador</b> (lo ven solo las admins) y <b>Publicar</b>. A cada una le llega el aviso para pedir en HIBA 2 y
            confirmar.
          </li>
          <li>
            <b>Conformidad</b> (Admin → Conformidad): quién dijo OK, quién no respondió y quién pidió cambios. Si alguien dice que
            no, les llega un push. Corregí en el generador o el calendario y volvé a publicar: solo se les vuelve a preguntar a
            quienes les cambió algo. Después, “Marcar resuelto”.
          </li>
        </ol>
      </Section>

      <Section icon="✏️" title="Durante el mes">
        <ul>
          <li>
            <b>Editar una guardia:</b> Calendario → tocar el día → cambiar la persona, el estado, borrar, agregar un R1 o “🚫 la
            toma otra persona”.
          </li>
          <li>
            <b>Pedido de un residente mayor:</b> Pedidos → Para: “Otro…” → escribir quién. Si lo aceptan, “🚫 Deshabilitar esa
            guardia”.
          </li>
          <li>
            <b>Carriles y vacaciones:</b> Camada → Carriles (tocá la celda). En Vacaciones el generador no le asigna guardias ese mes.
          </li>
          <li>
            <b>Eventos</b> (AAARBA, cursos): Camada → Eventos. Se ven en el calendario y en el Inicio.
          </li>
        </ul>
      </Section>

      <Section icon="💾" title="Datos y seguridad">
        <ul>
          <li>
            <b>Exportar todo</b> (botón en Admin): Excel con el resumen y todas las tablas, o copia de seguridad (.json). Incluye el
            feedback privado: guardalo en un lugar seguro.
          </li>
          <li>El feedback detallado solo lo ven las admins; el historial no se puede editar ni borrar.</li>
          <li>Las notas del mes no las ve nadie más, ni la otra admin.</li>
          <li>Los sorteos no se borran: si uno no va (o fue de prueba), “Ignorar”. Queda registrado pero no cuenta, ni en el generador.</li>
        </ul>
      </Section>
    </div>
  );
}

export default function Guia() {
  const { isAdmin } = useAuthContext();
  const [params, setParams] = useSearchParams();
  const tab: Tab = isAdmin && params.get('tab') === 'admin' ? 'admin' : 'todas';
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <PageHeader
        title="Guía"
        subtitle="Cómo usar la app. Tocá cada tema para abrirlo."
        actions={
          isAdmin ? (
            <Segmented<Tab>
              value={tab}
              onChange={(t) => setParams(t === 'admin' ? { tab: 'admin' } : {})}
              options={[
                { value: 'todas', label: '👥 Para todas' },
                { value: 'admin', label: '🛠️ Para admins' },
              ]}
            />
          ) : undefined
        }
      />
      {tab === 'admin' ? <GuiaAdmin /> : <GuiaTodas />}
    </div>
  );
}
