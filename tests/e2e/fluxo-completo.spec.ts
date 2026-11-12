import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import writeXlsxFile from 'write-excel-file/node'
import { readSheet } from 'read-excel-file/node'
import { SENHA_INICIAL, SENHA_NOVA, USUARIOS, codigoTotp, entrar, entrarNoPainel, sair, vigiarConsole } from './apoio'

const SENHA_ADMIN = 'AdminNovaSenha7'

async function novaPagina(browser: Browser, opcoes = {}) {
  const contexto = await browser.newContext(opcoes)
  const page = await contexto.newPage()
  const problemas = vigiarConsole(page)
  return { contexto, page, problemas }
}

async function irPeloMenu(page: Page, nome: string) {
  await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: nome, exact: true }).click()
}

test.describe.serial('Aplicativo de garantias', () => {
  test('login recusa senha errada com mensagem em português', async ({ page }) => {
    const problemas = vigiarConsole(page)
    await entrar(page, USUARIOS.operador, 'SenhaErrada123')
    await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.')
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
    expect(problemas).toEqual([])
  })

  test('usuário ainda não liberado não acessa nada', async ({ page }) => {
    await entrar(page, USUARIOS.pendente, SENHA_NOVA)
    await expect(page.getByRole('heading', { name: 'Acesso aguardando liberação' })).toBeVisible()
    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
  })

  test('administrador é obrigado a trocar a senha provisória no primeiro acesso', async ({ page }) => {
    const problemas = vigiarConsole(page)
    await entrar(page, USUARIOS.admin, SENHA_INICIAL)
    await expect(page.getByRole('heading', { name: 'Crie sua senha' })).toBeVisible()
    await page.getByLabel('Nova senha', { exact: true }).fill('fraca')
    await page.getByLabel('Confirme a nova senha').fill('fraca')
    await page.getByRole('button', { name: 'Salvar nova senha' }).click()
    await expect(page.getByRole('alert')).toContainText('não atende')
    await page.getByLabel('Nova senha', { exact: true }).fill(SENHA_ADMIN)
    await page.getByLabel('Confirme a nova senha').fill(SENHA_ADMIN)
    await page.getByRole('button', { name: 'Salvar nova senha' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Olá, Jeferson!' })).toBeVisible()
    expect(problemas).toEqual([])
  })

  test('administrador importa produtos (Excel) e clientes (CSV do Excel)', async ({ page }) => {
    const problemas = vigiarConsole(page)
    await entrarNoPainel(page, USUARIOS.admin, SENHA_ADMIN)
    await irPeloMenu(page, 'Importar listas')

    const xlsx = await writeXlsxFile([
      ['RELATÓRIO DE PEÇAS'],
      ['Código', 'Descrição', 'Marcas', 'Origem', 'Referência fabricante'],
      ['P0001', 'FILTRO DE ÓLEO DO MOTOR', 'VALTRA, MASSEY FERGUSON', 'NACIONAL', ''],
      ['P0001', 'FILTRO DE ÓLEO DO MOTOR', 'JOHN DEERE', 'IMPORTADO', 'RE504836'],
      ['P0002', 'ROLAMENTO 6205', 'SKF; NSK', 'IMPORTADO', ''],
      ['P0003', 'JUNTA DO CABEÇOTE', 'AGRALE', '', ''],
      ['P0004', '', 'X', '', ''],
    ]).toBuffer()
    await page.locator('#arquivo-importacao').setInputFiles({
      name: 'produtos.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: xlsx,
    })
    await expect(page.getByLabel('Descrição / nome da peça')).toHaveValue('1')
    await expect(page.getByText('3 produto(s) distinto(s)')).toBeVisible()
    await expect(page.getByText('Linha 7: Sem descrição do produto')).toBeVisible()
    await page.getByRole('button', { name: 'Importar 3 produto(s)' }).click()
    const resultado = page.getByRole('status').filter({ hasText: 'Importação concluída:' })
    await expect(resultado).toContainText('3 produto(s) novo(s)')
    await expect(resultado).toContainText('6 marca(s) nova(s)')
    await expect(resultado).toContainText('6 nova(s) ligação(ões)')

    // Importar de novo não duplica nada.
    await page.getByRole('button', { name: 'Importar 3 produto(s)' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Importação concluída:' })).toContainText('0 produto(s) novo(s)')

    await page.getByRole('tab', { name: 'Clientes' }).click()
    const csv = Buffer.from(
      'Código;Nome;CPF/CNPJ;Cidade;UF\r\n000123;FAZENDA BOA VISTA LTDA;12.345.678/0001-90;Rio Verde;GO\r\n000124;JOSÉ DA SILVA;;Jataí;GO\r\n',
      'latin1',
    )
    await page.locator('#arquivo-importacao').setInputFiles({ name: 'clientes.csv', mimeType: 'text/csv', buffer: csv })
    await expect(page.getByRole('cell', { name: 'JOSÉ DA SILVA' })).toBeVisible()
    await page.getByRole('button', { name: 'Importar 2 cliente(s)' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Importação concluída:' })).toContainText('2 cliente(s) novo(s)')

    await irPeloMenu(page, 'Produtos')
    const linhaFiltro = page.getByRole('row', { name: /FILTRO DE ÓLEO DO MOTOR/ })
    await expect(linhaFiltro).toContainText('JOHN DEERE')
    await expect(linhaFiltro).toContainText('MASSEY FERGUSON')
    expect(problemas).toEqual([])
  })

  test('operador registra garantia e outro usuário vê na hora (tempo real)', async ({ browser }) => {
    const consulta = await novaPagina(browser)
    await entrarNoPainel(consulta.page, USUARIOS.consulta, SENHA_NOVA)
    await consulta.page.goto('/garantias')
    await expect(consulta.page.getByText('Nenhuma garantia registrada ainda.')).toBeVisible()

    const operador = await novaPagina(browser)
    const page = operador.page
    await entrarNoPainel(page, USUARIOS.operador, SENHA_NOVA)
    await page.getByRole('link', { name: '+ Nova garantia' }).first().click()
    await expect(page.getByRole('heading', { name: 'Nova garantia' })).toBeVisible()

    // Tentar salvar vazio mostra os erros.
    await page.getByRole('button', { name: 'Registrar garantia' }).click()
    await expect(page.getByText('Escolha a empresa (Lojão dos Tratores ou LL Tratores).')).toBeVisible()
    await expect(page.getByText('Informe se o produto é nacional ou importado.')).toBeVisible()

    await page.getByRole('radio', { name: /LL Tratores/ }).check()
    await expect(page.getByText('Escolha a empresa (Lojão dos Tratores ou LL Tratores).')).toBeHidden()
    await page.getByRole('combobox', { name: 'Cliente', exact: true }).fill('boa vista')
    await page.getByRole('option', { name: /000123 — FAZENDA BOA VISTA LTDA/ }).click()
    await page.getByRole('combobox', { name: 'Peça / produto', exact: true }).fill('filtro oleo')
    await page.getByRole('option', { name: /P0001 — FILTRO DE ÓLEO DO MOTOR/ }).click()
    await page.getByRole('combobox', { name: 'Marca', exact: true }).selectOption({ label: 'JOHN DEERE (ref. RE504836)' })
    await expect(page.getByRole('radio', { name: 'Importado' })).toBeChecked()
    await page.getByRole('combobox', { name: 'Marca', exact: true }).selectOption({ label: 'VALTRA' })
    await expect(page.getByRole('radio', { name: 'Nacional' })).toBeChecked()
    await page.getByRole('combobox', { name: 'Marca', exact: true }).selectOption({ label: 'JOHN DEERE (ref. RE504836)' })
    await page.getByRole('textbox', { name: 'Quantidade', exact: true }).fill('2')
    await page.getByLabel('Valor unitário (R$)').fill('1.234,50')
    await expect(page.getByText(/Total: R\$\s2\.469,00/)).toBeVisible()
    await page.getByLabel('Descrição do defeito / reclamação').fill('Vazamento no elemento filtrante após 10 horas de uso')
    await page.getByLabel('NF de venda ao cliente').fill('NF 4521')
    await page.getByRole('button', { name: 'Registrar garantia' }).click()

    await expect(page.getByRole('heading', { level: 1, name: /Garantia Nº 00001/ })).toBeVisible()
    await expect(page.getByText('000123 — FAZENDA BOA VISTA LTDA')).toBeVisible()
    await expect(page.locator('.grade-info')).toContainText('JOHN DEERE')
    await expect(page.locator('.grade-info')).toContainText('Importado')
    await expect(page.locator('.grade-info')).toContainText('LL Tratores')
    await expect(page.locator('.grade-info')).toContainText(/R\$\s2\.469,00/)

    // A tela da outra pessoa atualiza sozinha, sem recarregar.
    await expect(consulta.page.getByRole('row', { name: /FAZENDA BOA VISTA/ })).toBeVisible({ timeout: 20_000 })

    expect(operador.problemas).toEqual([])
    expect(consulta.problemas).toEqual([])
    await operador.contexto.close()
    await consulta.contexto.close()
  })

  test('acompanhamento: status com comentário, comentário, foto e edição', async ({ page }) => {
    const problemas = vigiarConsole(page)
    await entrarNoPainel(page, USUARIOS.operador, SENHA_NOVA)
    await page.goto('/garantias/1')
    await expect(page.getByRole('heading', { level: 1, name: /Garantia Nº 00001/ })).toBeVisible()

    await page.getByRole('button', { name: 'Alterar status' }).click()
    const dialogo = page.getByRole('dialog', { name: 'Alterar status' })
    await dialogo.getByLabel('Novo status').selectOption({ label: 'Enviada ao fornecedor' })
    await dialogo.getByLabel('Comentário (opcional)').fill('Enviada pela transportadora Rápido, NF 991')
    await dialogo.getByRole('button', { name: 'Salvar' }).click()
    await expect(dialogo).toBeHidden()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Enviada ao fornecedor')
    await expect(page.locator('.linha-tempo')).toContainText('Status: Aberta → Enviada ao fornecedor')
    await expect(page.locator('.linha-tempo')).toContainText('Enviada pela transportadora Rápido, NF 991')

    await page.getByLabel('Novo comentário').fill('Fornecedor confirmou o recebimento.')
    await page.getByRole('button', { name: 'Comentar' }).click()
    await expect(page.locator('.linha-tempo')).toContainText('Fornecedor confirmou o recebimento.')

    await page.locator('#arquivo-anexo').setInputFiles({
      name: 'foto da peça.png',
      mimeType: 'image/png',
      buffer: readFileSync('public/icone-512.png'),
    })
    const imagem = page.getByRole('img', { name: 'foto da peça.png' })
    await expect(imagem).toBeVisible()
    await expect.poll(() => imagem.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)

    await page.locator('#arquivo-anexo').setInputFiles({ name: 'pagina.html', mimeType: 'text/html', buffer: Buffer.from('<b>x</b>') })
    await expect(page.getByText('"pagina.html": tipo não permitido')).toBeVisible()

    await page.getByRole('link', { name: 'Editar' }).click()
    await expect(page.getByRole('textbox', { name: 'Quantidade', exact: true })).toHaveValue('2')
    await page.getByRole('textbox', { name: 'Quantidade', exact: true }).fill('3')
    await page.getByLabel('Fornecedor', { exact: true }).fill('AGCO do Brasil')
    await page.getByRole('button', { name: 'Salvar alterações' }).click()
    await expect(page.getByRole('heading', { level: 1, name: /Garantia Nº 00001/ })).toBeVisible()
    await expect(page.locator('.linha-tempo')).toContainText('Campos alterados: quantidade, fornecedor')
    await expect(page.locator('.grade-info')).toContainText('AGCO do Brasil')

    await page.goto('/')
    await expect(page.getByRole('link', { name: /Em andamento\s*1/ })).toBeVisible()
    await expect(page.getByRole('row', { name: /LL Tratores/ })).toContainText('1')
    expect(problemas).toEqual([])
  })

  test('conflito: duas pessoas editando a mesma garantia', async ({ browser }) => {
    const a = await novaPagina(browser)
    const b = await novaPagina(browser)
    await entrarNoPainel(a.page, USUARIOS.operador, SENHA_NOVA)
    await entrarNoPainel(b.page, USUARIOS.admin, SENHA_ADMIN)
    await a.page.goto('/garantias/1/editar')
    await b.page.goto('/garantias/1/editar')
    await expect(a.page.getByRole('textbox', { name: 'Quantidade', exact: true })).toHaveValue('3')
    await expect(b.page.getByRole('textbox', { name: 'Quantidade', exact: true })).toHaveValue('3')
    await a.page.getByRole('textbox', { name: 'Quantidade', exact: true }).fill('4')
    await a.page.getByRole('button', { name: 'Salvar alterações' }).click()
    await expect(a.page.getByRole('heading', { level: 1, name: /Garantia Nº 00001/ })).toBeVisible()
    await b.page.getByRole('textbox', { name: 'Quantidade', exact: true }).fill('9')
    await b.page.getByRole('button', { name: 'Salvar alterações' }).click()
    await expect(b.page.getByRole('alert')).toContainText('foi alterada por outra pessoa')
    await a.contexto.close()
    await b.contexto.close()
  })

  test('usuário de consulta só visualiza', async ({ page }) => {
    const problemas = vigiarConsole(page)
    await entrarNoPainel(page, USUARIOS.consulta, SENHA_NOVA)
    await expect(page.getByRole('link', { name: '+ Nova garantia' })).toHaveCount(0)
    await page.goto('/garantias/1')
    await expect(page.getByRole('heading', { level: 1, name: /Garantia Nº 00001/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Alterar status' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Comentar' })).toHaveCount(0)
    await page.goto('/garantias/nova')
    await expect(page.getByText('Seu usuário tem acesso somente para consulta.')).toBeVisible()
    await page.goto('/usuarios')
    await expect(page.getByText('Acesso restrito a administradores.')).toBeVisible()
    expect(problemas).toEqual([])
  })

  test('exporta a lista de garantias para Excel', async ({ page }) => {
    await entrarNoPainel(page, USUARIOS.admin, SENHA_ADMIN)
    await page.goto('/garantias?origem=IMPORTADO')
    await expect(page.getByRole('row', { name: /FAZENDA BOA VISTA/ })).toBeVisible()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar Excel' }).click()])
    expect(download.suggestedFilename()).toMatch(/^garantias-\d{4}-\d{2}-\d{2}\.xlsx$/)
    const linhas = await readSheet(readFileSync((await download.path())!))
    expect(linhas[0].slice(0, 6)).toEqual(['Nº', 'Abertura', 'Status', 'Empresa', 'Cód. cliente', 'Cliente'])
    expect(linhas[1]).toContain('FAZENDA BOA VISTA LTDA')
    expect(linhas[1]).toContain('Importado')
    expect(linhas[1]).toContain('LL Tratores')
  })

  test('verificação em duas etapas: ativar, exigir código e admin remover', async ({ browser }) => {
    test.setTimeout(120_000)
    const op = await novaPagina(browser)
    const page = op.page
    await entrarNoPainel(page, USUARIOS.operador, SENHA_NOVA)
    await page.goto('/minha-conta')
    await page.getByRole('button', { name: 'Ativar verificação em duas etapas' }).click()
    await expect(page.getByRole('img', { name: 'Código QR para o aplicativo autenticador' })).toBeVisible()
    const segredo = (await page.locator('.cadastro-2fa code').textContent())!.trim()
    const janelaUsada = Math.floor(Date.now() / 30_000)
    await page.getByLabel('Código de 6 dígitos').fill(codigoTotp(segredo))
    await page.getByRole('button', { name: 'Confirmar e ativar' }).click()
    await expect(page.getByText('Ativada', { exact: true })).toBeVisible()

    await sair(page)
    await entrar(page, USUARIOS.operador, SENHA_NOVA)
    await expect(page.getByRole('heading', { name: 'Verificação em duas etapas' })).toBeVisible()
    await page.getByLabel('Código').fill('000000')
    await page.getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.getByRole('alert')).toContainText('Código inválido')
    // Usa um código de uma janela de tempo nova (como faria uma pessoa no dia seguinte).
    while (Math.floor(Date.now() / 30_000) === janelaUsada) await page.waitForTimeout(1000)
    await page.getByLabel('Código').fill(codigoTotp(segredo))
    await page.getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible()

    const adm = await novaPagina(browser)
    await entrarNoPainel(adm.page, USUARIOS.admin, SENHA_ADMIN)
    await adm.page.goto('/usuarios')
    const linha = adm.page.getByRole('row', { name: new RegExp(USUARIOS.operador) })
    await expect(linha).toContainText('Ativada')
    await linha.getByRole('button', { name: 'Remover 2 etapas' }).click()
    await adm.page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click()
    await expect(linha).not.toContainText('Ativada')

    // Sem 2FA, entra só com a senha.
    const novo = await novaPagina(browser)
    await entrarNoPainel(novo.page, USUARIOS.operador, SENHA_NOVA)
    expect([...op.problemas, ...adm.problemas, ...novo.problemas]).toEqual([])
    await op.contexto.close()
    await adm.contexto.close()
    await novo.contexto.close()
  })

  test('admin redefine senha e bloqueia usuário', async ({ browser }) => {
    const adm = await novaPagina(browser)
    await entrarNoPainel(adm.page, USUARIOS.admin, SENHA_ADMIN)
    await adm.page.goto('/usuarios')
    const linha = adm.page.getByRole('row', { name: new RegExp(USUARIOS.consulta) })
    await linha.getByRole('button', { name: 'Redefinir senha' }).click()
    const dialogo = adm.page.getByRole('dialog', { name: 'Redefinir senha' })
    await dialogo.getByRole('button', { name: 'Definir senha' }).click()
    const provisoria = (await dialogo.locator('.senha-gerada').textContent())!.trim()
    expect(provisoria).toMatch(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{12}$/)
    await dialogo.getByRole('button', { name: 'Concluir' }).click()

    const cons = await novaPagina(browser)
    await entrar(cons.page, USUARIOS.consulta, SENHA_NOVA)
    await expect(cons.page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.')
    await entrar(cons.page, USUARIOS.consulta, provisoria)
    await expect(cons.page.getByRole('heading', { name: 'Crie sua senha' })).toBeVisible()
    await cons.page.getByLabel('Nova senha', { exact: true }).fill(SENHA_NOVA + 'X')
    await cons.page.getByLabel('Confirme a nova senha').fill(SENHA_NOVA + 'X')
    await cons.page.getByRole('button', { name: 'Salvar nova senha' }).click()
    await expect(cons.page.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible()

    // Bloqueio
    await adm.page.reload()
    await adm.page.getByRole('row', { name: new RegExp(USUARIOS.consulta) }).getByRole('button', { name: 'Editar' }).click()
    const editar = adm.page.getByRole('dialog', { name: 'Editar usuário' })
    await editar.getByLabel('Acesso liberado').uncheck()
    await editar.getByRole('button', { name: 'Salvar' }).click()
    await expect(editar).toBeHidden()
    await cons.page.reload()
    await expect(cons.page.getByRole('heading', { name: /Entrar|Acesso aguardando liberação/ })).toBeVisible()

    // O admin não consegue bloquear a si mesmo.
    await adm.page.getByRole('row', { name: new RegExp(USUARIOS.admin) }).getByRole('button', { name: 'Editar' }).click()
    await expect(adm.page.getByRole('dialog', { name: 'Editar usuário' }).getByLabel('Acesso liberado')).toBeDisabled()
    expect([...adm.problemas, ...cons.problemas]).toEqual([])
    await adm.contexto.close()
    await cons.contexto.close()
  })

  test('sai sozinho após o tempo sem uso', async ({ page }) => {
    await entrarNoPainel(page, USUARIOS.operador, SENHA_NOVA)
    await page.evaluate(() => localStorage.setItem('garantias-ultima-atividade', String(Date.now() - 31 * 60_000)))
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
    await expect(page.getByText(/Sessão encerrada após 30 minutos sem uso/)).toBeVisible()
  })

  test('celular: menu, lista em cartões e sem rolagem lateral', async ({ browser }) => {
    const cel = await novaPagina(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
    const page = cel.page
    await entrarNoPainel(page, USUARIOS.operador, SENHA_NOVA)
    await page.goto('/garantias')
    await expect(page.getByText('FAZENDA BOA VISTA LTDA')).toBeVisible()
    const largura = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
    expect(largura[0]).toBeLessThanOrEqual(largura[1])
    await page.screenshot({ path: 'test-results/celular-lista.png', fullPage: true })
    await page.getByRole('button', { name: 'Abrir menu' }).click()
    await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Clientes' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Clientes' })).toBeVisible()
    await page.goto('/garantias/nova')
    const larguraForm = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
    expect(larguraForm[0]).toBeLessThanOrEqual(larguraForm[1])
    await page.screenshot({ path: 'test-results/celular-formulario.png', fullPage: true })
    expect(cel.problemas).toEqual([])
    await cel.contexto.close()
  })
})
