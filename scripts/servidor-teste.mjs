// Servidor para os testes de ponta a ponta:
// 1) lê as chaves do Supabase LOCAL (supabase status);
// 2) gera um build de produção apontando para ele (pasta dist-teste);
// 3) serve os arquivos com os MESMOS cabeçalhos de segurança de public/_headers
//    (apenas liberando o endereço local do Supabase na CSP).
import { execSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const raiz = new URL('..', import.meta.url).pathname
const status = JSON.parse(execSync('npx supabase status -o json', { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
const apiUrl = status.API_URL
const chave = status.PUBLISHABLE_KEY ?? status.ANON_KEY

execSync('npx vite build --outDir dist-teste --emptyOutDir', {
  cwd: raiz,
  stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: apiUrl, VITE_SUPABASE_ANON_KEY: chave, VITE_INATIVIDADE_MINUTOS: '30' },
})

function lerCabecalhos() {
  const regras = []
  let atual = null
  for (const linha of readFileSync(join(raiz, 'public/_headers'), 'utf8').split('\n')) {
    if (!linha.trim() || linha.trim().startsWith('#')) continue
    if (!/^\s/.test(linha)) {
      atual = { padrao: linha.trim(), cabecalhos: {} }
      regras.push(atual)
    } else if (atual) {
      const i = linha.indexOf(':')
      atual.cabecalhos[linha.slice(0, i).trim()] = linha.slice(i + 1).trim()
    }
  }
  return regras
}

const local = new URL(apiUrl)
const regras = lerCabecalhos()
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' }
const pasta = join(raiz, 'dist-teste')

createServer((req, res) => {
  const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  for (const r of regras) {
    const prefixo = r.padrao.replace(/\*$/, '')
    if (r.padrao === caminho || (r.padrao.endsWith('*') && caminho.startsWith(prefixo))) {
      for (const [k, v] of Object.entries(r.cabecalhos)) {
        let valor = v
        if (k === 'Content-Security-Policy') {
          valor = valor
            .replace("connect-src 'self'", `connect-src 'self' ${local.origin} ws://${local.host}`)
            .replace("img-src 'self'", `img-src 'self' ${local.origin}`)
            .replace('; upgrade-insecure-requests', '')
        }
        if (k !== 'Strict-Transport-Security') res.setHeader(k, valor)
      }
    }
  }
  let arquivo = normalize(join(pasta, caminho))
  if (!arquivo.startsWith(pasta) || !existsSync(arquivo) || statSync(arquivo).isDirectory()) arquivo = join(pasta, 'index.html')
  res.setHeader('Content-Type', tipos[extname(arquivo)] ?? 'application/octet-stream')
  res.end(readFileSync(arquivo))
}).listen(4173, '127.0.0.1', () => console.log('Servidor de teste em http://127.0.0.1:4173'))
