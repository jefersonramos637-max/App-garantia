import { execSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

export const SENHA_INICIAL = 'Provisoria2026'
export const SENHA_NOVA = 'SenhaNovaForte9'

export const USUARIOS = {
  admin: 'admin@teste.local',
  operador: 'operador@teste.local',
  consulta: 'consulta@teste.local',
  pendente: 'pendente@teste.local',
} as const

let statusCache: { API_URL: string; PUBLISHABLE_KEY?: string; ANON_KEY: string; SECRET_KEY?: string; SERVICE_ROLE_KEY: string } | null = null

export function statusSupabase() {
  if (!statusCache) {
    statusCache = JSON.parse(
      execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
    )
  }
  return statusCache!
}

export function clienteServico() {
  const s = statusSupabase()
  return createClient(s.API_URL, s.SECRET_KEY ?? s.SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

/** Código TOTP (RFC 6238) a partir da chave mostrada na tela de 2 etapas. */
export function codigoTotp(segredoBase32: string, instante = Date.now()): string {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of segredoBase32.replace(/=+$/, '').toUpperCase()) bits += alfabeto.indexOf(c).toString(2).padStart(5, '0')
  const chave = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)))
  const contador = Buffer.alloc(8)
  contador.writeBigUInt64BE(BigInt(Math.floor(instante / 1000 / 30)))
  const h = createHmac('sha1', chave).update(contador).digest()
  const o = h[h.length - 1] & 0xf
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0')
}

/** Falha o teste se o navegador acusar violação da política de segurança (CSP) ou erro de script. */
export function vigiarConsole(page: Page): string[] {
  const problemas: string[] = []
  page.on('console', (msg) => {
    const texto = msg.text()
    if (/Content Security Policy|Refused to/i.test(texto)) problemas.push(texto)
  })
  page.on('pageerror', (erro) => problemas.push(`pageerror: ${erro.message}`))
  return problemas
}

export async function entrar(page: Page, email: string, senha: string) {
  await page.goto('/')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(senha)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

export async function entrarNoPainel(page: Page, email: string, senha: string) {
  await entrar(page, email, senha)
  await expect(page.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible()
}

export async function sair(page: Page) {
  const menu = page.getByRole('button', { name: 'Abrir menu' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: 'Sair', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
}
