import { Button, OTPInput, Text, useToast } from '@velio/ui/native';
import { ApiRequestError } from '@velio/api-client';
import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSession } from '@/auth/session';
import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { APP_ROLE } from '@/lib/config';
import { errorMessage } from '@/lib/errors';
import { maskPhoneBR } from '@/lib/format';

const RESEND_SECONDS = 30;

/** C-01 / P-01: código de 6 dígitos. */
export function OtpScreen() {
  const router = useRouter();
  const toast = useToast();
  const session = useSession();
  const params = useLocalSearchParams<{ challengeId: string; phone: string; devCode?: string; expiresIn?: string }>();
  const [challengeId, setChallengeId] = useState(params.challengeId ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const verify = useMutation({
    mutationFn: (c: string) =>
      api.auth.verifyOtp({ challengeId, code: c, deviceName: Platform.OS === 'web' ? 'web' : `${Platform.OS} ${Platform.Version}` }),
    onSuccess: async (tokens) => {
      await session.signIn(tokens);
      if (tokens.needsOnboarding) router.replace(`/(${APP_ROLE})/(auth)/profile`);
    },
    onError: (e) => {
      setCode('');
      if (e instanceof ApiRequestError && e.status === 429) setError('Muitas tentativas. Tente novamente em 15 min.');
      else setError(errorMessage(e, 'Código inválido. Confira e tente de novo.'));
    },
  });

  const resend = useMutation({
    mutationFn: () => api.auth.requestOtp({ phone: params.phone ?? '', app: APP_ROLE }),
    onSuccess: (r) => {
      setChallengeId(r.challengeId);
      setCode('');
      setError(null);
      setCooldown(RESEND_SECONDS);
      toast.show({ message: 'Novo código enviado.', tone: 'success' });
    },
    onError: (e) => toast.show({ message: errorMessage(e), tone: 'error' }),
  });

  return (
    <Screen keyboard footer={<Button label="Confirmar código" onPress={() => verify.mutate(code)} loading={verify.isPending} disabled={code.length !== 6} />}>
      <Header title="Confirmar celular" />
      <View style={styles.body}>
        <Text variant="title">Digite o código</Text>
        <Text variant="body" color="muted">
          Enviado por SMS para {maskPhoneBR(params.phone ?? '')}.
        </Text>
        <View style={styles.otp}>
          <OTPInput length={6} value={code} onChange={setCode} onComplete={(c) => verify.mutate(c)} error={Boolean(error)} disabled={verify.isPending} autoFocus />
        </View>
        {error ? (
          <Text variant="bodySm" color="danger" align="center" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        {params.devCode ? (
          <Text variant="caption" color="muted" align="center">
            Ambiente de teste: código {params.devCode}
          </Text>
        ) : null}
        <Pressable onPress={() => resend.mutate()} disabled={cooldown > 0 || resend.isPending} accessibilityRole="button" style={styles.resend}>
          <Text variant="label" color={cooldown > 0 ? 'muted' : 'brand'} align="center">
            {cooldown > 0 ? `Reenviar código em ${cooldown} s` : 'Reenviar código'}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12, paddingTop: 16 },
  otp: { marginVertical: 20 },
  resend: { minHeight: 44, justifyContent: 'center', marginTop: 8 },
});
