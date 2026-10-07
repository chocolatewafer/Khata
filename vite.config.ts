import { copyFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { build, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
// "/" for local and custom-domain hosting; the GitHub Pages workflow sets BASE=/Khata/
const base = process.env.BASE ?? '/';
// absolute address of the deployed app, used by link-preview tags (crawlers need full URLs); falls back to the base path
const siteUrl = (process.env.SITE_URL ?? base).replace(/\/?$/, '/');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

/** Builds src/sw.ts into dist/sw.js with the list of files to precache, so the app works offline from first install. */
function serviceWorker(): Plugin {
  let files: string[] = [];
  let outDir = 'dist';
  return {
    name: 'khata-sw',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    generateBundle(_, bundle) {
      files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
    },
    async closeBundle() {
      const pub = walk('public').map((f) => f.slice('public'.length).replace(/\\/g, '/').replace(/^\//, ''));
      // only Latin font subsets up front; other scripts load (and get cached) if a page ever needs them
      // host config and the link-preview image are for servers and crawlers, not needed offline
      const hostConfig = ['_redirects', '_headers', 'social-card.png'];
      const wanted = (f: string) => f !== 'index.html' && f !== '404.html' && f !== 'sw.js' && !hostConfig.includes(f) && (!f.endsWith('.woff2') || /-latin(-ext)?-/.test(f));
      const precache = [base, ...[...files, ...pub].filter(wanted).map((f) => `${base}${f}`)];
      // GitHub Pages has no SPA rewrites; it serves 404.html for unknown paths, so make that the app too
      copyFileSync(join(outDir, 'index.html'), join(outDir, '404.html'));
      await build({
        configFile: false,
        logLevel: 'warn',
        define: { __PRECACHE__: JSON.stringify(precache), __VERSION__: JSON.stringify(`${pkg.version}-${Date.now()}`) },
        build: {
          outDir,
          emptyOutDir: false,
          copyPublicDir: false,
          lib: { entry: 'src/sw.ts', formats: ['iife'], name: 'khataSw', fileName: () => 'sw.js' },
        },
      });
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    react(),
    serviceWorker(),
    { name: 'khata-site-url', transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl) },
  ],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: { environment: 'node' },
});
