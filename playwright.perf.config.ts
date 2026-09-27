import { defineConfig, devices } from '@playwright/test';
import config from './playwright.config';

export default defineConfig({
  ...config,
  testIgnore: [],
  testMatch: '**/performance.spec.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  projects: [
    {
      name: 'performance-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        reducedMotion: 'no-preference',
        trace: 'off',
        screenshot: 'off',
      },
    },
  ],
});
