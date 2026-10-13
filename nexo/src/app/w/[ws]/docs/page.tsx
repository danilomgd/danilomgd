'use client';

import { BookOpen, FileText, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Topbar } from '@/components/shell/topbar';
import { useWorkspace } from '@/components/shell/workspace-context';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { inputClass } from '@/components/ui/modal';
import { api } from '@/lib/api';
import { fmtAgo } from '@/lib/format';
import { useDocs, useInvalidate } from '@/lib/hooks';

export default function DocsPage() {
  const { wsId, hierarchy } = useWorkspace();
  const docs = useDocs(wsId);
  const inv = useInvalidate();
  const router = useRouter();
  const [q, setQ] = useState('');
  const items = (docs.data ?? []).filter((d) => d.name.toLowerCase().includes(q.toLowerCase()));
  const locationOf = (d: { parentType: string; parentId: string | null }) => {
    if (d.parentType === 'space')
      return hierarchy?.spaces.find((s) => s.id === d.parentId)?.name ?? 'Space';
    if (d.parentType === 'workspace') return 'Workspace';
    return d.parentType;
  };
  const create = async () => {
    const doc = await api.post<{ id: string }>(`team/${wsId}/doc`, { name: 'Novo documento' });
    inv.qc.invalidateQueries({ queryKey: ['docs'] });
    inv.hierarchy();
    router.push(`/w/${wsId}/docs/${doc.id}`);
  };
  return (
    <>
      <Topbar crumbs={[{ label: 'Docs' }]} />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[1000px] px-5 py-5">
          <div className="mb-4 flex items-center gap-3">
            <h1 className="text-[20px] font-semibold">Docs</h1>
            <label className="ml-auto flex h-8 items-center gap-1 rounded-md surface px-2 text-[12px]">
              <Search size={13} className="muted" />
              <input
                className="w-48 bg-transparent outline-none"
                placeholder="Buscar docs"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <Button variant="primary" icon={<Plus size={14} />} onClick={create}>
              Novo doc
            </Button>
          </div>
          <div className="overflow-hidden rounded-lg border border-line">
            <div className="grid grid-cols-[1fr_140px_120px_120px] gap-2 border-b border-line bg-muted-page px-3 py-1.5 text-[11px] font-semibold uppercase muted">
              <span>Nome</span>
              <span>Local</span>
              <span>Criado por</span>
              <span>Atualizado</span>
            </div>
            {items.map((d) => (
              <Link
                key={d.id}
                href={`/w/${wsId}/docs/${d.id}`}
                className="grid grid-cols-[1fr_140px_120px_120px] items-center gap-2 border-b border-line px-3 py-2 text-[13px] last:border-b-0 row-hover"
              >
                <span className="flex items-center gap-2">
                  <BookOpen size={15} className="text-brand-500" />{' '}
                  <span className="font-medium">{d.name}</span>{' '}
                  <span className="text-[11px] muted">{d.pages.length} página(s)</span>
                </span>
                <span className="truncate text-[12px] muted">{locationOf(d)}</span>
                <span className="flex items-center gap-1 text-[12px]">
                  <Avatar user={d.creator} size={18} /> {d.creator?.username.split(' ')[0]}
                </span>
                <span className="text-[12px] muted">{fmtAgo(d.updatedAt)}</span>
              </Link>
            ))}
            {items.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-[13px] muted">
                <FileText size={26} className="text-ink-300" /> Nenhum documento. Crie o primeiro.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export { inputClass };
