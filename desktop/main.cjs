'use strict'
// Aplicativo de Garantias para computador (Windows).
// É uma janela segura que abre o sistema publicado na internet: assim todos os
// computadores recebem as atualizações automaticamente, sem reinstalar.

const { app, BrowserWindow, Menu, dialog, session, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const ID_APP = 'br.com.lojaodostratores.garantias'
const PARTICAO = 'persist:garantias'
const PERMISSOES_LIBERADAS = new Set(['clipboard-sanitized-write', 'fullscreen'])

/** Endereço do sistema, gravado no momento de gerar o instalador (endereco.json). */
function lerEndereco() {
  let url
  // Somente em desenvolvimento/testes (nunca no instalador) o endereço pode vir do ambiente.
  if (!app.isPackaged && process.env.GARANTIAS_URL_TESTE) {
    url = process.env.GARANTIAS_URL_TESTE
  } else {
    url = JSON.parse(fs.readFileSync(path.join(__dirname, 'endereco.json'), 'utf8')).url
  }
  const endereco = new URL(url)
  const local = endereco.hostname === 'localhost' || endereco.hostname === '127.0.0.1'
  if (endereco.protocol !== 'https:' && !(local && endereco.protocol === 'http:')) {
    throw new Error('O endereço do aplicativo precisa começar com https://')
  }
  return endereco
}

let ENDERECO
try {
  ENDERECO = lerEndereco()
} catch (erro) {
  app.whenReady().then(() => {
    dialog.showErrorBox('Garantias', `Instalador configurado incorretamente.\n\n${erro.message}`)
    app.quit()
  })
}

const ORIGEM = ENDERECO ? ENDERECO.origin : null
let janela = null

function doSistema(url) {
  try {
    return new URL(url).origin === ORIGEM
  } catch {
    return false
  }
}

/** Links para fora do sistema (ex.: fotos e PDFs anexados) abrem no navegador padrão. */
function abrirNoNavegador(url) {
  try {
    const u = new URL(url)
    if (u.protocol === 'https:' || u.protocol === 'mailto:') void shell.openExternal(u.href)
  } catch {
    /* endereço inválido: ignora */
  }
}

function mostrarSemConexao() {
  if (!janela || janela.isDestroyed()) return
  void janela.loadFile(path.join(__dirname, 'sem-conexao.html'), { query: { destino: ENDERECO.href } })
}

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

  // Nada de novas janelas: o que for do sistema abre na própria janela; o resto, no navegador.
  wc.setWindowOpenHandler(({ url }) => {
    if (doSistema(url)) void janela.loadURL(url)
    else abrirNoNavegador(url)
    return { action: 'deny' }
  })

  // Impede que a janela navegue para qualquer outro site.
  wc.on('will-navigate', (evento, url) => {
    if (!doSistema(url)) {
      evento.preventDefault()
      abrirNoNavegador(url)
    }
  })
  wc.on('will-redirect', (evento, url) => {
    if (!doSistema(url)) evento.preventDefault()
  })

  // Sem internet ou servidor fora do ar: tela amigável com "Tentar novamente".
  wc.on('did-fail-load', (_evento, codigo, _descricao, url, ehPrincipal) => {
    if (ehPrincipal && codigo !== -3 && doSistema(url)) mostrarSemConexao()
  })

  wc.on('render-process-gone', () => {
    if (!janela.isDestroyed()) void janela.loadURL(ENDERECO.href)
  })

  janela.on('closed', () => {
    janela = null
  })

  void janela.loadURL(ENDERECO.href)
}

function criarMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: 'Aplicativo',
      submenu: [
        { label: 'Página inicial', accelerator: 'Alt+Home', click: () => janela && void janela.loadURL(ENDERECO.href) },
        { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', click: () => janela && janela.webContents.reload() },
        { label: 'Voltar', accelerator: 'Alt+Left', click: () => janela && janela.webContents.navigationHistory.goBack() },
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
              detail: `Versão ${app.getVersion()}\nServidor: ${ORIGEM}`,
            }),
        },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)
}

function protegerSessao() {
  const sessao = session.fromPartition(PARTICAO)
  sessao.setPermissionRequestHandler((_wc, permissao, responder, detalhes) => {
    responder(PERMISSOES_LIBERADAS.has(permissao) && doSistema(detalhes.requestingUrl))
  })
  sessao.setPermissionCheckHandler((_wc, permissao, origem) => PERMISSOES_LIBERADAS.has(permissao) && origem === ORIGEM)
}

if (ENDERECO) {
  // Testes automáticos usam uma pasta de dados própria a cada execução.
  if (!app.isPackaged && process.env.GARANTIAS_URL_TESTE) {
    app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'garantias-teste-')))
  }
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

    // Nenhuma janela pode embutir <webview> nem abrir outras janelas.
    app.on('web-contents-created', (_evento, conteudo) => {
      conteudo.on('will-attach-webview', (e) => e.preventDefault())
    })

    app.whenReady().then(() => {
      protegerSessao()
      criarMenu()
      criarJanela()
    })

    app.on('window-all-closed', () => app.quit())
  }
}
