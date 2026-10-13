import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type AppRole = 'customer' | 'provider';

interface Extra {
  appRole?: AppRole;
  apiUrl?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/** Papel do app, fixado em build por `EXPO_PUBLIC_APP_ROLE` (ADR-010). */
export const APP_ROLE: AppRole =
  (process.env.EXPO_PUBLIC_APP_ROLE as AppRole | undefined) ?? extra.appRole ?? 'customer';

export const IS_PROVIDER_APP = APP_ROLE === 'provider';

export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? 'http://localhost:3333';

export const UPLOAD_URL: string | undefined = process.env.EXPO_PUBLIC_UPLOAD_URL || undefined;

export const APP_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';

export const APP_NAME = IS_PROVIDER_APP ? 'VÉLIO Pro' : 'VÉLIO';

export const IS_WEB = Platform.OS === 'web';

export const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
