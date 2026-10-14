'use client';

import { ChevronDown, ChevronRight, Plus, Target, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ColorPicker } from '@/components/shell/create-dialogs';
import { Topbar } from '@/components/shell/topbar';
import { useWorkspace } from '@/components/shell/workspace-context';
import { AssigneePicker, DatePicker } from '@/components/task/pickers';
import { Avatar } from '@/components/ui/avatar';
import { Progress, StatusDot } from '@/components/ui/badges';
import { Button, IconButton } from '@/components/ui/button';
import { Confirm, Field, inputClass, Modal, textareaClass } from '@/components/ui/modal';
import { api } from '@/lib/api';
import { cx, fmtDate, fmtMoney } from '@/lib/format';
import { useGoals, useInvalidate } from '@/lib/hooks';
import type { Goal, KeyResult } from '@/lib/types';

export default function GoalsPage() {
  const { wsId, members, openTask } = useWorkspace();
  const goals = useGoals(wsId);
  const inv = useInvalidate();
  const refresh = () => inv.qc.invalidateQueries({ queryKey: ['goals'] });
  const [create, setCreate] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState('#7b68ee');
  const [folder, setFolder] = useState('');
  const [del, setDel] = useState<Goal | null>(null);
  const folders = [...new Set((goals.data ?? []).map((g) => g.folderName ?? 'Sem pasta'))];
  const overall = goals.data?.length
    ? Math.round(goals.data.reduce((a, g) => a + g.percent, 0) / goals.data.length)
    : 0;
  return (
    <>
      <Topbar crumbs={[{ label: 'Metas' }]} />
      <div className="min-h-0 flex-1 overflow-auto bg-muted-page">
        <div className="mx-auto max-w-[1000px] px-5 py-5">
          <div className="mb-5 flex items-center gap-3">
            <div>
              <h1 className="text-[20px] font-semibold">Metas</h1>
              <p className="text-[12px] muted">
                Objetivos com resultados-chave mensuráveis, ligados a tarefas.
              </p>
            </div>
            <div className="ml-auto w-48">
              <div className="mb-1 flex justify-between text-[11px] muted">
                <span>Progresso geral</span>
                <span className="font-semibold text-ink">{overall}%</span>
              </div>
              <Progress value={overall} />
            </div>
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreate(true)}>
              Nova meta
            </Button>
          </div>
          {folders.map((f) => (
            <section key={f} className="mb-6">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide muted">
                {f}
              </div>
              <div className="space-y-3">
                {(goals.data ?? [])
                  .filter((g) => (g.folderName ?? 'Sem pasta') === f)
                  .map((g) => (
                    <GoalCard
                      key={g.id}
                      goal={g}
                      onChange={refresh}
                      onDelete={() => setDel(g)}
                      openTask={openTask}
                    />
                  ))}
              </div>
            </section>
          ))}
          {goals.data && goals.data.length === 0 && (
            <div className="rounded-lg border border-dashed border-line p-10 text-center text-[13px] muted">
              <Target size={26} className="mx-auto mb-2 text-ink-300" />
              Nenhuma meta ainda.
            </div>
          )}
        </div>
      </div>
      <Modal open={create} onClose={() => setCreate(false)} title="Nova meta">
        <form
          className="space-y-4 p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            await api.post(`team/${wsId}/goal`, {
              name: name.trim(),
              description: desc,
              color,
              folderName: folder || null,
            });
            refresh();
            setCreate(false);
            setName('');
            setDesc('');
          }}
        >
          <Field label="Nome">
            <input
              autoFocus
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex.: Lançar MVP até dezembro"
            />
          </Field>
          <Field label="Descrição">
            <textarea
              className={textareaClass}
              rows={2}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </Field>
          <Field label="Pasta (opcional)">
            <input
              className={inputClass}
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="ex.: Escritório, Produtos"
            />
          </Field>
          <Field label="Cor">
            <ColorPicker value={color} onChange={setColor} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setCreate(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              Criar
            </Button>
          </div>
        </form>
      </Modal>
      <Confirm
        open={!!del}
        onClose={() => setDel(null)}
        title={`Excluir "${del?.name}"?`}
        onConfirm={async () => {
          if (del) {
            await api.del(`goal/${del.id}`);
            refresh();
          }
        }}
      />
      <span className="hidden">{members.length}</span>
    </>
  );
}

