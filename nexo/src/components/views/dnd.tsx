'use client';

import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type ReactNode, useState } from 'react';
import { useUpdateTask } from '@/lib/hooks';
import type { Task } from '@/lib/types';
import type { Group } from './view-engine';

/**
 * Contexto de arrastar-e-soltar para views agrupadas (lista e quadro).
 * Ao soltar, aplica o patch do grupo de destino e recalcula o orderIndex.
 */
export function TaskDnd({
  groups,
  children,
  renderOverlay,
}: {
  groups: Group[];
  children: ReactNode;
  renderOverlay: (t: Task) => ReactNode;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const update = useUpdateTask();
  const [active, setActive] = useState<Task | null>(null);
  const findTask = (id: string) => groups.flatMap((g) => g.tasks).find((t) => t.id === id) ?? null;
  const groupOf = (id: string) =>
    groups.find((g) => g.key === id || g.tasks.some((t) => t.id === id));

  const onDragStart = (e: DragStartEvent) => setActive(findTask(String(e.active.id)));
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const { active, over } = e;
    if (!over) return;
    const task = findTask(String(active.id));
    if (!task) return;
    const target = groupOf(String(over.id));
    if (!target) return;
    const overTask = target.tasks.find((t) => t.id === String(over.id));
    const others = target.tasks.filter((t) => t.id !== task.id);
    let orderIndex: number;
    if (!overTask || overTask.id === task.id) {
      orderIndex = (others[others.length - 1]?.orderIndex ?? 0) + 1;
    } else {
      const idx = others.findIndex((t) => t.id === overTask.id);
      const prev = others[idx - 1]?.orderIndex ?? overTask.orderIndex - 1;
      orderIndex = (prev + overTask.orderIndex) / 2;
    }
    const sameGroup = groupOf(task.id)?.key === target.key;
    update.mutate({ id: task.id, patch: { ...(sameGroup ? {} : target.patch), orderIndex } });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      {children}
      <DragOverlay dropAnimation={null}>{active ? renderOverlay(active) : null}</DragOverlay>
    </DndContext>
  );
}

export function DroppableGroup({
  id,
  children,
  className,
  style,
}: {
  id: string;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={className} style={style} data-over={isOver || undefined}>
      {children}
    </div>
  );
}

export function SortableTasks({ ids, children }: { ids: string[]; children: ReactNode }) {
  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      {children}
    </SortableContext>
  );
}

export function SortableTask({
  id,
  children,
  className,
  onClick,
}: {
  id: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
      className={className}
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}
