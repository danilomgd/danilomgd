import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dois produtos a partir de um código (ADR-010).
 * EXPO_PUBLIC_APP_ROLE=customer → "VÉLIO" (br.com.velio.app)
 * EXPO_PUBLIC_APP_ROLE=provider → "VÉLIO Pro" (br.com.velio.pro)
 */
export type AppRole = 'customer' | 'provider';

const role: AppRole = process.env.EXPO_PUBLIC_APP_ROLE === 'provider' ? 'provider' : 'customer';
const isProvider = role === 'provider';

const variant = {
  customer: {
    name: 'VÉLIO',
    slug: 'velio',
    scheme: 'velio',
    bundleId: 'br.com.velio.app',
    icon: './assets/customer/icon.png',
    adaptiveIcon: './assets/customer/adaptive-icon.png',
    splash: './assets/customer/splash.png',
    splashBg: '#215468',
    universalHost: 'app.velio.com.br',
  },
  provider: {
    name: 'VÉLIO Pro',
    slug: 'velio-pro',
    scheme: 'velio-pro',
    bundleId: 'br.com.velio.pro',
    icon: './assets/provider/icon.png',
    adaptiveIcon: './assets/provider/adaptive-icon.png',
    splash: './assets/provider/splash.png',
    splashBg: '#0B1E26',
    universalHost: 'pro.velio.com.br',
  },
}[role];

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333';
const easProjectId = process.env.EAS_PROJECT_ID;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: variant.name,
  slug: variant.slug,
  version: '0.1.0',
  orientation: 'portrait',
  icon: variant.icon,
  scheme: variant.scheme,
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: variant.bundleId,
    supportsTablet: false,
    associatedDomains: [`applinks:${variant.universalHost}`],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription: isProvider
        ? 'Usamos sua localização para enviar ofertas próximas e mostrar seu trajeto ao cliente durante o atendimento.'
        : 'Usamos sua localização para mostrar serviços disponíveis perto de você.',
      NSLocationAlwaysAndWhenInUseUsageDescription: isProvider
        ? 'Com o app em segundo plano, continuamos informando sua posição ao cliente apenas durante um atendimento ativo.'
        : undefined,
      NSCameraUsageDescription: isProvider
        ? 'A câmera registra fotos antes e depois do serviço e lê códigos de custódia.'
        : 'A câmera permite anexar fotos ao seu pedido.',
      NSPhotoLibraryUsageDescription: 'Para anexar fotos da galeria.',
      UIBackgroundModes: isProvider ? ['location', 'remote-notification'] : ['remote-notification'],
    },
  },
  android: {
    package: variant.bundleId,
    adaptiveIcon: { foregroundImage: variant.adaptiveIcon, backgroundColor: variant.splashBg },
    permissions: isProvider
      ? [
          'ACCESS_COARSE_LOCATION',
          'ACCESS_FINE_LOCATION',
          'ACCESS_BACKGROUND_LOCATION',
          'FOREGROUND_SERVICE',
          'FOREGROUND_SERVICE_LOCATION',
          'CAMERA',
          'VIBRATE',
          'POST_NOTIFICATIONS',
        ]
      : ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA', 'VIBRATE', 'POST_NOTIFICATIONS'],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: variant.universalHost, pathPrefix: '/' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
    config: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY
      ? { googleMaps: { apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY } }
      : undefined,
  },
  web: { bundler: 'metro', output: 'single', favicon: variant.icon },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission: isProvider
          ? 'Informamos sua posição ao cliente apenas durante um atendimento ativo.'
          : undefined,
        locationWhenInUsePermission:
          'Usamos sua localização para mostrar serviços e profissionais perto de você.',
        isAndroidBackgroundLocationEnabled: isProvider,
      },
    ],
    [
      'expo-notifications',
      {
        icon: variant.adaptiveIcon,
        color: variant.splashBg,
        defaultChannel: isProvider ? 'offers' : 'orders',
      },
    ],
    [
      'expo-image-picker',
      { photosPermission: 'Para anexar fotos.', cameraPermission: 'Para registrar fotos do serviço.' },
    ],
    ['expo-camera', { cameraPermission: 'Para ler códigos de custódia e registrar fotos.' }],
    [
      'expo-splash-screen',
      { image: variant.splash, imageWidth: 200, resizeMode: 'contain', backgroundColor: variant.splashBg },
    ],
  ],
  experiments: { typedRoutes: false },
  extra: {
    appRole: role,
    apiUrl,
    eas: easProjectId ? { projectId: easProjectId } : undefined,
  },
});
