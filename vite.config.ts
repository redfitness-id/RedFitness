import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildSitemap } from './src/seo/routes.mjs';

// ----------------------------------------------------------------------

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'red-fitness-sitemap',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: buildSitemap() });
      },
    },
  ],
  resolve: {
    alias: [
      {
        find: /^~(.+)/,
        replacement: path.join(process.cwd(), 'node_modules/$1'),
      },
      {
        find: /^src(.+)/,
        replacement: path.join(process.cwd(), 'src/$1'),
      },
    ],
  },
  server: {
    port: 8032,
  },
  preview: {
    port: 8032,
  },
});
