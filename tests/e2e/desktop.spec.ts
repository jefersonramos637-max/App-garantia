// Testes do programa para computador (Electron) com o sistema embutido.
// No Linux, rode com xvfb-run (tela virtual). Usa o Supabase local.
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { SENHA_NOVA, USUARIOS, clienteServico, statusSupabase } from './apoio'

const pasta = join(process.cwd(), 'desktop')
const binario =
  process.platform === 'win32'
    ? join(pasta, 'node_modules', 'electron', 'dist', 'electron.exe')
    : join(pasta, 'node_modules', 'electron', 'dist', 'electron')
const disponivel = existsSync(binario) && (process.platform !== 'linux' || Boolean(process.env.DISPLAY))
// No Linux de testes (root/CI) o sandbox do sistema operacional não está disponível.
const argumentos = process.platform === 'linux' ? ['--no-sandbox', pasta] : [pasta]

function abrir() {
  return test.step('abrir o programa', () =>
    electron.launch({ executablePath: binario, args: argumentos, env: { ...process.env, GARANTIAS_TESTE: '1' }, timeout: 30_000 }),
  )
}

/** Fecha o programa; se demorar, encerra o processo para não travar os testes. */
async function fechar(app: ElectronApplication) {
  await test.step('fechar o programa', async () => {
    const fechou = await Promise.race([
      app.close().then(() => true),
      new Promise<boolean>((ok) => setTimeout(() => ok(false), 10_000)),
    ])
    if (!fechou) app.process().kill('SIGKILL')
  })
}

