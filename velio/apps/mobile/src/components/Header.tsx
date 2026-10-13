import { IconButton, Text, useTheme } from '@velio/ui/native';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

export interface HeaderProps {
  title?: string;
  subtitle?: string | null;
  back?: boolean;
  /** Fecha fluxo modal (ícone X) em vez de voltar. */
  close?: boolean;
  right?: ReactNode;
  onBack?: () => void;
  /** Sobre mapa/imagem: botões com fundo. */
  onMedia?: boolean;
}

/** Barra superior 44 pt: voltar/fechar, título e ação à direita. */
export function Header({ title, subtitle, back = true, close, right, onBack, onMedia }: HeaderProps) {
  const router = useRouter();
  const { spacing } = useTheme();
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View style={[styles.bar, { paddingHorizontal: spacing[2] }]}>
      {back || close ? (
        <IconButton icon={close ? 'x' : 'arrow-left'} accessibilityLabel={close ? 'Fechar' : 'Voltar'} onPress={goBack} variant={onMedia ? 'onMedia' : 'ghost'} />
      ) : (
        <View style={styles.spacer} />
      )}
      <View style={styles.titleWrap}>
        {title ? (
          <Text variant="heading" numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text variant="caption" color="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? <View style={styles.spacer} />}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 4 },
  titleWrap: { flex: 1, alignItems: 'center' },
  spacer: { width: 44, height: 44 },
});
