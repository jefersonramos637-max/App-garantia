// Teste de fumaça do programa JÁ GERADO (o mesmo que vai para o instalador).
// Abre o executável, confere que a tela de login aparece sem violações de segurança
// e, se informado, que a conexão com o Supabase funciona a partir do programa.
//
// Uso: node scripts/testar-programa.mjs <caminho-do-executável> [url-supabase chave-publica]
import { spawn, spawnSync } from 'node:child_process'
import { chromium } from '@playwright/test'

const [executavel, supabaseUrl, chavePublica] = process.argv.slice(2)
if (!executavel) {
  console.error('Informe o caminho do executável.')
  process.exit(2)
}
const PORTA = 9333
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

const argumentos = [`--remote-debugging-port=${PORTA}`]
if (process.platform === 'linux') argumentos.push('--no-sandbox')
const programa = spawn(executavel, argumentos, { stdio: 'ignore' })

function encerrar() {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(programa.pid), '/T', '/F'], { stdio: 'ignore' })
  else programa.kill('SIGKILL')
}

let falhou = false
try {
  let pronto = false
  for (let i = 0; i < 60 && !pronto; i++) {
    try {
      pronto = (await fetch(`http://127.0.0.1:${PORTA}/json/version`)).ok
    } catch {
      await esperar(1000)
    }
  }
  if (!pronto) throw new Error('O programa não abriu em 60 segundos.')

  const navegador = await chromium.connectOverCDP(`http://127.0.0.1:${PORTA}`)
  const contexto = navegador.contexts()[0]
  let pagina = contexto.pages().find((p) => p.url().startsWith('app://'))
  for (let i = 0; i < 30 && !pagina; i++) {
    await esperar(1000)
    pagina = contexto.pages().find((p) => p.url().startsWith('app://'))
  }
  if (!pagina) throw new Error('A janela do sistema não apareceu.')

  const problemas = []
  pagina.on('console', (m) => {
    if (/Content Security Policy|Refused to|Uncaught/i.test(m.text())) problemas.push(m.text())
  })
  pagina.on('pageerror', (e) => problemas.push(`Erro de script: ${e.message}`))
  await pagina.reload()
  await pagina.getByRole('heading', { name: 'Entrar' }).waitFor({ timeout: 30_000 })
  console.log(`OK: tela de login aberta em ${pagina.url()} — título "${await pagina.title()}"`)

  const semNode = await pagina.evaluate(() => typeof window.require === 'undefined' && typeof window.process === 'undefined')
  if (!semNode) throw new Error('A tela tem acesso ao Node.js (não deveria).')
  console.log('OK: telas sem acesso ao computador')

  if (supabaseUrl && chavePublica) {
    const status = await pagina.evaluate(
      async ({ url, chave }) => (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: chave } })).status,
      { url: supabaseUrl.replace(/\/+$/, ''), chave: chavePublica },
    )
    if (status !== 200) throw new Error(`O programa não conseguiu falar com o Supabase (HTTP ${status}).`)
    console.log('OK: conexão com o Supabase a partir do programa')
  }

  await esperar(1000)
  if (problemas.length) throw new Error(`Problemas encontrados:\n- ${problemas.join('\n- ')}`)
  await navegador.close()
  console.log('Programa aprovado no teste.')
} catch (erro) {
  falhou = true
  console.error(`FALHOU: ${erro.message}`)
} finally {
  encerrar()
}
process.exit(falhou ? 1 : 0)
