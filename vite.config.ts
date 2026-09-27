import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [
    {
      name: 'development-csp',
      // Vite 개발 서버의 인라인 React refresh 초기화만 허용한다.
      // 배포 HTML에는 원본 CSP 메타 태그를 그대로 유지한다.
      transformIndexHtml(html, context) {
        return context.server
          ? html.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/i, '')
          : html;
      },
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Nuclide Map — 핵종 지도',
        short_name: 'Nuclide Map',
        lang: 'ko',
        description: 'NUBASE2020 · AME2020 핵종 지도',
        theme_color: '#0f766e',
        background_color: '#f3f4f6',
        display: 'standalone',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        maximumFileSizeToCacheInBytes: 5000000,
        runtimeCaching: [
          {
            urlPattern: /\.woff2$/,
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 120 } },
          },
        ],
      },
    }),
  ],
  json: { stringify: true },
  // 데이터 청크(nuclides ≈ 1.2 MB, ame ≈ 0.6 MB)는 의도적으로 크다. 예산은 check:bundle이 gzip으로 잰다.
  build: { chunkSizeWarningLimit: 1500 },
  test: { include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'], environment: 'node' },
});