function GoalCard({
  goal,
  onChange,
  onDelete,
  openTask,
}: {
  goal: Goal;
  onChange: () => void;
  onDelete: () => void;
  openTask: (id: string) => void;
}) {
  const { members } = useWorkspace();
  const [open, setOpen] = useState(true);
  const [addKr, setAddKr] = useState(false);
  const [kr, setKr] = useState({
    name: '',
    type: 'number' as KeyResult['type'],
    stepsStart: 0,
    stepsEnd: 100,
    unit: '',
  });
  return (
    <div
      className="rounded-lg border border-line bg-page"
      style={{ borderLeft: `4px solid ${goal.color}` }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          className="muted"
          onClick={() => setOpen((o) => !o)}
          aria-label="Expandir"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div className="min-w-0 flex-1">
          <input
            className="w-full bg-transparent text-[15px] font-semibold outline-none"
            defaultValue={goal.name}
            onBlur={async (e) => {
              if (e.target.value.trim() && e.target.value !== goal.name) {
                await api.put(`goal/${goal.id}`, { name: e.target.value.trim() });
                onChange();
              }
            }}
          />
          {goal.description && <div className="truncate text-[12px] muted">{goal.description}</div>}
        </div>
        <AssigneePicker
          single
          value={goal.owner ? [goal.owner] : []}
          members={members}
          onChange={async (ids) => {
            await api.put(`goal/${goal.id}`, { ownerId: ids[0] ?? null });
            onChange();
          }}
        >
          <span className="inline-flex items-center gap-1 text-[12px]">
            <Avatar user={goal.owner} size={22} />
            {goal.owner?.username.split(' ')[0]}
          </span>
        </AssigneePicker>
        <DatePicker
          value={goal.dueDate}
          onChange={async (d) => {
            await api.put(`goal/${goal.id}`, { dueDate: d });
            onChange();
          }}
          label="Prazo"
        />
        <div className="w-40">
          <div className="mb-1 flex justify-between text-[11px] muted">
            <span>{goal.keyResults.length} resultado(s)</span>
            <span className="font-semibold text-ink">{goal.percent}%</span>
          </div>
          <Progress value={goal.percent} color={goal.color} />
        </div>
        <IconButton label="Excluir meta" onClick={onDelete}>
          <Trash2 size={14} />
        </IconButton>
      </div>
      {open && (
        <div className="border-t border-line px-4 py-2">
          {goal.keyResults.map((k) => (
            <KeyResultRow
              key={k.id}
              kr={k}
              color={goal.color}
              onChange={onChange}
              openTask={openTask}
            />
          ))}
          {addKr ? (
            <form
              className="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-brand-300 p-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!kr.name.trim()) return;
                await api.post(`goal/${goal.id}/key_result`, {
                  name: kr.name.trim(),
                  type: kr.type,
                  stepsStart: kr.stepsStart,
                  stepsEnd: kr.stepsEnd,
                  unit: kr.unit || undefined,
                });
                setAddKr(false);
                setKr({ name: '', type: 'number', stepsStart: 0, stepsEnd: 100, unit: '' });
                onChange();
              }}
            >
              <Field label="Resultado-chave">
                <input
                  autoFocus
                  className={`${inputClass} w-64`}
                  value={kr.name}
                  onChange={(e) => setKr({ ...kr, name: e.target.value })}
                />
              </Field>
              <Field label="Tipo">
                <select
                  className={`${inputClass} w-32`}
                  value={kr.type}
                  onChange={(e) => setKr({ ...kr, type: e.target.value as KeyResult['type'] })}
                >
                  <option value="number">Número</option>
                  <option value="percentage">Percentual</option>
                  <option value="currency">Moeda</option>
                  <option value="boolean">Sim/Não</option>
                </select>
              </Field>
              {kr.type !== 'boolean' && (
                <>
                  <Field label="De">
                    <input
                      className={`${inputClass} w-20`}
                      type="number"
                      value={kr.stepsStart}
                      onChange={(e) => setKr({ ...kr, stepsStart: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Até">
                    <input
                      className={`${inputClass} w-20`}
                      type="number"
                      value={kr.stepsEnd}
                      onChange={(e) => setKr({ ...kr, stepsEnd: Number(e.target.value) })}
                    />
                  </Field>
                </>
              )}
              <Button type="submit" variant="primary">
                Adicionar
              </Button>
              <Button type="button" onClick={() => setAddKr(false)}>
                Cancelar
              </Button>
            </form>
          ) : (
            <button
              type="button"
              className="mt-1 inline-flex items-center gap-1 text-[12px] text-brand-600 hover:underline"
              onClick={() => setAddKr(true)}
            >
              <Plus size={12} /> Adicionar resultado-chave
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function KeyResultRow({
  kr,
  color,
  onChange,
  openTask,
}: {
  kr: KeyResult;
  color: string;
  onChange: () => void;
  openTask: (id: string) => void;
}) {
  const [showTasks, setShowTasks] = useState(false);
  const fmt = (v: number) =>
    kr.type === 'currency'
      ? fmtMoney(v, kr.unit ?? 'BRL')
      : kr.type === 'percentage'
        ? `${v}%`
        : `${v}${kr.unit ? ` ${kr.unit}` : ''}`;
  return (
    <div className="border-b border-line py-2 last:border-b-0">
      <div className="flex items-center gap-3 text-[13px]">
        <span className="min-w-0 flex-1 truncate">{kr.name}</span>
        {kr.type === 'boolean' ? (
          <label className="flex items-center gap-1 text-[12px]">
            <input
              type="checkbox"
              checked={kr.completed}
              onChange={async (e) => {
                await api.put(`key_result/${kr.id}`, { completed: e.target.checked });
                onChange();
              }}
              className="accent-brand-500"
            />{' '}
            Concluído
          </label>
        ) : kr.type === 'task' ? (
          <button
            type="button"
            className="text-[12px] text-brand-600 hover:underline"
            onClick={() => setShowTasks((s) => !s)}
          >
            {kr.stepsCurrent}/{kr.stepsEnd} tarefas
          </button>
        ) : (
          <span className="flex items-center gap-1 text-[12px]">
            <input
              className="h-6 w-20 rounded surface px-1 text-right text-[12px] outline-none"
              type="number"
              defaultValue={kr.stepsCurrent}
              onBlur={async (e) => {
                const v = Number(e.target.value);
                if (v !== kr.stepsCurrent) {
                  await api.put(`key_result/${kr.id}`, { stepsCurrent: v });
                  onChange();
                }
              }}
            />
            <span className="muted">/ {fmt(kr.stepsEnd)}</span>
          </span>
        )}
        <div className="w-32">
          <Progress value={kr.percent} color={color} />
        </div>
        <span className="w-10 text-right text-[12px] font-semibold tabular-nums">
          {kr.percent}%
        </span>
        <button
          type="button"
          className="muted hover:text-red-600"
          aria-label="Excluir"
          onClick={async () => {
            await api.del(`key_result/${kr.id}`);
            onChange();
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
      {showTasks && kr.tasks && (
        <div className="mt-1 ml-2 space-y-0.5">
          {kr.tasks.map((t) => (
            <button
              key={t.id}
              type="button"
              className={cx(
                'flex items-center gap-2 text-[12px] hover:text-brand-600',
                t.status?.type === 'closed' && 'line-through muted',
              )}
              onClick={() => openTask(t.id)}
            >
              <StatusDot status={t.status} size={8} /> {t.customId} · {t.name}
            </button>
          ))}
        </div>
      )}
      <span className="hidden">{fmtDate(null)}</span>
    </div>
  );
}
