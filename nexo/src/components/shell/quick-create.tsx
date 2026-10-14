'use client';

import { Calendar, Flag, Users } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useCreateTask } from '@/lib/hooks';
import { PRIORITIES } from '@/lib/types';
import { Avatar } from '../ui/avatar';
import { Button } from '../ui/button';
import { inputClass, Modal, textareaClass } from '../ui/modal';
import { MenuItem, Popover } from '../ui/popover';
import { toast } from '../ui/toast';
import { allLists, useWorkspace } from './workspace-context';

export function QuickCreateTask({
  open,
  onClose,
  defaultListId,
  parentId,
}: {
  open: boolean;
  onClose: () => void;
  defaultListId?: string;
  parentId?: string;
}) {
  const { hierarchy, members, openTask } = useWorkspace();
  const pathname = usePathname();
  const lists = useMemo(() => allLists(hierarchy), [hierarchy]);
  const fromPath = pathname.match(/\/l\/([^/?]+)/)?.[1];
  const [listId, setListId] = useState(defaultListId ?? fromPath ?? lists[0]?.id ?? '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<number | null>(null);
  const [due, setDue] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const create = useCreateTask();

  useEffect(() => {
    if (open) setListId(defaultListId ?? fromPath ?? lists[0]?.id ?? '');
  }, [open, defaultListId, fromPath, lists]);

  const submit = async (openAfter = false) => {
    if (!name.trim() || !listId) return;
    const t = await create.mutateAsync({
      listId,
      input: {
        name: name.trim(),
        description,
        priority,
        dueDate: due || null,
        assignees,
        parentId: parentId ?? null,
      },
    });
    toast(`Tarefa ${t.customId} criada`, 'success');
    setName('');
    setDescription('');
    setPriority(null);
    setDue('');
    setAssignees([]);
    onClose();
    if (openAfter) openTask(t.id);
  };
  const list = lists.find((l) => l.id === listId);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={parentId ? 'Nova subtarefa' : 'Nova tarefa'}
      width={620}
    >
      <form
        className="p-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="mb-3 flex items-center gap-2 text-[12px] muted">
          <span>em</span>
          <Popover
            trigger={
              <span className="rounded-md surface px-2 py-1 text-[12px] font-medium text-ink hover:bg-muted-page">
                {list?.name ?? 'Selecione a lista'}
              </span>
            }
            className="max-h-72 w-72 overflow-auto"
          >
            {(close) =>
              hierarchy?.spaces.map((sp) => (
                <div key={sp.id}>
                  <div className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase muted">
                    {sp.name}
                  </div>
                  {[
                    ...sp.lists,
                    ...sp.folders.flatMap((f) =>
                      f.lists.map((l) => ({ ...l, name: `${f.name} / ${l.name}` })),
                    ),
                  ].map((l) => (
                    <MenuItem
                      key={l.id}
                      active={l.id === listId}
                      onClick={() => {
                        setListId(l.id);
                        close();
                      }}
                    >
                      {l.name}
                    </MenuItem>
                  ))}
                </div>
              ))
            }
          </Popover>
        </div>
        <input
          autoFocus
          className="mb-2 w-full border-0 bg-transparent text-lg font-semibold outline-none placeholder:text-ink-400"
          placeholder="Nome da tarefa"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          className={`${textareaClass} mb-3`}
          rows={3}
          placeholder="Descrição (markdown)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Popover
            trigger={
              <span className="inline-flex h-7 items-center gap-1.5 rounded-md surface px-2 text-[12px] hover:bg-muted-page">
                <Users size={13} />{' '}
                {assignees.length ? `${assignees.length} responsável(is)` : 'Responsável'}
              </span>
            }
          >
            {members.map((m) => (
              <MenuItem
                key={m.id}
                active={assignees.includes(m.id)}
                icon={<Avatar user={m} size={18} />}
                onClick={() =>
                  setAssignees((a) =>
                    a.includes(m.id) ? a.filter((x) => x !== m.id) : [...a, m.id],
                  )
                }
              >
                {m.username}
              </MenuItem>
            ))}
          </Popover>
          <label className="inline-flex h-7 items-center gap-1.5 rounded-md surface px-2 text-[12px] hover:bg-muted-page">
            <Calendar size={13} />{' '}
            <input
              type="date"
              className="bg-transparent outline-none"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
          <Popover
            trigger={
              <span className="inline-flex h-7 items-center gap-1.5 rounded-md surface px-2 text-[12px] hover:bg-muted-page">
                <Flag
                  size={13}
                  style={{ color: priority ? PRIORITIES[priority].color : undefined }}
                />{' '}
                {priority ? PRIORITIES[priority].label : 'Prioridade'}
              </span>
            }
          >
            {(close) => (
              <>
                {Object.entries(PRIORITIES).map(([k, v]) => (
                  <MenuItem
                    key={k}
                    icon={<Flag size={13} style={{ color: v.color }} fill={v.color} />}
                    active={priority === Number(k)}
                    onClick={() => {
                      setPriority(Number(k));
                      close();
                    }}
                  >
                    {v.label}
                  </MenuItem>
                ))}
                <MenuItem
                  onClick={() => {
                    setPriority(null);
                    close();
                  }}
                >
                  Sem prioridade
                </MenuItem>
              </>
            )}
          </Popover>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => submit(true)} disabled={!name.trim() || !listId}>
            Criar e abrir
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!name.trim() || !listId || create.isPending}
          >
            Criar tarefa
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export { inputClass };
