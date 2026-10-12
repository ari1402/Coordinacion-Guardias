import clsx from 'clsx';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import Badge from '../components/Badge';
import { Card, Empty, PageHeader, Segmented, btnPrimary, btnSecondary, inputCls } from '../components/ui';
import { useAuthContext } from '../context/AuthContext';
import { db } from '../firebase';
import { useLinks, useNotes, useResidents, useResidentsById, useTasks } from '../hooks/data';
import { diffFields, logActivity } from '../lib/activity';
import { shortDateLabel, todayISO } from '../lib/dates';
import type { CamadaTask, InfoNote, LinkItem, NoteCategory, TaskStatus } from '../types';
import { NOTE_CATEGORIES } from '../types';

type Tab = 'tareas' | 'info' | 'links';

export default function Camada() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'tareas';
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Camada"
        subtitle="Todo lo de la camada en un lugar: pendientes, info (AAARBA, cursos, rotaciones) y links."
        actions={
          <Segmented<Tab>
            value={tab}
            onChange={(t) => setParams({ tab: t })}
            options={[
              { value: 'tareas', label: '✅ Tareas' },
              { value: 'info', label: '📚 Info' },
              { value: 'links', label: '🔗 Links' },
            ]}
          />
        }
      />
      {tab === 'tareas' && <Tareas />}
      {tab === 'info' && <Info />}
      {tab === 'links' && <Links />}
    </div>
  );
}

const now = () => new Date().toISOString();

function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="text-accent underline break-all">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------- Tareas

const STATUS_LABEL: Record<TaskStatus, string> = { pendiente: 'Pendiente', en_curso: 'En curso', hecha: 'Hecha' };

