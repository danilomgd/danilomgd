const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo pnpm: observa os pacotes do workspace e resolve módulos a partir do app e da raiz.
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules'), path.resolve(monorepoRoot, 'node_modules')];

// Módulos que precisam de uma única instância no bundle (contexto React, módulos nativos).
// `packages/ui` declara-os como peer e tem cópia própria em dev; aqui forçamos a cópia do app.
const singletons = new Set([
  'react',
  'react-dom',
  'react-native',
  'react-native-web',
  'react-native-safe-area-context',
  'react-native-screens',
  'react-native-reanimated',
  'react-native-worklets',
  'react-native-gesture-handler',
  'expo',
  'expo-modules-core',
  'expo-font',
  'expo-image-picker',
  'expo-asset',
  'expo-constants',
  '@expo/vector-icons',
  '@tanstack/react-query',
]);

function packageNameOf(moduleName) {
  if (moduleName.startsWith('.') || moduleName.startsWith('/')) return null;
  const parts = moduleName.split('/');
  return moduleName.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pkg = packageNameOf(moduleName);
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  if (pkg && singletons.has(pkg) && !context.originModulePath.startsWith(projectRoot)) {
    return resolve({ ...context, originModulePath: path.join(projectRoot, 'index.js') }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
