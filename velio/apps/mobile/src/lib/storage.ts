import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserPublic } from '@velio/contracts';
import { Platform } from 'react-native';

/**
 * Armazenamento seguro de sessão: `expo-secure-store` no nativo, `localStorage` na web
 * (SecureStore não existe na web; a web é apenas ambiente de desenvolvimento/preview).
 */
async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  const SecureStore = await import('expo-secure-store');
  return SecureStore.getItemAsync(key);
}

async function secureSet(key: string, value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
    } catch {
      // sem armazenamento disponível (modo privado)
    }
    return;
  }
  const SecureStore = await import('expo-secure-store');
  if (value === null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  needsOnboarding: boolean;
  user: UserPublic;
}

const SESSION_KEY = 'velio.session.v1';

let cache: StoredSession | null | undefined;

export const sessionStorage = {
  async load(): Promise<StoredSession | null> {
    if (cache !== undefined) return cache;
    const raw = await secureGet(SESSION_KEY);
    cache = raw ? (JSON.parse(raw) as StoredSession) : null;
    return cache;
  },
  async save(session: StoredSession | null): Promise<void> {
    cache = session;
    await secureSet(SESSION_KEY, session ? JSON.stringify(session) : null);
  },
  /** Atualiza só os tokens (refresh rotativo) mantendo usuário e onboarding. */
  async setTokens(t: { accessToken: string; refreshToken: string } | null): Promise<void> {
    const current = await this.load();
    if (!t) return this.save(null);
    if (!current) return;
    await this.save({ ...current, ...t });
  },
  peek(): StoredSession | null {
    return cache ?? null;
  },
};

/** Preferências não sensíveis (último endereço, aba, rascunhos). */
export const prefs = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(`velio.pref.${key}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    try {
      await AsyncStorage.setItem(`velio.pref.${key}`, JSON.stringify(value));
    } catch {
      // ignorar
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(`velio.pref.${key}`);
    } catch {
      // ignorar
    }
  },
};
