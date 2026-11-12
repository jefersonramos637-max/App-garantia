import { defineConfig, devices } from '@playwright/test'

// Testes de ponta a ponta: exigem o Supabase local rodando (npm run db:start).
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './tests/e2e/preparacao.ts',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'sistema', testMatch: /fluxo-completo\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    // O programa para computador é testado depois (usa dados criados pelos testes do sistema).
    { name: 'computador', testMatch: /desktop\.spec\.ts/, dependencies: ['sistema'] },
  ],
  webServer: {
    command: 'node scripts/servidor-teste.mjs',
    url: 'http://127.0.0.1:4173',
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
