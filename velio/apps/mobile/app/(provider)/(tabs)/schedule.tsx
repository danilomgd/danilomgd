import { useQuery } from '@tanstack/react-query';
import { TERMINAL_ORDER_STATUSES } from '@velio/contracts';
import {
  Button,
  Chip,
  EmptyState,
  IconButton,
  ListItem,
  ListSkeleton,
  Text,
  useTheme,
  useToast,
} from '@velio/ui/native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { OrderRow } from '@/components/OrderRow';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { api } from '@/lib/api';
import { minutesToClock, WEEKDAY_SHORT, weekdayName } from '@/lib/format';
import { qk } from '@/lib/query';
import { prefs } from '@/lib/storage';

interface Window {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

const PRESETS: Array<{ label: string; start: number; end: number }> = [
  { label: 'Manhã 08–12', start: 480, end: 720 },
  { label: 'Tarde 13–18', start: 780, end: 1080 },
  { label: 'Noite 18–22', start: 1080, end: 1320 },
  { label: 'Dia todo 08–18', start: 480, end: 1080 },
];

/**
 * P-17: agenda semanal e próximas ordens.
 * A API cliente ainda não expõe `PUT /providers/me/schedule` (`SetScheduleInput` existe em contracts):
 * as janelas ficam salvas neste aparelho até a rota entrar em `api-client` (ver README).
 */
export default function ScheduleScreen() {
  const router = useRouter();
  const toast = useToast();
  const { spacing } = useTheme();
  const [windows, setWindows] = useState<Window[]>([]);
  const [day, setDay] = useState(new Date().getDay());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    prefs.get<Window[]>('provider.schedule').then((w) => w && setWindows(w));
  }, []);

  const orders = useQuery({
    queryKey: qk.provider.orders('active'),
    queryFn: () => api.provider.orders({ scope: 'active', limit: 20 }),
  });
  const upcoming = (orders.data?.items ?? [])
    .filter((o) => !TERMINAL_ORDER_STATUSES.has(o.status) && o.scheduledFor)
    .sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''));

  const dayWindows = windows.filter((w) => w.weekday === day).sort((a, b) => a.startMinute - b.startMinute);

  function addPreset(p: (typeof PRESETS)[number]) {
    if (dayWindows.some((w) => w.startMinute < p.end && p.start < w.endMinute)) {
      toast.show({ message: 'Janela sobreposta a outra já cadastrada.', tone: 'warning' });
      return;
    }
    setWindows((cur) => [...cur, { weekday: day, startMinute: p.start, endMinute: p.end }]);
    setDirty(true);
  }

  async function save() {
    await prefs.set('provider.schedule', windows);
    setDirty(false);
    toast.show({ message: 'Agenda salva neste aparelho.', tone: 'success' });
  }

  return (
    <Screen footer={dirty ? <Button label="Salvar agenda" onPress={save} /> : undefined}>
      <Text variant="title" accessibilityRole="header" style={{ marginBottom: spacing[4] }}>
        Agenda
      </Text>
      <Section title="Disponibilidade semanal" subtitle="Ofertas agendadas respeitam estas janelas.">
        <View style={styles.days}>
          {WEEKDAY_SHORT.map((d, i) => (
            <Chip key={d} label={d} selected={day === i} onPress={() => setDay(i)} size="sm" />
          ))}
        </View>
        <Text variant="labelSm" color="muted" style={{ marginTop: spacing[3], marginBottom: 4 }}>
          {weekdayName(day)}
        </Text>
        {dayWindows.length ? (
          dayWindows.map((w) => (
            <ListItem
              key={`${w.weekday}-${w.startMinute}`}
              title={`${minutesToClock(w.startMinute)} – ${minutesToClock(w.endMinute)}`}
              icon="clock"
              trailing={
                <IconButton
                  icon="trash-2"
                  accessibilityLabel="Remover janela"
                  onPress={() => {
                    setWindows((cur) => cur.filter((x) => x !== w));
                    setDirty(true);
                  }}
                />
              }
            />
          ))
        ) : (
          <Text variant="bodySm" color="muted">
            Sem janelas neste dia.
          </Text>
        )}
        <View style={[styles.days, { marginTop: spacing[3] }]}>
          {PRESETS.map((p) => (
            <Chip key={p.label} label={p.label} icon="plus" onPress={() => addPreset(p)} size="sm" />
          ))}
        </View>
      </Section>
      <Section title="Próximos agendamentos">
        {orders.isPending ? (
          <ListSkeleton rows={2} />
        ) : upcoming.length ? (
          <View style={{ gap: spacing[2] }}>
            {upcoming.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                audience="provider"
                onPress={() => router.push(`/(provider)/order/${o.id}`)}
              />
            ))}
          </View>
        ) : (
          <EmptyState
            compact
            icon="calendar"
            title="Sem agendamentos"
            description="Serviços agendados aceitos aparecem aqui."
          />
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({ days: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
