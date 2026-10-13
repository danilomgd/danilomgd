import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Chip, Input, ListSkeleton, Text, useTheme, useToast } from '@velio/ui/native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSession } from '@/auth/session';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { maskCpfCnpj } from '@/lib/format';
import { getCurrentPosition, requestForegroundLocation } from '@/lib/location';
import { qk } from '@/lib/query';

const RADII = [5, 10, 15, 25, 40];

/** P-02 a P-06: cadastro do prestador em uma tela: dados, categorias, área base e raio. Documentos: tela "pending". */
export default function OnboardingScreen() {
  const session = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const { spacing } = useTheme();
  const categories = useQuery({ queryKey: qk.categories, queryFn: () => api.catalog.categories() });
  const [form, setForm] = useState({
    displayName: session.user?.name ?? '',
    legalName: '',
    documentNumber: '',
    bio: '',
    city: '',
    state: '',
  });
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [radius, setRadius] = useState(15);
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      await requestForegroundLocation();
      const pos = await getCurrentPosition();
      if (!pos) throw new Error('Ative a localização: usamos sua posição atual como base de atendimento.');
      return api.provider.onboard({
        displayName: form.displayName.trim(),
        legalName: form.legalName.trim(),
        documentNumber: form.documentNumber.replace(/\D/g, ''),
        bio: form.bio.trim() || undefined,
        categoryIds,
        baseAddress: { lat: pos.lat, lng: pos.lng, city: form.city.trim(), state: form.state.toUpperCase() },
        serviceRadiusKm: radius,
      });
    },
    onSuccess: (p) => {
      qc.setQueryData(qk.provider.me, p);
      toast.show({ message: 'Cadastro enviado. Agora envie seus documentos.', tone: 'success' });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const docDigits = form.documentNumber.replace(/\D/g, '');
  const valid =
    form.displayName.trim().length >= 2 &&
    form.legalName.trim().length >= 2 &&
    (docDigits.length === 11 || docDigits.length === 14) &&
    categoryIds.length > 0 &&
    form.city.trim() &&
    form.state.length === 2;
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Screen
      keyboard
      footer={
        <Button
          label="Enviar cadastro"
          onPress={() => submit.mutate()}
          loading={submit.isPending}
          disabled={!valid}
          disabledReason={
            !valid ? 'Preencha nome, documento, cidade, UF e ao menos uma categoria.' : undefined
          }
        />
      }
    >
      <View style={{ gap: spacing[2], marginBottom: spacing[6], paddingTop: spacing[4] }}>
        <Text variant="title" accessibilityRole="header">
          Seu cadastro profissional
        </Text>
        <Text variant="body" color="muted">
          Leva 3 minutos. Depois enviamos seus documentos para análise.
        </Text>
      </View>
      <Section title="Dados">
        <View style={{ gap: spacing[3] }}>
          <Input
            label="Nome de exibição"
            value={form.displayName}
            onChangeText={set('displayName')}
            hint="Como o cliente vai te ver."
          />
          <Input
            label="Nome completo ou razão social"
            value={form.legalName}
            onChangeText={set('legalName')}
          />
          <Input
            label="CPF ou CNPJ"
            value={form.documentNumber}
            onChangeText={(t) => set('documentNumber')(maskCpfCnpj(t))}
            keyboardType="number-pad"
          />
          <Input
            kind="multiline"
            label="Sobre você (opcional)"
            value={form.bio}
            onChangeText={set('bio')}
            maxLength={500}
            placeholder="Experiência, especialidades"
          />
        </View>
      </Section>
      <Section title="Especialidades" subtitle="Você recebe ofertas só destas categorias.">
        {categories.isPending ? (
          <ListSkeleton rows={2} />
        ) : (
          <View style={styles.chips}>
            {(categories.data ?? [])
              .filter((c) => c.active)
              .map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  icon={c.icon}
                  selected={categoryIds.includes(c.id)}
                  onPress={() =>
                    setCategoryIds((cur) =>
                      cur.includes(c.id) ? cur.filter((x) => x !== c.id) : [...cur, c.id],
                    )
                  }
                />
              ))}
          </View>
        )}
      </Section>
      <Section title="Área de atendimento" subtitle="Sua posição atual será a base.">
        <View style={styles.row}>
          <Input label="Cidade" value={form.city} onChangeText={set('city')} containerStyle={{ flex: 3 }} />
          <Input
            label="UF"
            value={form.state}
            onChangeText={(t) => set('state')(t.toUpperCase().slice(0, 2))}
            autoCapitalize="characters"
            maxLength={2}
            containerStyle={{ flex: 1 }}
          />
        </View>
        <Text variant="labelSm" color="muted" style={{ marginTop: spacing[3], marginBottom: 8 }}>
          Raio
        </Text>
        <View style={styles.chips}>
          {RADII.map((r) => (
            <Chip key={r} label={`${r} km`} selected={radius === r} onPress={() => setRadius(r)} />
          ))}
        </View>
      </Section>
      {error ? (
        <Text variant="bodySm" color="danger">
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
});
