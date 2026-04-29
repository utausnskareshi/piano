import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/piano/',
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0
  },
  worker: {
    format: 'es'
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-maskable-512.png',
        'icons/apple-touch-icon.png',
        'wasm/synth.wasm'
      ],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,wasm}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/piano/index.html'
      },
      manifest: {
        name: 'Piano - 3オクターブシンセ',
        short_name: 'Piano',
        description: '3オクターブをサポートするシンセサイザーPWA。100音色・50曲収録。',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/piano/',
        scope: '/piano/',
        lang: 'ja',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
});
