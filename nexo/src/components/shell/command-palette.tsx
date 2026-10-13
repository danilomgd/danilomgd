'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  CheckSquare,
  FileText,
  Folder,
  Layers,
  List as ListIcon,
  Search,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { cx } from '@/lib/format';
import { keys } from '@/lib/hooks';
import type { Status } from '@/lib/types';
import { StatusDot } from '../ui/badges';
import { Modal } from '../ui/modal';
import { useWorkspace } from './workspace-context';

interface SearchResult {
  tasks: {
    id: string;
    customId: string;
    name: string;
    status: Status | null;
    list: { id: string; name: string } | null;
  }[];
  docs: { id: string; name: string }[];
  pages: { id: string; name: string; docId: string; docName: string }[];
  lists: { id: string; name: string }[];
  folders: { id: string; name: string }[];
  spaces: { id: string; name: string; color: string }[];
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { wsId, openTask, hierarchy } = useWorkspace();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 150);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => {
    if (open) {
      setQ('');
      setDebounced('');
      setCursor(0);
    }
  }, [open]);
  const res = useQuery({
    queryKey: keys.search(wsId, debounced),
    queryFn: () => api.get<SearchResult>(`team/${wsId}/search?q=${encodeURIComponent(debounced)}`),
    enabled: open && debounced.length > 0,
  });

  const base = `/w/${wsId}`;
  const items = useMemo(() => {
    type Item = {
      key: string;
      icon: React.ReactNode;
      label: string;
      hint?: string;
      run: () => void;
    };
    const out: Item[] = [];
    if (!debounced) {
      out.push({
        key: 'home',
        icon: <Layers size={14} />,
        label: 'Início',
        run: () => router.push(`${base}/home`),
      });
      out.push({
        key: 'inbox',
        icon: <Layers size={14} />,
        label: 'Caixa de entrada',
        run: () => router.push(`${base}/inbox`),
      });
      out.push({
        key: 'everything',
        icon: <Layers size={14} />,
        label: 'Tudo',
        run: () => router.push(`${base}/everything`),
      });
      out.push({
        key: 'docs',
        icon: <BookOpen size={14} />,
        label: 'Docs',
        run: () => router.push(`${base}/docs`),
      });
      out.push({
        key: 'dash',
        icon: <Layers size={14} />,
        label: 'Dashboards',
        run: () => router.push(`${base}/dashboards`),
      });
      out.push({
        key: 'goals',
        icon: <Layers size={14} />,
        label: 'Metas',
        run: () => router.push(`${base}/goals`),
      });
      for (const sp of hierarchy?.spaces ?? []) {
        out.push({
          key: `sp:${sp.id}`,
          icon: (
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: sp.color }} />
          ),
          label: sp.name,
          hint: 'Space',
          run: () => router.push(`${base}/s/${sp.id}`),
        });
        for (const l of [...sp.lists, ...sp.folders.flatMap((f) => f.lists)])
          out.push({
            key: `ls:${l.id}`,
            icon: <ListIcon size={14} />,
            label: l.name,
            hint: sp.name,
            run: () => router.push(`${base}/l/${l.id}`),
          });
      }
      return out.slice(0, 30);
    }
    const d = res.data;
    if (!d) return out;
    for (const t of d.tasks)
      out.push({
        key: `t:${t.id}`,
        icon: <StatusDot status={t.status} />,
        label: t.name,
        hint: `${t.customId} · ${t.list?.name ?? ''}`,
        run: () => openTask(t.id),
      });
    for (const s of d.spaces)
      out.push({
        key: `s:${s.id}`,
        icon: <span className="inline-block h-3 w-3 rounded-sm" style={{ background: s.color }} />,
        label: s.name,
        hint: 'Space',
        run: () => router.push(`${base}/s/${s.id}`),
      });
    for (const f of d.folders)
      out.push({
        key: `f:${f.id}`,
        icon: <Folder size={14} />,
        label: f.name,
        hint: 'Pasta',
        run: () => router.push(`${base}/f/${f.id}`),
      });
    for (const l of d.lists)
      out.push({
        key: `l:${l.id}`,
        icon: <ListIcon size={14} />,
        label: l.name,
        hint: 'Lista',
        run: () => router.push(`${base}/l/${l.id}`),
      });
    for (const doc of d.docs)
      out.push({
        key: `d:${doc.id}`,
        icon: <BookOpen size={14} />,
        label: doc.name,
        hint: 'Doc',
        run: () => router.push(`${base}/docs/${doc.id}`),
      });
    for (const p of d.pages)
      out.push({
        key: `p:${p.id}`,
        icon: <FileText size={14} />,
        label: p.name,
        hint: `Página · ${p.docName}`,
        run: () => router.push(`${base}/docs/${p.docId}?page=${p.id}`),
      });
    return out;
  }, [debounced, res.data, hierarchy, base, router, openTask]);

  useEffect(() => setCursor(0), [items.length]);

  const pick = (i: number) => {
    const it = items[i];
    if (!it) return;
    onClose();
    it.run();
  };

  return (
    <Modal open={open} onClose={onClose} width={640} className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Search size={16} className="muted" />
        <input
          autoFocus
          className="h-12 flex-1 bg-transparent text-[15px] outline-none"
          placeholder="Buscar tarefas, listas, docs... ou digite um ID (NX-12)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(items.length - 1, c + 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              pick(cursor);
            }
          }}
        />
      </div>
      <div className="max-h-[60vh] overflow-auto p-1.5">
        {items.length === 0 && (
          <div className="px-3 py-6 text-center text-[13px] muted">
            {res.isFetching ? 'Buscando...' : debounced ? 'Nada encontrado' : ''}
          </div>
        )}
        {items.map((it, i) => (
          <button
            key={it.key}
            type="button"
            onMouseEnter={() => setCursor(i)}
            onClick={() => pick(i)}
            className={cx(
              'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px]',
              i === cursor && 'bg-brand-50 text-brand-800',
            )}
          >
            <span className="inline-flex w-4 shrink-0 items-center justify-center muted">
              {it.icon}
            </span>
            <span className="flex-1 truncate">{it.label}</span>
            {it.hint && <span className="shrink-0 text-[11px] muted">{it.hint}</span>}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-line px-3 py-1.5 text-[11px] muted">
        <span>↑↓ navegar</span>
        <span>↵ abrir</span>
        <span>esc fechar</span>
        <span className="ml-auto inline-flex items-center gap-1">
          <CheckSquare size={11} /> tarefas · listas · docs · spaces
        </span>
      </div>
    </Modal>
  );
}
