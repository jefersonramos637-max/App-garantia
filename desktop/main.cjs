'use strict'
// Aplicativo de Garantias para computador (Windows).
//
// O sistema (telas) vai embutido no programa e é servido pelo endereço interno
// app://garantias/. Os dados ficam no Supabase (internet). O programa se atualiza
// sozinho a partir das versões publicadas no GitHub (Releases).

const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, session, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const ID_APP = 'br.com.lojaodostratores.garantias'
const PARTICAO = 'persist:garantias'
const ESQUEMA = 'app'
const HOST = 'garantias'
const INICIO = `${ESQUEMA}://${HOST}/`
const PERMISSOES_LIBERADAS = new Set(['clipboard-sanitized-write', 'fullscreen'])

// Modo de testes automáticos (nunca no instalador): pasta de dados temporária e links externos registrados.
const MODO_TESTE = !app.isPackaged && process.env.GARANTIAS_TESTE === '1'

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
}

// O endereço interno precisa ser registrado antes de o aplicativo iniciar.
protocol.registerSchemesAsPrivileged([
  { scheme: ESQUEMA, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
])

/** Pasta com as telas do sistema e endereço do Supabase (gravados ao gerar o instalador). */
function lerConfiguracao() {
  const pastaWeb = path.join(__dirname, 'web')
  const supabaseUrl = JSON.parse(fs.readFileSync(path.join(__dirname, 'configuracao.json'), 'utf8')).supabaseUrl
  const supabase = new URL(supabaseUrl)
  const local = supabase.hostname === 'localhost' || supabase.hostname === '127.0.0.1'
  if (supabase.protocol !== 'https:' && !(local && supabase.protocol === 'http:')) {
    throw new Error('O endereço do Supabase precisa começar com https://')
  }
  if (!fs.existsSync(path.join(pastaWeb, 'index.html'))) {
    throw new Error('As telas do sistema não foram encontradas no programa.')
  }
  return { pastaWeb: path.resolve(pastaWeb), supabase }
}

let CONFIG
try {
  CONFIG = lerConfiguracao()
} catch (erro) {
  app.whenReady().then(() => {
    dialog.showErrorBox('Garantias', `O programa foi gerado com uma configuração inválida.\n\n${erro.message}`)
    app.quit()
  })
}

/** Política de segurança: só carrega o próprio programa e só conversa com o Supabase configurado. */
function politicaDeSeguranca() {
  const origem = CONFIG.supabase.origin
  const ws = `${CONFIG.supabase.protocol === 'https:' ? 'wss' : 'ws'}://${CONFIG.supabase.host}`
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    `img-src 'self' data: blob: ${origem}`,
    `connect-src 'self' ${origem} ${ws}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
  ].join('; ')
}

function ehDoPrograma(url) {
  try {
    const u = new URL(url)
    return u.protocol === `${ESQUEMA}:` && u.host === HOST
  } catch {
    return false
  }
}

// Nos testes automáticos os links externos são apenas registrados (não abre o navegador).
const linksExternosNoTeste = []
if (MODO_TESTE) globalThis.__linksExternosNoTeste = linksExternosNoTeste

/** Links para fora do programa (ex.: fotos e PDFs anexados) abrem no navegador padrão. */
function abrirNoNavegador(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'mailto:') return
    if (MODO_TESTE) linksExternosNoTeste.push(u.href)
    else void shell.openExternal(u.href)
  } catch {
    /* endereço inválido: ignora */
  }
}

/** Entrega os arquivos das telas (com volta para index.html nas rotas do sistema). */
function registrarEnderecoInterno(sessao) {
  const csp = politicaDeSeguranca()
  const pasta = CONFIG.pastaWeb
  sessao.protocol.handle(ESQUEMA, async (requisicao) => {
    const u = new URL(requisicao.url)
    if (u.host !== HOST || requisicao.method !== 'GET') return new Response('Não permitido', { status: 403 })

    let relativo
    try {
      relativo = decodeURIComponent(u.pathname)
    } catch {
      return new Response('Endereço inválido', { status: 400 })
    }
    let arquivo = path.normalize(path.join(pasta, relativo))
    if (arquivo !== pasta && !arquivo.startsWith(pasta + path.sep)) {
      return new Response('Não permitido', { status: 403 })
    }

    let ehArquivo = false
    try {
      ehArquivo = fs.statSync(arquivo).isFile()
    } catch {
      ehArquivo = false
    }
    if (!ehArquivo) {
      // Rotas do sistema (ex.: /garantias/12) abrem o index.html; arquivos inexistentes dão 404.
      if (path.extname(relativo)) return new Response('Não encontrado', { status: 404 })
      arquivo = path.join(pasta, 'index.html')
    }

    const conteudo = await fs.promises.readFile(arquivo)
    return new Response(conteudo, {
      status: 200,
      headers: {
        'Content-Type': TIPOS[path.extname(arquivo).toLowerCase()] || 'application/octet-stream',
        'Content-Security-Policy': csp,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-cache',
      },
    })
  })
}

function protegerSessao(sessao) {
  sessao.setPermissionRequestHandler((_wc, permissao, responder, detalhes) => {
    responder(PERMISSOES_LIBERADAS.has(permissao) && ehDoPrograma(detalhes.requestingUrl))
  })
  sessao.setPermissionCheckHandler((_wc, permissao, origem) => PERMISSOES_LIBERADAS.has(permissao) && ehDoPrograma(origem))
}

let janela = null

function criarJanela() {
  janela = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Garantias',
    backgroundColor: '#f6f7f6',
    icon: path.join(__dirname, 'icone.png'),
    autoHideMenuBar: true,
    webPreferences: {
      partition: PARTICAO,
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true,
      devTools: !app.isPackaged,
    },
  })

  janela.once('ready-to-show', () => {
    janela.maximize()
    janela.show()
  })

  const wc = janela.webContents

  // Nada de novas janelas: o que é do programa abre na própria janela; o resto, no navegador.
  wc.setWindowOpenHandler(({ url }) => {
    if (ehDoPrograma(url)) void janela.loadURL(url)
    else abrirNoNavegador(url)
    return { action: 'deny' }
  })

  // Impede que a janela navegue para qualquer site.
  wc.on('will-navigate', (evento, url) => {
    if (!ehDoPrograma(url)) {
      evento.preventDefault()
      abrirNoNavegador(url)
    }
  })
  wc.on('will-redirect', (evento, url) => {
    if (!ehDoPrograma(url)) evento.preventDefault()
  })

  wc.on('render-process-gone', () => {
    if (!janela.isDestroyed()) void janela.loadURL(INICIO)
  })

  janela.on('closed', () => {
    janela = null
  })

  void janela.loadURL(INICIO)
}

function criarMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: 'Aplicativo',
      submenu: [
        { label: 'Página inicial', accelerator: 'Alt+Home', click: () => janela && void janela.loadURL(INICIO) },
        { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', click: () => janela && janela.webContents.reload() },
        { label: 'Voltar', accelerator: 'Alt+Left', click: () => janela && janela.webContents.navigationHistory.goBack() },
        { type: 'separator' },
        { label: 'Procurar atualização', click: () => verificarAtualizacao('menu') },
        { type: 'separator' },
        { label: 'Sair', accelerator: 'Alt+F4', role: 'quit' },
      ],
    },
    {
      label: 'Exibir',
      submenu: [
        { label: 'Aumentar zoom', role: 'zoomIn' },
        { label: 'Diminuir zoom', role: 'zoomOut' },
        { label: 'Tamanho normal', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Tela cheia', role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Sobre',
          click: () =>
            dialog.showMessageBox(janela, {
              type: 'info',
              title: 'Sobre',
              message: 'Garantias — Lojão dos Tratores / LL Tratores',
              detail: `Versão ${app.getVersion()}\nServidor de dados: ${CONFIG.supabase.host}`,
            }),
        },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)
}

// ---------------------------------------------------------------------------
// Atualização automática (somente no programa instalado no Windows)
// ---------------------------------------------------------------------------
let atualizador = null
let origemVerificacao = 'auto' // 'auto' | 'menu' | 'pagina'
let versaoJaOferecida = null
let baixandoPorAviso = false

/** Estado mostrado na tela Configurações → Atualização. */
const estadoAtualizacao = { suportado: false, fase: 'ocioso', versaoAtual: app.getVersion(), versaoNova: null, percentual: 0, mensagem: null }

function definirEstado(mudancas) {
  Object.assign(estadoAtualizacao, mudancas)
  if (janela && !janela.isDestroyed()) janela.webContents.send('atualizacao:estado', estadoAtualizacao)
}

function marcarProgresso(valor, titulo) {
  if (janela && !janela.isDestroyed()) {
    janela.setProgressBar(valor)
    janela.setTitle(titulo)
  }
}

function configurarAtualizacao() {
  if (!app.isPackaged || process.platform !== 'win32') return
  try {
    atualizador = require('electron-updater').autoUpdater
  } catch {
    return
  }
  estadoAtualizacao.suportado = true
  // Nada é baixado sem o usuário concordar.
  atualizador.autoDownload = false
  atualizador.autoInstallOnAppQuit = true

  atualizador.on('checking-for-update', () => definirEstado({ fase: 'verificando', mensagem: null }))

  // O aviso "Nova versão disponível" é uma faixa dentro do próprio programa (AvisoAtualizacao).
  atualizador.on('update-available', (info) => definirEstado({ fase: 'disponivel', versaoNova: info.version }))

  atualizador.on('download-progress', (p) => {
    definirEstado({ fase: 'baixando', percentual: Math.round(p.percent) })
    marcarProgresso(p.percent / 100, `Garantias — baixando atualização ${Math.round(p.percent)}%`)
  })

  atualizador.on('update-downloaded', () => {
    definirEstado({ fase: 'pronto', percentual: 100 })
    marcarProgresso(-1, 'Garantias')
    // Instala e reabre o programa já atualizado.
    setImmediate(() => atualizador.quitAndInstall(false, true))
  })

  atualizador.on('update-not-available', () => {
    definirEstado({ fase: 'atualizado', versaoNova: null })
    if (origemVerificacao === 'menu') {
      void dialog.showMessageBox(janela, { type: 'info', title: 'Atualização', message: 'Você já está usando a versão mais recente.' })
    }
  })

  atualizador.on('error', (erro) => {
    console.warn('Atualização automática:', erro && erro.message)
    marcarProgresso(-1, 'Garantias')
    definirEstado({ fase: 'erro', mensagem: 'Não foi possível falar com o servidor de atualizações. Verifique a internet e tente de novo.' })
    if (origemVerificacao === 'menu' || baixandoPorAviso) {
      baixandoPorAviso = false
      void dialog.showMessageBox(janela, {
        type: 'warning',
        title: 'Atualização',
        message: 'Não foi possível atualizar agora. Verifique a internet e tente mais tarde.',
      })
    }
  })

  verificarAtualizacao('auto')
  setInterval(() => verificarAtualizacao('auto'), 60 * 60 * 1000)
}

function verificarAtualizacao(origem) {
  if (!atualizador) {
    if (origem === 'menu') {
      void dialog.showMessageBox(janela, {
        type: 'info',
        title: 'Atualização',
        message: 'A atualização automática funciona no programa instalado no Windows.',
      })
    }
    return
  }
  if (estadoAtualizacao.fase === 'baixando' || estadoAtualizacao.fase === 'pronto') return
  origemVerificacao = origem
  atualizador.checkForUpdates().catch(() => {
    /* tratado no evento "error" */
  })
}

function baixarAtualizacao() {
  if (!atualizador || estadoAtualizacao.fase === 'baixando' || estadoAtualizacao.fase === 'pronto') return
  definirEstado({ fase: 'baixando', percentual: 0 })
  marcarProgresso(0, 'Garantias — baixando atualização…')
  atualizador.downloadUpdate().catch(() => {
    /* tratado no evento "error" */
  })
}

/** Somente as telas do próprio programa podem pedir atualização. */
function registrarPonteDeAtualizacao() {
  const permitido = (evento) => ehDoPrograma(evento.senderFrame ? evento.senderFrame.url : '')
  ipcMain.handle('atualizacao:estado', (evento) => (permitido(evento) ? estadoAtualizacao : null))
  ipcMain.handle('atualizacao:verificar', (evento) => {
    if (!permitido(evento)) return null
    verificarAtualizacao('pagina')
    return estadoAtualizacao
  })
  ipcMain.handle('atualizacao:instalar', (evento) => {
    if (!permitido(evento)) return null
    if (estadoAtualizacao.fase === 'disponivel') baixarAtualizacao()
    return estadoAtualizacao
  })
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------
if (CONFIG) {
  // Testes automáticos usam uma pasta de dados própria a cada execução.
  if (MODO_TESTE) app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'garantias-teste-')))
  app.setAppUserModelId(ID_APP)
  // Isolamento máximo de todas as telas. (A opção --no-sandbox só é usada nos testes
  // automáticos em Linux; o instalador do Windows nunca a utiliza.)
  if (!app.commandLine.hasSwitch('no-sandbox')) app.enableSandbox()

  if (!app.requestSingleInstanceLock()) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      if (janela) {
        if (janela.isMinimized()) janela.restore()
        janela.focus()
      }
    })

    // Nenhuma janela pode embutir <webview>.
    app.on('web-contents-created', (_evento, conteudo) => {
      conteudo.on('will-attach-webview', (e) => e.preventDefault())
    })

    app.whenReady().then(() => {
      const sessao = session.fromPartition(PARTICAO)
      registrarEnderecoInterno(sessao)
      protegerSessao(sessao)
      registrarPonteDeAtualizacao()
      criarMenu()
      criarJanela()
      configurarAtualizacao()
    })

    app.on('window-all-closed', () => app.quit())
  }
}
