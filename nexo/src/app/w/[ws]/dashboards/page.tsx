'use client';

import { LayoutDashboard, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/components/shell/topbar';
import { useWorkspace } from '@/components/shell/workspace-context';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useDashboards, useInvalidate } from '@/lib/hooks';

export default function DashboardsPage() {
  const { wsId } = useWorkspace();
  const dash = useDashboards(wsId);
  const inv = useInvalidate();
  const router = useRouter();
  const create = async () => {
    const d = await api.post<{ id: string }>(`team/${wsId}/dashboard`, { name: 'Novo dashboard' });
    inv.qc.invalidateQueries({ queryKey: ['dashboards'] });
    inv.hierarchy();
    router.push(`/w/${wsId}/dashboards/${d.id}`);
  };
  return (
    <>
      <Topbar crumbs={[{ label: 'Dashboards' }]} />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[1000px] px-5 py-5">
          <div className="mb-4 flex items-center gap-3">
            <h1 className="text-[20px] font-semibold">Dashboards</h1>
            <Button
              className="ml-auto"
              variant="primary"
              icon={<Plus size={14} />}
              onClick={create}
            >
              Novo dashboard
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dash.data?.map((d) => (
              <Link
                key={d.id}
                href={`/w/${wsId}/dashboards/${d.id}`}
                className="rounded-lg border border-line p-4 hover:border-brand-300 hover:bg-muted-page"
              >
                <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold">
                  <LayoutDashboard size={16} className="text-brand-500" /> {d.name}
                </div>
                <div className="text-[12px] muted">{d.widgets.length} widget(s)</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
