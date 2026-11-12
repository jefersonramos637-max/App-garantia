'use strict'
// Prepara o programa para computador:
//  1) lê o endereço e a chave PÚBLICA do Supabase (variáveis de ambiente ou ../.env.production);
//  2) gera as telas do sistema (build do site) dentro de desktop/web;
//  3) grava desktop/configuracao.json (usado pela política de segurança do programa).
const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const raiz = path.join(__dirname, '..', '..')
const pastaDesktop = path.join(__dirname, '..')

function lerEnvProducao() {
  const arquivo = path.join(raiz, '.env.production')
  const valores = {}
  if (!fs.existsSync(arquivo)) return valores
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linha)
    if (m) valores[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return valores
}

function falhar(mensagem) {
  console.error(`\n[ERRO] ${mensagem}\n`)
  process.exit(1)
}

function papelDoJwt(token) {
  const partes = token.split('.')
  if (partes.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8')).role || null
  } catch {
    return null
  }
}

const arquivoEnv = lerEnvProducao()
const url = (process.env.VITE_SUPABASE_URL || arquivoEnv.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
const chave = (process.env.VITE_SUPABASE_ANON_KEY || arquivoEnv.VITE_SUPABASE_ANON_KEY || '').trim()

if (!url || !chave) falhar('Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.production (raiz do projeto).')
let endereco
try {
  endereco = new URL(url)
} catch {
  falhar(`VITE_SUPABASE_URL inválida: ${url}`)
}
const local = endereco.hostname === 'localhost' || endereco.hostname === '127.0.0.1'
if (endereco.protocol !== 'https:' && !(local && endereco.protocol === 'http:')) falhar('VITE_SUPABASE_URL precisa começar com https://')
if (chave.startsWith('sb_secret_') || papelDoJwt(chave) === 'service_role') {
  falhar('Foi informada a chave SECRETA do Supabase. Use somente a chave pública (Publishable key / anon key).')
}

console.log(`Gerando as telas do sistema para ${endereco.origin} ...`)
execSync('npx vite build --outDir desktop/web --emptyOutDir', {
  cwd: raiz,
  stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: endereco.origin, VITE_SUPABASE_ANON_KEY: chave },
})
for (const desnecessario of ['_headers', 'robots.txt']) {
  fs.rmSync(path.join(pastaDesktop, 'web', desnecessario), { force: true })
}
fs.writeFileSync(path.join(pastaDesktop, 'configuracao.json'), JSON.stringify({ supabaseUrl: endereco.origin }, null, 2) + '\n')
console.log('Programa preparado.')
