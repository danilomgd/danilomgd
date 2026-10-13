// Empacota a API em um único arquivo ESM. Pacotes do workspace (@velio/*) são incluídos;
// dependências de node_modules ficam externas (inclui nativas como argon2 e pglite).
import { build } from 'esbuild';

const workspaceInternal = {
  name: 'workspace-internal',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path.startsWith('@velio/')) return undefined; // resolve normalmente (bundle)
      return { path: args.path, external: true };
    });
  },
};

await build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/server.mjs',
  sourcemap: true,
  plugins: [workspaceInternal],
  logLevel: 'info',
});
