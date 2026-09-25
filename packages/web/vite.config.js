import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

// Served from the domain root in development and from /<repo>/ on GitHub Pages, so the
// base has to reach the manifest, the service worker scope, and the router as well as
// the asset URLs.
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'],
      manifest: {
        name: 'Agora: DFW city council meetings',
        short_name: 'Agora',
        description: 'Find every city council meeting in Dallas-Fort Worth, learn how to sign up to speak, and get matched to the issues you care about.',
        theme_color: '#1a4f6b',
        background_color: '#f2efe7',
        display: 'standalone',
        start_url: base,
        scope: base,
        lang: 'en-US',
        categories: ['government', 'education', 'news'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'For you', url: `${base}for-you`, description: 'Meetings matched to your interests' },
          { name: 'Map', url: `${base}map`, description: 'Every DFW council meeting on a map' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // The vision models are about 10 MB and only needed by Rehearse, so they are
        // fetched on first use and then kept, rather than precached for everyone.
        globIgnores: ['models/**'],
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/models/'),
            handler: 'CacheFirst',
            options: { cacheName: 'vision-models', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'osm-tiles', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 14 } },
          },
          {
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'osm-tiles', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 14 } },
          },
          {
            // Only reference data is cached offline. Geocode, news, and AI responses can carry a
            // typed address or a name, so they are never written to Cache Storage.
            urlPattern: ({ url }) => /^\/api\/(cities|meetings|stats|learn|topics|health)(\/|$)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: { cacheName: 'api', networkTimeoutSeconds: 5, expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@data': path.join(repoRoot, 'data') },
  },
  server: {
    port: 5173,
    fs: { allow: [repoRoot] },
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          leaflet: ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
});
