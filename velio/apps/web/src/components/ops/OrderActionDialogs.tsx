'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CancelInput, ResolveDisputeInput } from '@velio/contracts';
import { useState } from 'react';
import { Button, Dialog, Field, Input, Select, Textarea, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { centsToInput, parseBRL } from '@/lib/format';

export function CancelByPlatformDialog({
  orderId,
  open,
  onClose,
}: {
  orderId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();

  const m = useMutation({
    mutationFn: (r: string) => api.ops.cancel(orderId, r),
    onSuccess: () => {
      toast.success('Pedido cancelado pela plataforma.');
      void qc.invalidateQueries({ queryKey: ['ops'] });
      setReason('');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function submit() {
    const parsed = CancelInput.safeParse({ reason: reason.trim() });
    if (!parsed.success) {
      setError('Descreva o motivo com pelo menos 3 caracteres.');
      return;
    }
    setError(undefined);
    m.mutate(parsed.data.reason);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Cancelar pela plataforma"
      description="O cliente recebe reembolso integral. O motivo fica registrado na linha do tempo."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
          <Button variant="destructive" onClick={submit} loading={m.isPending}>
            Cancelar pedido
          </Button>
        </>
      }
    >
      <Field label="Motivo" htmlFor="cancel-reason" required error={error}>
        <Textarea
          id="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          invalid={Boolean(error)}
          placeholder="Ex.: profissional indisponível e cliente não aceitou novo horário"
        />
      </Field>
    </Dialog>
  );
}

const OUTCOMES = [
  { value: 'RESOLVED_CUSTOMER', label: 'A favor do cliente (reembolso)' },
  { value: 'RESOLVED_PROVIDER', label: 'A favor do profissional (sem reembolso)' },
  { value: 'RESOLVED_SPLIT', label: 'Dividida (reembolso parcial)' },
  { value: 'REJECTED', label: 'Rejeitar contestação' },
];

export function ResolveDisputeDialog({
  disputeId,
  maxRefundCents,
  open,
  onClose,
}: {
  disputeId: string | null;
  maxRefundCents?: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [outcome, setOutcome] = useState('RESOLVED_CUSTOMER');
  const [refund, setRefund] = useState(centsToInput(maxRefundCents ?? 0));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ refund?: string; note?: string }>({});

  const m = useMutation({
    mutationFn: (b: { outcome: string; refundCents: number; note: string }) => {
      if (!disputeId) throw new Error('Disputa não encontrada para este pedido.');
      return api.ops.resolveDispute(disputeId, b);
    },
    onSuccess: () => {
      toast.success('Disputa resolvida.');
      void qc.invalidateQueries({ queryKey: ['ops'] });
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function submit() {
    const refundCents = outcome === 'RESOLVED_PROVIDER' || outcome === 'REJECTED' ? 0 : parseBRL(refund);
    const parsed = ResolveDisputeInput.safeParse({
      outcome,
      refundCents: refundCents ?? -1,
      note: note.trim(),
    });
    if (!parsed.success) {
      const e: { refund?: string; note?: string } = {};
      for (const i of parsed.error.issues) {
        if (i.path[0] === 'refundCents') e.refund = 'Informe um valor válido em reais.';
        if (i.path[0] === 'note') e.note = 'Escreva uma justificativa com pelo menos 3 caracteres.';
      }
      setErrors(e);
      return;
    }
    if (maxRefundCents != null && parsed.data.refundCents > maxRefundCents) {
      setErrors({ refund: `O reembolso não pode passar de ${centsToInput(maxRefundCents)}.` });
      return;
    }
    setErrors({});
    m.mutate(parsed.data);
  }

  const refundDisabled = outcome === 'RESOLVED_PROVIDER' || outcome === 'REJECTED';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Resolver disputa"
      description="A decisão libera ou devolve o repasse congelado e notifica as duas partes."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
          <Button variant="primary" onClick={submit} loading={m.isPending} disabled={!disputeId}>
            Confirmar decisão
          </Button>
        </>
      }
    >
      <div className="stack">
        {!disputeId ? (
          <p className="small muted">Nenhuma disputa aberta encontrada para este pedido.</p>
        ) : null}
        <Field label="Decisão" htmlFor="dispute-outcome" required>
          <Select
            id="dispute-outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            options={OUTCOMES}
          />
        </Field>
        <Field
          label="Valor do reembolso"
          htmlFor="dispute-refund"
          error={errors.refund}
          hint={maxRefundCents != null ? `Máximo: R$ ${centsToInput(maxRefundCents)}` : undefined}
        >
          <Input
            id="dispute-refund"
            prefix="R$"
            inputMode="decimal"
            value={refundDisabled ? '0,00' : refund}
            disabled={refundDisabled}
            onChange={(e) => setRefund(e.target.value)}
            invalid={Boolean(errors.refund)}
            className="mono"
          />
        </Field>
        <Field label="Justificativa" htmlFor="dispute-note" required error={errors.note}>
          <Textarea
            id="dispute-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            invalid={Boolean(errors.note)}
          />
        </Field>
      </div>
    </Dialog>
  );
}
