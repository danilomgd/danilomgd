'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useInvalidate } from '@/lib/hooks';
import { Button } from '../ui/button';
import { Field, inputClass, Modal, textareaClass } from '../ui/modal';
import { toast } from '../ui/toast';
import { useWorkspace } from './workspace-context';

const COLORS = [
  '#7b68ee',
  '#1090e0',
  '#e04f8a',
  '#2ea44f',
  '#f0a30a',
  '#d33',
  '#0ab4a8',
  '#6b7280',
];

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          className="h-6 w-6 rounded-full ring-offset-2 ring-offset-[var(--bg)]"
          style={{
            background: c,
            boxShadow: value === c ? `0 0 0 2px var(--bg), 0 0 0 4px ${c}` : undefined,
          }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

export function CreateSpaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { wsId } = useWorkspace();
  const inv = useInvalidate();
  const router = useRouter();
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [priv, setPriv] = useState(false);
  const submit = async () => {
    if (!name.trim()) return;
    const sp = await api.post<{ id: string }>(`team/${wsId}/space`, {
      name: name.trim(),
      color,
      private: priv,
    });
    inv.hierarchy();
    toast('Space criado', 'success');
    setName('');
    onClose();
    router.push(`/w/${wsId}/s/${sp.id}`);
  };
  return (
    <Modal open={open} onClose={onClose} title="Criar Space">
      <form
        className="space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="text-[13px] muted">
          Um Space agrupa pastas e listas de uma área de trabalho, com statuses, campos e tags
          próprios.
        </p>
        <Field label="Nome">
          <input
            autoFocus
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex.: Escritório, Produto, Marketing"
          />
        </Field>
        <Field label="Cor">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} />{' '}
          Privado (apenas convidados veem)
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Criar Space
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function CreateFolderDialog({
  open,
  onClose,
  spaceId,
}: {
  open: boolean;
  onClose: () => void;
  spaceId: string;
}) {
  const { wsId } = useWorkspace();
  const inv = useInvalidate();
  const router = useRouter();
  const [name, setName] = useState('');
  const submit = async () => {
    if (!name.trim()) return;
    const f = await api.post<{ id: string }>(`space/${spaceId}/folder`, { name: name.trim() });
    inv.hierarchy();
    setName('');
    onClose();
    router.push(`/w/${wsId}/f/${f.id}`);
  };
  return (
    <Modal open={open} onClose={onClose} title="Criar Pasta" width={440}>
      <form
        className="space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Nome da pasta">
          <input
            autoFocus
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex.: Contencioso"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Criar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function CreateListDialog({
  open,
  onClose,
  spaceId,
  folderId,
}: {
  open: boolean;
  onClose: () => void;
  spaceId?: string;
  folderId?: string;
}) {
  const { wsId } = useWorkspace();
  const inv = useInvalidate();
  const router = useRouter();
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const submit = async () => {
    if (!name.trim()) return;
    const path = folderId ? `folder/${folderId}/list` : `space/${spaceId}/list`;
    const l = await api.post<{ id: string }>(path, {
      name: name.trim(),
      content: content || undefined,
    });
    inv.hierarchy();
    setName('');
    setContent('');
    onClose();
    router.push(`/w/${wsId}/l/${l.id}`);
  };
  return (
    <Modal open={open} onClose={onClose} title="Criar Lista" width={440}>
      <form
        className="space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Nome da lista">
          <input
            autoFocus
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex.: Processos Cíveis"
          />
        </Field>
        <Field label="Descrição (opcional)">
          <textarea
            className={textareaClass}
            rows={2}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Criar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function RenameDialog({
  open,
  onClose,
  title,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  initial: string;
  onSave: (name: string) => Promise<void> | void;
}) {
  const [name, setName] = useState(initial);
  return (
    <Modal open={open} onClose={onClose} title={title} width={420}>
      <form
        className="space-y-4 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (name.trim()) {
            await onSave(name.trim());
            onClose();
          }
        }}
      >
        <input
          autoFocus
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary">
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
