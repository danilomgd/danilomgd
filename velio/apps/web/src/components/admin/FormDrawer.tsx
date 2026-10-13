'use client';

import type { ReactNode } from 'react';
import { Button, Drawer, InlineAlert } from '@/components/ui';

export interface FormDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  onSubmit: () => void;
  submitting?: boolean;
  submitLabel?: string;
  onDelete?: () => void;
  deleting?: boolean;
  error?: string | null;
  children: ReactNode;
  wide?: boolean;
}

/** Drawer padrão para criar/editar um recurso administrativo. */
export function FormDrawer({
  open,
  onClose,
  title,
  description,
  onSubmit,
  submitting,
  submitLabel = 'Salvar',
  onDelete,
  deleting,
  error,
  children,
  wide,
}: FormDrawerProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      wide={wide}
      footer={
        <>
          {onDelete ? (
            <Button
              variant="destructiveSoft"
              onClick={onDelete}
              loading={deleting}
              style={{ marginRight: 'auto' }}
            >
              Excluir
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="resource-form" loading={submitting}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        id="resource-form"
        className="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {error ? <InlineAlert>{error}</InlineAlert> : null}
        {children}
      </form>
    </Drawer>
  );
}

export function ConfirmDialogButtons({
  onCancel,
  onConfirm,
  loading,
  label = 'Confirmar',
  destructive,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
  label?: string;
  destructive?: boolean;
}) {
  return (
    <>
      <Button variant="ghost" onClick={onCancel}>
        Voltar
      </Button>
      <Button variant={destructive ? 'destructive' : 'primary'} onClick={onConfirm} loading={loading}>
        {label}
      </Button>
    </>
  );
}
