'use client';

import { ChevronRight, Eye, FileText, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useEffect, useRef, useState } from 'react';
import { Topbar } from '@/components/shell/topbar';
import { useWorkspace } from '@/components/shell/workspace-context';
import { Button, IconButton } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { Confirm } from '@/components/ui/modal';
import { api } from '@/lib/api';
import { cx, fmtAgo } from '@/lib/format';
import { useDoc, useInvalidate } from '@/lib/hooks';
import type { DocPage } from '@/lib/types';

export default function DocEditorPage({
  params,
}: {
  params: Promise<{ ws: string; docId: string }>;
}) {
  const { docId } = use(params);
  const { wsId, hierarchy } = useWorkspace();
  const doc = useDoc(docId);
  const inv = useInvalidate();
  const router = useRouter();
  const search = useSearchParams();
  const pageParam = search.get('page');
  const pages = doc.data?.pages ?? [];
  const page = pages.find((p) => p.id === pageParam) ?? pages[0];
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [content, setContent] = useState('');
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState<'doc' | 'page' | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saved, setSaved] = useState<'saved' | 'saving' | null>(null);

  useEffect(() => {
    if (page) {
      setContent(page.content);
      setName(page.name);
    }
  }, [page?.id]);

  const refresh = () => {
    inv.qc.invalidateQueries({ queryKey: ['doc', docId] });
    inv.qc.invalidateQueries({ queryKey: ['docs'] });
  };
  const select = (id: string) => router.replace(`?page=${id}`, { scroll: false });
  const autosave = (next: { content?: string; name?: string }) => {
    if (!page) return;
    setSaved('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await api.put(`page/${page.id}`, next);
      setSaved('saved');
      refresh();
    }, 700);
  };
  const addPage = async (parentPageId: string | null = null) => {
    const p = await api.post<DocPage>(`doc/${docId}/page`, { name: 'Nova página', parentPageId });
    refresh();
    select(p.id);
    setMode('edit');
  };
  const isFav = hierarchy?.favorites.some((f) => f.itemType === 'doc' && f.itemId === docId);

  const Tree = ({ parent, depth }: { parent: string | null; depth: number }) => (
    <>
      {pages
        .filter((p) => (p.parentPageId ?? null) === parent)
        .map((p) => (
          <div key={p.id}>
            <button
              type="button"
              onClick={() => select(p.id)}
              className={cx(
                'flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-[13px] hover:bg-ink-100',
                page?.id === p.id && 'bg-brand-50 font-medium text-brand-700',
              )}
              style={{ paddingLeft: 8 + depth * 14 }}
            >
              <FileText size={13} className="shrink-0 muted" />{' '}
              <span className="truncate">{p.name}</span>
            </button>
            <Tree parent={p.id} depth={depth + 1} />
          </div>
        ))}
    </>
  );

  return (
    <>
      <Topbar
        crumbs={[{ label: 'Docs', href: `/w/${wsId}/docs` }, { label: doc.data?.name ?? '...' }]}
        actions={
          <IconButton
            label="Favoritar"
            onClick={async () => {
              await api.post(`team/${wsId}/favorite`, { itemType: 'doc', itemId: docId });
              inv.hierarchy();
            }}
          >
            <Star size={16} className={isFav ? 'fill-amber-400 text-amber-400' : ''} />
          </IconButton>
        }
      />
      <div className="flex min-h-0 flex-1">
        <aside className="w-60 shrink-0 overflow-y-auto border-r border-line bg-sidebar p-2">
          <input
            className="mb-2 h-8 w-full rounded-md bg-transparent px-2 text-[14px] font-semibold outline-none hover:bg-ink-100 focus:bg-page"
            defaultValue={doc.data?.name ?? ''}
            onBlur={async (e) => {
              if (e.target.value.trim() && e.target.value !== doc.data?.name) {
                await api.put(`doc/${docId}`, { name: e.target.value.trim() });
                refresh();
                inv.hierarchy();
              }
            }}
          />
          <Tree parent={null} depth={0} />
          <button
            type="button"
            onClick={() => addPage(null)}
            className="mt-1 flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-[12px] muted hover:bg-ink-100 hover:text-ink"
          >
            <Plus size={13} /> Nova página
          </button>
          <div className="mt-4 border-t border-line pt-2">
            <button
              type="button"
              className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-[12px] text-red-600 hover:bg-ink-100"
              onClick={() => setConfirm('doc')}
            >
              <Trash2 size={13} /> Excluir doc
            </button>
          </div>
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto">
          {page ? (
            <div className="mx-auto max-w-[860px] px-10 py-8">
              <div className="mb-2 flex items-center gap-2 text-[12px] muted">
                {page.parentPageId && (
                  <>
                    <span>{pages.find((p) => p.id === page.parentPageId)?.name}</span>
                    <ChevronRight size={12} />
                  </>
                )}
                <span>{page.name}</span>
                <span className="ml-auto">
                  {saved === 'saving'
                    ? 'Salvando...'
                    : saved === 'saved'
                      ? 'Salvo'
                      : `Atualizado ${fmtAgo(page.updatedAt)}`}
                </span>
                <div className="flex rounded-md surface p-0.5">
                  <button
                    type="button"
                    className={cx(
                      'inline-flex items-center gap-1 rounded px-2 py-0.5',
                      mode === 'view' && 'bg-ink-100 font-medium',
                    )}
                    onClick={() => setMode('view')}
                  >
                    <Eye size={12} /> Ler
                  </button>
                  <button
                    type="button"
                    className={cx(
                      'inline-flex items-center gap-1 rounded px-2 py-0.5',
                      mode === 'edit' && 'bg-ink-100 font-medium',
                    )}
                    onClick={() => setMode('edit')}
                  >
                    <Pencil size={12} /> Editar
                  </button>
                </div>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => addPage(page.id)}
                  icon={<Plus size={12} />}
                >
                  Subpágina
                </Button>
                <IconButton label="Excluir página" onClick={() => setConfirm('page')}>
                  <Trash2 size={13} />
                </IconButton>
              </div>
              <input
                className="mb-4 w-full border-0 bg-transparent text-[30px] font-bold outline-none"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  autosave({ name: e.target.value });
                }}
              />
              {mode === 'edit' ? (
                <textarea
                  className="min-h-[60vh] w-full resize-y rounded-md surface p-4 font-mono text-[13px] leading-relaxed outline-none focus:border-brand-400"
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    autosave({ content: e.target.value });
                  }}
                  placeholder="Escreva em markdown..."
                />
              ) : (
                <div onDoubleClick={() => setMode('edit')} className="min-h-[40vh] cursor-text">
                  <Markdown source={content} className="text-[14.5px] leading-relaxed" />
                </div>
              )}
              <div className="mt-6 text-[11px] muted">
                Markdown: # título, **negrito**, - lista, - [ ] tarefa, | tabela |, ``` código ```.
                Duplo clique no texto para editar.
              </div>
            </div>
          ) : (
            <div className="p-8 text-[13px] muted">
              {doc.isLoading ? 'Carregando...' : 'Este doc não tem páginas.'}
            </div>
          )}
        </div>
      </div>
      <Confirm
        open={confirm === 'doc'}
        onClose={() => setConfirm(null)}
        title="Excluir documento?"
        text="Todas as páginas serão excluídas."
        onConfirm={async () => {
          await api.del(`doc/${docId}`);
          inv.hierarchy();
          router.push(`/w/${wsId}/docs`);
        }}
      />
      <Confirm
        open={confirm === 'page'}
        onClose={() => setConfirm(null)}
        title="Excluir página?"
        onConfirm={async () => {
          if (page) {
            await api.del(`page/${page.id}`);
            refresh();
            router.replace('?');
          }
        }}
      />
    </>
  );
}