async function entrar(janela: Page, email: string) {
  await test.step(`login ${email}`, async () => {
    await janela.getByLabel('E-mail').fill(email)
    await janela.getByLabel('Senha', { exact: true }).fill(SENHA_NOVA)
    await janela.getByRole('button', { name: 'Entrar' }).click()
    await expect(janela.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible()
  })
}

test.describe('Programa para computador', () => {
  test.skip(!disponivel, 'Electron não instalado (cd desktop && npm ci) ou sem tela (use xvfb-run).')

  test.beforeAll(() => {
    // Gera as telas embutidas apontando para o Supabase local (mesmo processo do instalador).
    const s = statusSupabase()
    execSync('node desktop/scripts/preparar.cjs', {
      stdio: 'ignore',
      env: { ...process.env, VITE_SUPABASE_URL: s.API_URL, VITE_SUPABASE_ANON_KEY: s.PUBLISHABLE_KEY ?? s.ANON_KEY },
    })
  })

  test('abre o sistema embutido, protege o computador e bloqueia sites externos', async () => {
    test.setTimeout(90_000)
    const app = await abrir()
    try {
      const janela = await test.step('primeira janela', () => app.firstWindow())
      await expect(janela.getByRole('heading', { name: 'Entrar' })).toBeVisible()
      expect(janela.url()).toBe('app://garantias/')
      expect(await janela.title()).toContain('Garantias')

      // O site não tem acesso ao Node.js / arquivos do computador.
      const semNode = await janela.evaluate(() => {
        const w = window as unknown as Record<string, unknown>
        return typeof w.require === 'undefined' && typeof w.process === 'undefined' && typeof w.module === 'undefined'
      })
      expect(semNode).toBe(true)

      // Não é possível ler arquivos fora da pasta das telas, e arquivos inexistentes dão 404.
      const respostas = await janela.evaluate(async () => {
        const status = async (u: string) => (await fetch(u)).status
        return {
          fuga: await status('app://garantias/%2e%2e/main.cjs'),
          fuga2: await status('app://garantias/..%2fconfiguracao.json'),
          inexistente: await status('app://garantias/assets/nao-existe.js'),
          rota: await status('app://garantias/garantias/123'),
        }
      })
      // "%2e%2e" já é neutralizado pelo navegador interno (vira /main.cjs dentro da pasta, que não existe: 404);
      // "..%2f" chega ao programa e é bloqueado (403). Em nenhum caso o arquivo de fora é entregue.
      expect(respostas).toEqual({ fuga: 404, fuga2: 403, inexistente: 404, rota: 200 })

      await entrar(janela, USUARIOS.operador)

      // Configurações → Atualização: mostra a versão e o botão (fora do instalador, a atualização não é suportada).
      await janela.goto('app://garantias/configuracoes/atualizacao')
      await expect(janela.getByText(/Versão instalada:/)).toBeVisible()
      await expect(janela.getByText('A atualização automática funciona no programa instalado no Windows.')).toBeVisible()
      await expect(janela.getByRole('button', { name: 'Verificar atualização' })).toBeDisabled()

      // Rotas internas funcionam, inclusive ao recarregar a página.
      await janela.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Garantias', exact: true }).click()
      await expect(janela.getByRole('heading', { level: 1, name: 'Garantias' })).toBeVisible()
      await janela.reload()
      await expect(janela.getByRole('heading', { level: 1, name: 'Garantias' })).toBeVisible()
      expect(janela.url()).toBe('app://garantias/garantias')

      // Não abre janelas extras.
      await janela.evaluate(() => {
        window.open('https://example.com/', '_blank')
      })
      await janela.waitForTimeout(800)
      expect(app.windows()).toHaveLength(1)

      // Tentativa de levar a janela para outro site é bloqueada (verificado pelo próprio programa).
      await janela.evaluate(() => {
        setTimeout(() => {
          window.location.href = 'https://example.com/'
        }, 0)
      })
      await new Promise((r) => setTimeout(r, 2000))
      const estado = await app.evaluate(async ({ BrowserWindow }) => {
        const wc = BrowserWindow.getAllWindows()[0].webContents
        return { url: wc.getURL(), titulo: await wc.executeJavaScript('document.querySelector("h1")?.textContent ?? ""') }
      })
      expect(estado.url).toBe('app://garantias/garantias')
      expect(estado.titulo).toBe('Garantias')

      // Os dois links externos foram encaminhados ao navegador padrão.
      const externos = await app.evaluate(() => (globalThis as unknown as { __linksExternosNoTeste: string[] }).__linksExternosNoTeste)
      expect(externos).toEqual(['https://example.com/', 'https://example.com/'])
    } finally {
      await fechar(app)
    }
  })

  test('mostra na hora as garantias registradas por outra pessoa', async () => {
    test.setTimeout(90_000)
    const svc = clienteServico()
    const ids: { cliente?: number; produto?: number; marca?: number; garantia?: number } = {}
    const app = await abrir()
    try {
      const janela = await app.firstWindow()
      await entrar(janela, USUARIOS.operador)
      await janela.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Garantias', exact: true }).click()
      await expect(janela.getByRole('heading', { level: 1, name: 'Garantias' })).toBeVisible()
      await expect(janela.locator('.tabela-container, .vazio').first()).toBeVisible()
      await janela.waitForTimeout(1500) // tempo para conectar o canal de tempo real

      await test.step('outra pessoa registra uma garantia', async () => {
        const c = await svc.from('clientes').insert({ codigo: 'DESK-1', nome: 'CLIENTE DO TESTE DESKTOP' }).select('id').single()
        const m = await svc.from('marcas').insert({ nome: 'MARCA TESTE DESKTOP' }).select('id').single()
        const p = await svc.from('produtos').insert({ codigo: 'DESK-P', descricao: 'PEÇA TESTE DESKTOP' }).select('id').single()
        if (c.error || m.error || p.error) throw c.error ?? m.error ?? p.error
        ids.cliente = c.data.id
        ids.marca = m.data.id
        ids.produto = p.data.id
        const pm = await svc.from('produto_marcas').insert({ produto_id: p.data.id, marca_id: m.data.id })
        if (pm.error) throw pm.error
        const g = await svc
          .from('garantias')
          .insert({ empresa_id: 1, cliente_id: c.data.id, defeito: 'Teste do programa' })
          .select('id')
          .single()
        if (g.error) throw g.error
        const it = await svc
          .from('garantia_itens')
          .insert({ garantia_id: g.data.id, ordem: 1, produto_id: p.data.id, marca_id: m.data.id, origem: 'NACIONAL', quantidade: 1 })
        if (it.error) throw it.error
        ids.garantia = g.data.id
      })

      await expect(janela.getByText('CLIENTE DO TESTE DESKTOP')).toBeVisible({ timeout: 20_000 })
    } finally {
      await fechar(app)
      // Limpa os dados criados para não interferir nos outros testes.
      if (ids.garantia) await svc.from('garantias').delete().eq('id', ids.garantia)
      if (ids.produto) await svc.from('produtos').delete().eq('id', ids.produto)
      if (ids.marca) await svc.from('marcas').delete().eq('id', ids.marca)
      if (ids.cliente) await svc.from('clientes').delete().eq('id', ids.cliente)
    }
  })
})
