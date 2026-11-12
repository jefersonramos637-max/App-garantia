'use strict'
// Grava o endereço do sistema que o aplicativo de computador vai abrir.
// Uso: URL_DO_APLICATIVO=https://garantias.pages.dev npm run configurar
const fs = require('node:fs')
const path = require('node:path')

const url = (process.env.URL_DO_APLICATIVO || '').trim().replace(/\/+$/, '')
if (!url) {
  console.error('Defina URL_DO_APLICATIVO (ex.: https://garantias.pages.dev).')
  process.exit(1)
}
let endereco
try {
  endereco = new URL(url)
} catch {
  console.error(`Endereço inválido: ${url}`)
  process.exit(1)
}
const local = endereco.hostname === 'localhost' || endereco.hostname === '127.0.0.1'
if (endereco.protocol !== 'https:' && !(local && endereco.protocol === 'http:')) {
  console.error('O endereço precisa começar com https://')
  process.exit(1)
}
fs.writeFileSync(path.join(__dirname, '..', 'endereco.json'), JSON.stringify({ url: `${endereco.origin}/` }, null, 2) + '\n')
console.log(`Aplicativo configurado para abrir: ${endereco.origin}/`)
