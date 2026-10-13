import type { OrderStatus } from '@velio/contracts';
import { formatBRL } from '@velio/contracts';
import { customerCancellation } from '@velio/domain';
import { BottomSheet, Button, Chip, Input, Text, useTheme } from '@velio/ui/native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

const CUSTOMER_REASONS = ['Mudei de ideia', 'Resolvi de outra forma', 'Demorou demais', 'Erro no pedido'];
const PROVIDER_REASONS = [
  'Imprevisto pessoal',
  'Problema com o veículo',
  'Cliente não responde',
  'Local inacessível',
];

export interface CancelSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading?: boolean;
  audience: 'customer' | 'provider';
  status: OrderStatus;
  acceptedAt?: string | null;
  priceCents?: number | null;
}

/** C-32 / P-19: cancelar com custo (cliente) ou aviso de penalidade (prestador) visível. */
export function CancelSheet({
  visible,
  onClose,
  onConfirm,
  loading,
  audience: role,
  status,
  acceptedAt,
  priceCents,
}: CancelSheetProps) {
  const { spacing } = useTheme();
  const [reason, setReason] = useState('');
  const [custom, setCustom] = useState('');
  const outcome =
    role === 'customer'
      ? customerCancellation(status, acceptedAt ? new Date(acceptedAt) : null, new Date(), priceCents ?? null)
      : null;
  const finalReason = (custom.trim() || reason).trim();
  const reasons = role === 'customer' ? CUSTOMER_REASONS : PROVIDER_REASONS;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={role === 'customer' ? 'Cancelar pedido?' : 'Cancelar atendimento?'}
    >
      <View style={{ gap: spacing[4] }}>
        {role === 'customer' && outcome ? (
          <Text variant="body" color={outcome.feeCents > 0 ? 'warning' : 'muted'}>
            {!outcome.allowed
              ? outcome.reason
              : outcome.feeCents > 0
                ? `Taxa de ${formatBRL(outcome.feeCents)}. ${outcome.reason}.`
                : 'Sem custo.'}
          </Text>
        ) : (
          <Text variant="body" color="warning">
            Cancelar após aceitar afeta sua reputação e a ordem volta para outros profissionais.
          </Text>
        )}
        <View style={styles.chips}>
          {reasons.map((r) => (
            <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />
          ))}
        </View>
        <Input
          placeholder="Outro motivo (opcional)"
          value={custom}
          onChangeText={setCustom}
          maxLength={300}
        />
        <Button
          label={
            role === 'customer' && outcome && outcome.feeCents > 0
              ? `Cancelar com taxa de ${formatBRL(outcome.feeCents)}`
              : 'Confirmar cancelamento'
          }
          variant="danger"
          onPress={() => onConfirm(finalReason)}
          loading={loading}
          disabled={finalReason.length < 3 || (outcome ? !outcome.allowed : false)}
          disabledReason={finalReason.length < 3 ? 'Escolha ou escreva um motivo.' : undefined}
        />
        <Button label="Voltar" variant="ghost" onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({ chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
