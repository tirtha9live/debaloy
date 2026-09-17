// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// Vite SSR would resolve exceljs to its Node `fs`/`stream` entry, which the
// Cloudflare optimizer cannot keep in deps_ssr. Force the browser bundle.
const exceljsBrowser = fileURLToPath(
  new URL('./node_modules/exceljs/dist/exceljs.min.js', import.meta.url),
);

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    imageService: 'passthrough',
  }),
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        exceljs: exceljsBrowser,
      },
    },
    optimizeDeps: {
      include: ['exceljs'],
    },
    ssr: {
      noExternal: ['xlsx', 'exceljs'],
      optimizeDeps: {
        include: ['exceljs'],
      },
    },
  },
});
