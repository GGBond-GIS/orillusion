import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// esbuild is a transitive dep via vite — resolve through vite's real package
// path so this works under both npm (flat node_modules) and pnpm (symlinked
// virtual store).
const viteRealPkg = realpathSync(resolve(root, 'node_modules/vite/package.json'));
const requireFromVite = createRequire(viteRealPkg);
const esbuild = requireFromVite('esbuild');

const targets = [
  ['dist/orillusion.es.max.js',  'dist/orillusion.es.js'],
  ['dist/orillusion.umd.max.js', 'dist/orillusion.umd.js'],
];

await Promise.all(targets.map(([entry, out]) => esbuild.build({
  entryPoints: [resolve(root, entry)],
  outfile: resolve(root, out),
  minify: true,
  sourcemap: true,
  logLevel: 'info',
})));
