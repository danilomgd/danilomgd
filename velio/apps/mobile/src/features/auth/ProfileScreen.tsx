import { useMutation } from '@tanstack/react-query';
import { Button, Input, ListItem, Switch, Text } from '@velio/ui/native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSession } from '@/auth/session';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { IS_PROVIDER_APP } from '@/lib/config';
import { errorMessage } from '@/lib/errors';

/** C-02: nome e consentimentos (termos, privacidade, personalização). */
export function ProfileScreen() {
  const session = useSession();
  const [name, setName] = useState(session.user?.name ?? '');
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [personalization, setPersonalization] = useState(true);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.auth.updateProfile({ name: name.trim(), consents: { terms, privacy, personalization, marketing } }),
    onSuccess: (user) => session.completeOnboarding(user),
    onError: (e) => setError(errorMessage(e)),
  });

  const valid = name.trim().length >= 2 && terms && privacy;

  return (
    <Screen
      keyboard
      footer={
        <Button
          label="Começar"
          onPress={() => save.mutate()}
          loading={save.isPending}
          disabled={!valid}
          disabledReason={!terms || !privacy ? 'Aceite os termos e a política para continuar.' : undefined}
        />
      }
    >
      <View style={styles.body}>
        <Text variant="title">Como podemos te chamar?</Text>
        <Input
          label="Nome"
          placeholder="Seu nome"
          value={name}
          onChangeText={setName}
          autoFocus
          textContentType="name"
          autoComplete="name"
          error={error}
        />
        <View style={styles.consents}>
          <ListItem
            title="Li e aceito os Termos de uso"
            trailing={
              <Switch value={terms} onValueChange={setTerms} accessibilityLabel="Aceitar termos de uso" />
            }
          />
          <ListItem
            title="Li e aceito a Política de privacidade"
            trailing={
              <Switch
                value={privacy}
                onValueChange={setPrivacy}
                accessibilityLabel="Aceitar política de privacidade"
              />
            }
          />
          <ListItem
            title={
              IS_PROVIDER_APP
                ? 'Sugestões com base no meu histórico'
                : 'Recomendações com base nos meus equipamentos e pedidos'
            }
            subtitle="Opcional. Você pode mudar depois."
            trailing={
              <Switch
                value={personalization}
                onValueChange={setPersonalization}
                accessibilityLabel="Permitir personalização"
              />
            }
          />
          <ListItem
            title="Receber novidades e ofertas"
            subtitle="Opcional."
            divider={false}
            trailing={
              <Switch
                value={marketing}
                onValueChange={setMarketing}
                accessibilityLabel="Receber comunicações de marketing"
              />
            }
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ body: { gap: 20, paddingTop: 24 }, consents: { marginTop: 8 } });
