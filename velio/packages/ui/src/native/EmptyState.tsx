import { StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Icon, type IconProps } from './Icon';
import { Text } from './Text';
import { useTheme } from './theme';

export interface EmptyStateProps {
  icon?: IconProps['name'];
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void; loading?: boolean };
  compact?: boolean;
}

/** Estado vazio: ícone, título (até 6 palavras), texto curto e uma ação secundária. */
export function EmptyState({ icon = 'inbox', title, description, action, compact }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, compact ? styles.compact : null]} accessibilityRole="summary">
      <View
        style={[
          styles.circle,
          {
            backgroundColor: colors.primarySoft,
            width: compact ? 48 : 72,
            height: compact ? 48 : 72,
            borderRadius: compact ? 24 : 36,
          },
        ]}
      >
        <Icon name={icon} size={compact ? 'lg' : 'xl'} color={colors.primary} />
      </View>
      <Text variant={compact ? 'heading' : 'titleSm'} align="center">
        {title}
      </Text>
      {description ? (
        <Text variant="body" color="muted" align="center" style={{ maxWidth: 320 }}>
          {description}
        </Text>
      ) : null}
      {action ? (
        <Button
          label={action.label}
          variant="secondary"
          onPress={action.onPress}
          loading={action.loading}
          fullWidth={false}
          size="md"
          style={{ marginTop: 8 }}
        />
      ) : null}
    </View>
  );
}

/** Estado de erro com "Tentar novamente". */
export function ErrorState({
  title = 'Não foi possível carregar',
  description,
  onRetry,
  retrying,
  compact,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
}) {
  return (
    <EmptyState
      icon="alert-circle"
      title={title}
      description={description ?? 'Verifique sua conexão e tente de novo.'}
      action={onRetry ? { label: 'Tentar novamente', onPress: onRetry, loading: retrying } : undefined}
      compact={compact}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10, paddingVertical: 40, paddingHorizontal: 20 },
  compact: { paddingVertical: 20 },
  circle: { alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