function Tareas() {
  const { resident: me, isAdmin } = useAuthContext();
  const { residents } = useResidents();
  const byId = useResidentsById(residents);
  const { tasks, loading } = useTasks();
  const [onlyMine, setOnlyMine] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [category, setCategory] = useState('');
  const today = todayISO();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await addDoc(collection(db, 'tasks'), {
      title: title.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      status: 'pendiente',
      assigneeIds: assignees,
      ...(dueDate ? { dueDate } : {}),
      ...(category.trim() ? { category: category.trim() } : {}),
      createdBy: me!.id,
      createdAt: now(),
    });
    await logActivity({ entity: 'tarea', summary: `Creó la tarea "${title.trim()}"` });
    setTitle('');
    setDescription('');
    setAssignees([]);
    setDueDate('');
    setCategory('');
  }

  const visible = tasks.filter((t) => !onlyMine || t.assigneeIds.includes(me!.id));
  const columns: TaskStatus[] = ['pendiente', 'en_curso', 'hecha'];

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <Card title="Nueva tarea" className="lg:col-span-1 h-fit">
        <form onSubmit={add} className="flex flex-col gap-2.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Qué hay que hacer" className={inputCls} required />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalle (opcional)" rows={2} className={clsx(inputCls, 'resize-none')} />
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Categoría (ej. AAARBA, ateneo)" className={inputCls} />
          <label className="text-xs text-text-dim flex flex-col gap-1">
            Fecha límite
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
          </label>
          <p className="text-xs text-text-dim">Responsables</p>
          <div className="flex flex-wrap gap-1.5">
            {residents.filter((r) => r.active).map((r) => {
              const on = assignees.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setAssignees(on ? assignees.filter((x) => x !== r.id) : [...assignees, r.id])}
                  className={clsx('px-2.5 py-1 rounded-full border text-xs', on ? 'bg-accent-soft border-accent text-accent' : 'border-border text-text-dim')}
                >
                  {r.shortName}
                </button>
              );
            })}
          </div>
          <button className={btnPrimary}>Agregar</button>
        </form>
      </Card>

      <div className="lg:col-span-3 flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm text-text-dim">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          Solo las que me tocan
        </label>
        {loading ? (
          <Empty>Cargando…</Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {columns.map((status) => (
              <div key={status} className="bg-surface-2 rounded-2xl p-3 flex flex-col gap-2 min-h-[120px]">
                <p className="text-xs font-semibold text-text-dim uppercase tracking-wide">
                  {STATUS_LABEL[status]} · {visible.filter((t) => t.status === status).length}
                </p>
                {visible
                  .filter((t) => t.status === status)
                  .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
                  .map((t) => (
                    <TaskCard key={t.id} task={t} byId={byId} today={today} canDelete={isAdmin || t.createdBy === me?.id} />
                  ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  byId,
  today,
  canDelete,
}: {
  task: CamadaTask;
  byId: Map<string, { shortName: string }>;
  today: string;
  canDelete: boolean;
}) {
  const overdue = task.dueDate && task.dueDate < today && task.status !== 'hecha';
  const move = async (status: TaskStatus) => {
    await updateDoc(doc(db, 'tasks', task.id), { status, updatedAt: now() });
    await logActivity({
      entity: 'tarea',
      summary: `Movió la tarea "${task.title}"`,
      changes: [`Estado: ${STATUS_LABEL[task.status]} → ${STATUS_LABEL[status]}`],
    });
  };
  return (
    <div className="bg-surface border border-border rounded-xl p-3 flex flex-col gap-1.5">
      <p className={clsx('text-sm font-medium', task.status === 'hecha' && 'line-through text-text-dim')}>{task.title}</p>
      {task.description && (
        <p className="text-xs text-text-dim whitespace-pre-wrap">
          <Linkify text={task.description} />
        </p>
      )}
      <div className="flex flex-wrap gap-1 items-center">
        {task.category && <Badge tone="accent">{task.category}</Badge>}
        {task.dueDate && <Badge tone={overdue ? 'critical' : 'neutral'}>{overdue ? 'vencida ' : ''}{shortDateLabel(task.dueDate)}</Badge>}
        {task.assigneeIds.map((id) => (
          <Badge key={id} tone="info">
            {byId.get(id)?.shortName}
          </Badge>
        ))}
      </div>
      <div className="flex gap-2 text-xs">
        {task.status !== 'pendiente' && (
          <button onClick={() => move('pendiente')} className="text-text-dim underline">
            ← pendiente
          </button>
        )}
        {task.status !== 'en_curso' && (
          <button onClick={() => move('en_curso')} className="text-text-dim underline">
            en curso
          </button>
        )}
        {task.status !== 'hecha' && (
          <button onClick={() => move('hecha')} className="text-ok underline">
            ✓ hecha
          </button>
        )}
        {canDelete && (
          <button
            onClick={async () => {
              if (!confirm('¿Borrar tarea?')) return;
              await deleteDoc(doc(db, 'tasks', task.id));
              await logActivity({ entity: 'tarea', summary: `Borró la tarea "${task.title}"` });
            }}
            className="text-danger underline ml-auto">
            borrar
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Info

function Info() {
  const { resident: me, isAdmin } = useAuthContext();
  const { residents } = useResidents();
  const byId = useResidentsById(residents);
  const { notes, loading } = useNotes();
  const [filter, setFilter] = useState<NoteCategory | 'todas'>('todas');
  const [editing, setEditing] = useState<InfoNote | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<NoteCategory>('AAARBA');
  const [pinned, setPinned] = useState(false);

  function startEdit(n: InfoNote | null) {
    setEditing(n);
    setTitle(n?.title ?? '');
    setBody(n?.body ?? '');
    setCategory(n?.category ?? 'AAARBA');
    setPinned(n?.pinned ?? false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const data = { title: title.trim(), body: body.trim(), category, pinned };
    if (editing) {
      await updateDoc(doc(db, 'notes', editing.id), { ...data, updatedAt: now() });
      await logActivity({
        entity: 'nota',
        summary: `Editó la nota "${data.title}"`,
        changes: diffFields(editing as unknown as Record<string, unknown>, data, { title: 'Título', category: 'Categoría', pinned: 'Fijada' }).concat(
          editing.body !== data.body ? ['Texto modificado'] : [],
        ),
      });
    } else {
      await addDoc(collection(db, 'notes'), { ...data, createdBy: me!.id, createdAt: now() });
      await logActivity({ entity: 'nota', summary: `Publicó la nota "${data.title}" (${data.category})` });
    }
    startEdit(null);
  }

  const visible = notes
    .filter((n) => filter === 'todas' || n.category === filter)
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title={editing ? 'Editar nota' : 'Nueva nota'} className="h-fit">
        <form onSubmit={save} className="flex flex-col gap-2.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" className={inputCls} required />
          <select value={category} onChange={(e) => setCategory(e.target.value as NoteCategory)} className={inputCls}>
            {NOTE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} placeholder="Fechas, requisitos, contactos, links…" className={clsx(inputCls, 'resize-y')} />
          <label className="flex items-center gap-2 text-sm text-text-dim">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Fijar arriba
          </label>
          <div className="flex gap-2">
            <button className={btnPrimary}>{editing ? 'Guardar' : 'Publicar'}</button>
            {editing && (
              <button type="button" onClick={() => startEdit(null)} className={btnSecondary}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      </Card>
      <div className="lg:col-span-2 flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(['todas', ...NOTE_CATEGORIES] as const).map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={clsx('px-3 py-1 rounded-full text-sm border', filter === c ? 'bg-accent-soft border-accent text-accent' : 'border-border text-text-dim')}
            >
              {c === 'todas' ? 'Todas' : c}
            </button>
          ))}
        </div>
        {loading ? (
          <Empty>Cargando…</Empty>
        ) : visible.length === 0 ? (
          <Empty>No hay notas en esta categoría todavía.</Empty>
        ) : (
          visible.map((n) => (
            <Card
              key={n.id}
              title={
                <span className="flex items-center gap-2">
                  {n.pinned && '📌'} {n.title}
                </span>
              }
              subtitle={`${n.category} · ${byId.get(n.createdBy)?.shortName ?? ''} · ${new Date(n.updatedAt ?? n.createdAt).toLocaleDateString('es-AR')}`}
              action={
                (isAdmin || n.createdBy === me?.id) && (
                  <span className="flex gap-2 text-xs">
                    <button onClick={() => startEdit(n)} className="text-text-dim underline">
                      editar
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm('¿Borrar nota?')) return;
                        await deleteDoc(doc(db, 'notes', n.id));
                        await logActivity({ entity: 'nota', summary: `Borró la nota "${n.title}"` });
                      }}
                      className="text-danger underline">
                      borrar
                    </button>
                  </span>
                )
              }
            >
              <p className="text-sm whitespace-pre-wrap">
                <Linkify text={n.body} />
              </p>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Links

function Links() {
  const { resident: me, isAdmin } = useAuthContext();
  const { links, loading } = useLinks();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState('');
  const [description, setDescription] = useState('');

  const allTags = useMemo(() => [...new Set(links.flatMap((l) => l.tags))].sort(), [links]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const clean = url.trim();
    if (!title.trim() || !/^https?:\/\//.test(clean)) return;
    await addDoc(collection(db, 'links'), {
      title: title.trim(),
      url: clean,
      tags: tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
      ...(description.trim() ? { description: description.trim() } : {}),
      pinned: false,
      createdBy: me!.id,
      createdAt: now(),
    });
    await logActivity({ entity: 'link', summary: `Agregó el link "${title.trim()}"`, changes: [clean] });
    setTitle('');
    setUrl('');
    setTags('');
    setDescription('');
  }

  const q = query.toLowerCase();
  const visible = links
    .filter((l) => !tag || l.tags.includes(tag))
    .filter((l) => !q || [l.title, l.url, l.description ?? '', ...l.tags].join(' ').toLowerCase().includes(q))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Agregar link" className="h-fit">
        <form onSubmit={add} className="flex flex-col gap-2.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nombre (ej. Inscripción AAARBA)" className={inputCls} required />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className={inputCls} required type="url" />
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Etiquetas separadas por coma (aaarba, protocolos)" className={inputCls} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Para qué sirve (opcional)" className={inputCls} />
          <button className={btnPrimary}>Guardar</button>
        </form>
      </Card>
      <div className="lg:col-span-2 flex flex-col gap-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔎 Buscar…" className={inputCls} />
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <TagButton active={!tag} onClick={() => setTag(null)}>
              todas
            </TagButton>
            {allTags.map((t) => (
              <TagButton key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                #{t}
              </TagButton>
            ))}
          </div>
        )}
        {loading ? (
          <Empty>Cargando…</Empty>
        ) : visible.length === 0 ? (
          <Empty>No hay links que coincidan.</Empty>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {visible.map((l) => (
              <LinkCard key={l.id} link={l} canEdit={isAdmin || l.createdBy === me?.id} onTag={setTag} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TagButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={clsx('px-2.5 py-1 rounded-full text-xs border', active ? 'bg-accent-soft border-accent text-accent' : 'border-border text-text-dim')}>
      {children}
    </button>
  );
}

function LinkCard({ link, canEdit, onTag }: { link: LinkItem; canEdit: boolean; onTag: (t: string) => void }) {
  return (
    <li className="bg-surface border border-border rounded-xl p-3 flex flex-col gap-1.5">
      <a href={link.url} target="_blank" rel="noreferrer" className="font-medium text-sm hover:text-accent">
        {link.pinned && '📌 '}
        {link.title} ↗
      </a>
      {link.description && <p className="text-xs text-text-dim">{link.description}</p>}
      <p className="text-[11px] text-text-dim truncate">{link.url}</p>
      <div className="flex flex-wrap gap-1 items-center">
        {link.tags.map((t) => (
          <button key={t} onClick={() => onTag(t)} className="text-[11px] text-accent">
            #{t}
          </button>
        ))}
        <span className="ml-auto flex gap-2 text-xs">
          <button
            onClick={async () => {
              await updateDoc(doc(db, 'links', link.id), { pinned: !link.pinned });
              await logActivity({ entity: 'link', summary: `${link.pinned ? 'Desfijó' : 'Fijó en inicio'} el link "${link.title}"` });
            }}
            className="text-text-dim underline">
            {link.pinned ? 'desfijar' : 'fijar en inicio'}
          </button>
          {canEdit && (
            <button
              onClick={async () => {
                if (!confirm('¿Borrar link?')) return;
                await deleteDoc(doc(db, 'links', link.id));
                await logActivity({ entity: 'link', summary: `Borró el link "${link.title}"`, changes: [link.url] });
              }}
              className="text-danger underline">
              borrar
            </button>
          )}
        </span>
      </div>
    </li>
  );
}
