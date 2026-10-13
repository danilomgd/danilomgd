import { Button, Input, Text, useTheme, useToast } from '@velio/ui/native';
import { useMutation } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSession } from '@/auth/session';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { APP_NAME, APP_ROLE, IS_PROVIDER_APP } from '@/lib/config';
import { errorMessage } from '@/lib/errors';
import { maskPhoneBR, normalizePhoneBR } from '@/lib/format';

/** C-01 / P-01: boas-vindas e telefone. */
export function PhoneScreen() {
  const router = useRouter();
  const toast = useToast();
  const session = useSession();
  const { spacing } = useTheme();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.notice) {
      toast.show({ message: session.notice, tone: 'warning' });
      session.clearNotice();
    }
  }, [session, toast]);

  const request = useMutation({
    mutationFn: (e164: string) => api.auth.requestOtp({ phone: e164, app: APP_ROLE }),
    onSuccess: (r, e164) => {
      const params = new URLSearchParams({ challengeId: r.challengeId, phone: e164, expiresIn: String(r.expiresInSeconds) });
      if (r.devCode) params.set('devCode', r.devCode);
      router.push(`/(${APP_ROLE})/(auth)/otp?${params.toString()}`);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (session.status === 'authenticated' && session.needsOnboarding) {
    return <Redirect href={`/(${APP_ROLE})/(auth)/profile`} />;
  }

  function submit() {
    const e164 = normalizePhoneBR(phone);
    if (!e164) {
      setError('Informe um celular com DDD, por exemplo (11) 98765-4321.');
      return;
    }
    setError(null);
    request.mutate(e164);
  }

  return (
    <Screen keyboard footer={<Button label="Continuar" onPress={submit} loading={request.isPending} disabled={phone.replace(/\D/g, '').length < 10} />}>
      <View style={[styles.hero, { paddingTop: spacing[12] }]}>
        <Text variant="display">{APP_NAME}</Text>
        <Text variant="body" color="muted">
          {IS_PROVIDER_APP ? 'Receba serviços perto de você e seja pago sem burocracia.' : 'Serviços para casa e carro, com acompanhamento ao vivo.'}
        </Text>
      </View>
      <Input
        label="Seu celular"
        kind="phone"
        placeholder="(11) 98765-4321"
        value={phone}
        onChangeText={(t) => setPhone(maskPhoneBR(t))}
        error={error}
        hint="Enviamos um código por SMS."
        autoFocus
        textContentType="telephoneNumber"
        autoComplete="tel"
        onSubmitEditing={submit}
        returnKeyType="done"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ hero: { gap: 8, marginBottom: 32 } });
