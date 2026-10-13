'use client';

import { useRouter } from 'next/navigation';
import { use } from 'react';
import { Topbar } from '@/components/shell/topbar';
import { useWorkspace } from '@/components/shell/workspace-context';
import { TaskModal } from '@/components/task/task-modal';
import { useTask } from '@/lib/hooks';

export default function TaskPage({ params }: { params: Promise<{ ws: string; taskId: string }> }) {
  const { taskId } = use(params);
  const { wsId } = useWorkspace();
  const router = useRouter();
  const task = useTask(taskId);
  return (
    <>
      <Topbar
        crumbs={[
          { label: 'Tarefa', href: `/w/${wsId}/everything` },
          { label: task.data?.customId ?? taskId },
        ]}
      />
      <div className="min-h-0 flex-1">
        <TaskModal taskId={taskId} fullPage onClose={() => router.push(`/w/${wsId}/home`)} />
      </div>
    </>
  );
}
