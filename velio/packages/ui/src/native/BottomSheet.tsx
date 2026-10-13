import { type ReactNode, useEffect, useRef } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { IconButton } from './IconButton';
import { Text } from './Text';
import { useTheme } from './theme';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Fração da altura da tela (0,3 a 0,9). Padrão: conteúdo. */
  heightFraction?: number;
  dismissable?: boolean;
}

/** Folha inferior modal simples: overlay, alça, cabeçalho fixo com fechar, conteúdo rolável pelo chamador. */
export function BottomSheet({ visible, onClose, title, children, heightFraction, dismissable = true }: BottomSheetProps) {
  const { colors, radius, elevation, motion } = useTheme();
  const { height } = useWindowDimensions();
  const slide = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    if (visible) {
      slide.setValue(height);
      Animated.timing(slide, { toValue: 0, duration: motion.duration.slow, useNativeDriver: true }).start();
    }
  }, [visible, height, slide, motion.duration.slow]);

  const maxHeight = Math.round(height * Math.min(0.92, Math.max(0.3, heightFraction ?? 0.92)));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismissable ? onClose : undefined} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={dismissable ? onClose : undefined} accessibilityLabel="Fechar" accessibilityRole="button" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.sheet,
              { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight, transform: [{ translateY: slide }], ...elevation.lg },
              heightFraction ? { height: maxHeight } : null,
            ]}
            accessibilityViewIsModal
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            {title || dismissable ? (
              <View style={styles.header}>
                <Text variant="title" style={{ flex: 1 }} accessibilityRole="header">
                  {title ?? ''}
                </Text>
                {dismissable ? <IconButton icon="x" accessibilityLabel="Fechar" variant="tonal" onPress={onClose} /> : null}
              </View>
            ) : null}
            <View style={styles.body}>{children}</View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  overlay: { position: 'absolute', inset: 0 },
  sheet: { paddingBottom: 24 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 8, marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 8, gap: 8 },
  body: { paddingHorizontal: 20, flexShrink: 1 },
});
