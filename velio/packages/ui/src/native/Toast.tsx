import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Icon, type IconProps } from './Icon';
import { Text } from './Text';
import { useTheme } from './theme';

export type ToastTone = 'neutral' | 'success' | 'error' | 'warning';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  action?: { label: string; onPress: () => void };
  durationMs?: number;
}

interface ToastEntry extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  show: (opts: ToastOptions | string) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const ICONS: Record<ToastTone, IconProps['name']> = {
  neutral: 'info',
  success: 'check-circle',
  error: 'alert-circle',
  warning: 'alert-triangle',
};

/** Provedor de toasts: empilha até 2, some em 4 s (8 s com ação). */
export function ToastProvider({
  children,
  bottomOffset = 24,
}: {
  children: ReactNode;
  bottomOffset?: number;
}) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (opts: ToastOptions | string) => {
      const o = typeof opts === 'string' ? { message: opts } : opts;
      const id = ++counter.current;
      setToasts((t) => [...t.slice(-1), { ...o, id }]);
      const duration = o.durationMs ?? (o.action ? 8000 : 4000);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View pointerEvents="box-none" style={[styles.host, { bottom: bottomOffset }]}>
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: ToastEntry; onDismiss: () => void }) {
  const { colors, radius, elevation, motion } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: motion.duration.fast, useNativeDriver: true }).start();
  }, [anim, motion.duration.fast]);
  const tone = toast.tone ?? 'neutral';
  const iconColor =
    tone === 'success'
      ? colors.success
      : tone === 'error'
        ? colors.danger
        : tone === 'warning'
          ? colors.warning
          : colors.textOnPrimary;
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        styles.toast,
        {
          backgroundColor: colors.text,
          borderRadius: radius.md,
          opacity: anim,
          transform: [{ translateY: Animated.multiply(Animated.subtract(1, anim), 16) }],
          ...elevation.md,
        },
      ]}
    >
      <Icon name={ICONS[tone]} size="md" color={iconColor} />
      <Text variant="body" style={{ color: colors.bg, flex: 1 }} numberOfLines={3}>
        {toast.message}
      </Text>
      {toast.action ? (
        <Pressable
          onPress={() => {
            toast.action?.onPress();
            onDismiss();
          }}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text variant="label" style={{ color: colors.accent }}>
            {toast.action.label}
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, gap: 8 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
  },
});
