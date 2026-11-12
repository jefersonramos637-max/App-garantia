// Testes do aplicativo para computador (Electron). No Linux, rode com xvfb-run (tela virtual).
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { SENHA_NOVA, USUARIOS } from './apoio'

const pasta = join(process.cwd(), 'desktop')
const binario =
  process.platform === 'win32'
    ? join(pasta, 'node_modules', 'electron', 'dist', 'electron.exe')
    : join(pasta, 'node_modules', 'electron', 'dist', 'electron')
const disponivel = existsSync(binario) && (process.platform !== 'linux' || Boolean(process.env.DISPLAY))
// No Linux de testes (root/CI) o sandbox do sistema operacional não está disponível.
const argumentos = process.platform === 'linux' ? ['--no-sandbox', pasta] : [pasta]

function abrir(url: string) {
  return electron.launch({
    executablePath: binario,
    args: argumentos,
    env: { ...process.env, GARANTIAS_URL_TESTE: url },
  })
}

test.describe('Aplicativo para computador', () => {
  test.skip(!disponivel, 'Electron não instalado (cd desktop && npm ci) ou sem tela (use xvfb-run).')

  test('abre o sistema, entra, protege o computador e bloqueia sites externos', async () => {
    const app = await abrir('http://127.0.0.1:4173/')
    try {
      const janela = await app.firstWindow()
      await expect(janela.getByRole('heading', { name: 'Entrar' })).toBeVisible()
      expect(await janela.title()).toContain('Garantias')

      // O site não tem acesso ao Node.js / arquivos do computador.
      const semNode = await janela.evaluate(() => {
        const w = window as unknown as Record<string, unknown>
        return typeof w.require === 'undefined' && typeof w.process === 'undefined' && typeof w.module === 'undefined'
      })
      expect(semNode).toBe(true)

      await janela.getByLabel('E-mail').fill(USUARIOS.operador)
      await janela.getByLabel('Senha', { exact: true }).fill(SENHA_NOVA)
      await janela.getByRole('button', { name: 'Entrar' }).click()
      await expect(janela.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible()

      // Navegação interna funciona normalmente.
      await janela.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Garantias', exact: true }).click()
      await expect(janela.getByRole('heading', { level: 1, name: 'Garantias' })).toBeVisible()

      // Não abre janelas extras.
      await janela.evaluate(() => {
        window.open('https://example.com/', '_blank')
      })
      await janela.waitForTimeout(800)
      expect(app.windows()).toHaveLength(1)

      // Tentativa de levar a janela para outro site é bloqueada (verificado pelo próprio aplicativo).
      await janela.evaluate(() => {
        setTimeout(() => {
          window.location.href = 'https://example.com/'
        }, 0)
      })
      await new Promise((r) => setTimeout(r, 2000))
      const estado = await app.evaluate(async ({ BrowserWindow }) => {
        const wc = BrowserWindow.getAllWindows()[0].webContents
        return {
          url: wc.getURL(),
          titulo: await wc.executeJavaScript('document.querySelector("h1")?.textContent ?? ""'),
        }
      })
      expect(new URL(estado.url).origin).toBe('http://127.0.0.1:4173')
      expect(estado.titulo).toBe('Garantias')
    } finally {
      await app.close()
    }
  })

  test('sem servidor, mostra a tela "Sem conexão"', async () => {
    const app = await abrir('http://127.0.0.1:4999/')
    try {
      const janela = await app.firstWindow()
      await expect(janela.getByRole('heading', { name: 'Sem conexão com o sistema' })).toBeVisible({ timeout: 20_000 })
      await expect(janela.getByRole('link', { name: 'Tentar novamente' })).toBeVisible()
    } finally {
      await app.close()
    }
  })
})
