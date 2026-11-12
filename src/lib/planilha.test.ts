import { describe, expect, it } from 'vitest'
import writeXlsxFile from 'write-excel-file/node'
import { readSheet } from 'read-excel-file/node'
import {
  detectarColunasCliente,
  detectarColunasProduto,
  emLotes,
  lerDocumento,
  lerOrigem,
  localizarCabecalho,
  montarClientes,
  montarProdutos,
  detectarColunasNota,
  lerData,
  lerValor,
  montarNotas,
  separarMarcas,
  textoCelula,
} from './planilha'
import type { Linhas } from './planilha'
import { decodificarTexto, lerCsv } from './leitorPlanilha'

describe('células', () => {
  it('converte números inteiros sem ".0" e datas para dd/mm/aaaa', () => {
    expect(textoCelula(123)).toBe('123')
    expect(textoCelula(7891234567890)).toBe('7891234567890')
    expect(textoCelula(1.5)).toBe('1.5')
    expect(textoCelula(new Date(Date.UTC(2026, 10, 5)))).toBe('05/11/2026')
    expect(textoCelula('  a\u00a0 b  ')).toBe('a b')
    expect(textoCelula(null)).toBe('')
  })
})

describe('marcas e origem', () => {
  it('separa várias marcas e remove repetidas', () => {
    expect(separarMarcas('VALTRA, John Deere / SKF; AGCO | valtra')).toEqual(['VALTRA', 'John Deere', 'SKF', 'AGCO'])
    expect(separarMarcas('MERCEDES-BENZ - VOLVO')).toEqual(['MERCEDES-BENZ', 'VOLVO'])
    expect(separarMarcas('')).toEqual([])
  })

  it('entende formas comuns de origem', () => {
    expect(lerOrigem('Nacional')).toBe('NACIONAL')
    expect(lerOrigem('NAC')).toBe('NACIONAL')
    expect(lerOrigem('n')).toBe('NACIONAL')
    expect(lerOrigem('Importado')).toBe('IMPORTADO')
    expect(lerOrigem('importada')).toBe('IMPORTADO')
    expect(lerOrigem('IMP.')).toBe('IMPORTADO')
    expect(lerOrigem('')).toBeNull()
    expect(lerOrigem('China')).toBe('invalida')
  })
})

describe('detecção de colunas', () => {
  it('produtos: diferencia código interno de código do fabricante', () => {
    const c = detectarColunasProduto(['Cód. Produto', 'Descrição da Peça', 'Marcas', 'Origem', 'Código do Fabricante'])
    expect(c).toEqual({ codigo: 0, descricao: 1, marcas: 2, origem: 3, referencia: 4 })
  })

  it('produtos: cabeçalho simples', () => {
    expect(detectarColunasProduto(['Produto', 'Marca'])).toEqual({
      codigo: null,
      descricao: 0,
      marcas: 1,
      origem: null,
      referencia: null,
    })
  })

  it('clientes', () => {
    const c = detectarColunasCliente(['Código', 'Razão Social', 'CNPJ/CPF', 'Município', 'UF', 'Telefone'])
    expect(c).toEqual({ codigo: 0, nome: 1, documento: 2, cidade: 3, uf: 4, telefone: 5 })
  })

  it('"Referência interna" é o código interno', () => {
    const c = detectarColunasProduto(['Referência interna', 'Descrição', 'Ref. Fabricante'])
    expect(c.codigo).toBe(0)
    expect(c.referencia).toBe(2)
  })

  it('acha o cabeçalho mesmo com linhas de título antes', () => {
    const linhas: Linhas = [['RELATÓRIO DE PRODUTOS'], [], ['Código', 'Descrição', 'Marca'], ['1', 'X', 'Y']]
    expect(localizarCabecalho(linhas, 'produto')).toBe(2)
  })
})

describe('montarProdutos', () => {
  const linhas: Linhas = [
    ['Código', 'Descrição', 'Marcas', 'Origem', 'Ref'],
    ['P1', 'Filtro de óleo', 'Valtra, Massey', 'Nacional', ''],
    ['p1', 'Filtro de óleo', 'John Deere', 'Importado', 'RE123'],
    [null, 'Rolamento 6205', 'SKF; NSK', '', ''],
    ['', 'rolamento 6205', 'skf', 'IMP', ''],
    ['P3', '', 'X', '', ''],
    [],
    ['P4', 'Junta', '', 'xyz', ''],
  ]
  const r = montarProdutos(linhas, 0, detectarColunasProduto(linhas[0].map(textoCelula)))

  it('agrupa o mesmo produto em várias linhas (código sem diferenciar maiúsculas)', () => {
    expect(r.itens).toHaveLength(3)
    const p1 = r.itens.find((p) => p.codigo === 'P1')!
    expect(p1.marcas.map((m) => m.nome)).toEqual(['Valtra', 'Massey', 'John Deere'])
    expect(p1.marcas.find((m) => m.nome === 'John Deere')).toEqual({ nome: 'John Deere', origem: 'IMPORTADO', referencia: 'RE123' })
    expect(p1.marcas.find((m) => m.nome === 'Valtra')?.origem).toBe('NACIONAL')
  })

  it('produto sem código agrupa pela descrição e atualiza a origem', () => {
    const rol = r.itens.find((p) => p.codigo === null)!
    expect(rol.marcas).toEqual([
      { nome: 'SKF', origem: 'IMPORTADO', referencia: null },
      { nome: 'NSK', origem: null, referencia: null },
    ])
  })

  it('aponta erros e avisos com o número da linha', () => {
    expect(r.erros).toEqual([{ linha: 6, motivo: 'Sem descrição do produto — linha ignorada.' }])
    expect(r.avisos.some((a) => a.linha === 8 && a.motivo.includes('xyz'))).toBe(true)
    expect(r.linhasLidas).toBe(6)
    expect(r.produtosSemMarca).toBe(1)
    expect(r.totalMarcas).toBe(5)
  })

  it('sem coluna de descrição não importa nada', () => {
    const vazio = montarProdutos(linhas, 0, { codigo: 0, descricao: null, marcas: 2, origem: null, referencia: null })
    expect(vazio.itens).toHaveLength(0)
    expect(vazio.erros).toHaveLength(1)
  })
})

describe('montarClientes', () => {
  it('valida, corrige CPF/CNPJ numérico e trata códigos repetidos', () => {
    const linhas: Linhas = [
      ['Código', 'Nome', 'CPF/CNPJ', 'Cidade', 'UF', 'Fone'],
      ['000123', 'Fazenda Boa Vista', 1234567000190, 'Rio Verde', 'go', ''],
      [77, 'José', 1234567890, '', 'Goiás', ''],
      ['', 'Sem código', '', '', '', ''],
      ['88', '', '', '', '', ''],
      ['000123', 'Fazenda Boa Vista LTDA', '12.345.670/0001-90', '', '', ''],
    ]
    const r = montarClientes(linhas, 0, detectarColunasCliente(linhas[0].map(textoCelula)))
    expect(r.itens).toEqual([
      { codigo: '000123', nome: 'Fazenda Boa Vista LTDA', documento: '12.345.670/0001-90', cidade: null, uf: null, telefone: null },
      { codigo: '77', nome: 'José', documento: '01234567890', cidade: null, uf: null, telefone: null },
    ])
    expect(r.erros.map((e) => e.linha)).toEqual([4, 5])
    expect(r.avisos.some((a) => a.motivo.includes('repetido'))).toBe(true)
    expect(r.avisos.some((a) => a.motivo.includes('Goiás'.toUpperCase()))).toBe(true)
    expect(r.avisos.some((a) => a.motivo.includes('zeros'))).toBe(true)
  })

  it('lerDocumento só completa zeros quando a célula era número', () => {
    expect(lerDocumento(1234567000190)).toEqual({ valor: '01234567000190', corrigido: true })
    expect(lerDocumento('123')).toEqual({ valor: '123', corrigido: false })
    expect(lerDocumento(12345678901)).toEqual({ valor: '12345678901', corrigido: false })
  })
})

describe('arquivos', () => {
  it('lê CSV do Excel brasileiro (ponto e vírgula, Windows-1252)', () => {
    // "Código;Descrição\n1;Peça" em Windows-1252
    const bytes = new Uint8Array([
      0x43, 0xf3, 0x64, 0x69, 0x67, 0x6f, 0x3b, 0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0xe7, 0xe3, 0x6f, 0x0a, 0x31, 0x3b,
      0x50, 0x65, 0xe7, 0x61,
    ])
    const texto = decodificarTexto(bytes.buffer)
    expect(lerCsv(texto)).toEqual([
      ['Código', 'Descrição'],
      ['1', 'Peça'],
    ])
  })

  it('lê CSV UTF-8 com BOM', () => {
    const bytes = new TextEncoder().encode('\uFEFFCódigo,Nome\n1,"Silva, José"\n')
    expect(lerCsv(decodificarTexto(bytes.buffer as ArrayBuffer))).toEqual([
      ['Código', 'Nome'],
      ['1', 'Silva, José'],
    ])
  })

  it('lê uma planilha .xlsx real (ida e volta)', async () => {
    const blob = await writeXlsxFile([
      ['Código', 'Descrição', 'Marcas'],
      ['P1', 'Peça com acentuação ÇÃÕ', 'A, B'],
      [123, 'Numérico', 'C'],
    ]).toBuffer()
    const linhas = (await readSheet(blob)) as Linhas
    const r = montarProdutos(linhas, 0, detectarColunasProduto(linhas[0].map(textoCelula)))
    expect(r.itens).toEqual([
      { codigo: 'P1', descricao: 'Peça com acentuação ÇÃÕ', marcas: [{ nome: 'A', origem: null, referencia: null }, { nome: 'B', origem: null, referencia: null }] },
      { codigo: '123', descricao: 'Numérico', marcas: [{ nome: 'C', origem: null, referencia: null }] },
    ])
  })
})

describe('lotes', () => {
  it('divide em pedaços', () => {
    expect(emLotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(emLotes([], 3)).toEqual([])
  })
})

describe('notas de entrada (compras)', () => {
  it('lê datas em vários formatos e recusa datas impossíveis', () => {
    expect(lerData('05/11/2026')).toBe('2026-11-05')
    expect(lerData('5.11.26')).toBe('2026-11-05')
    expect(lerData('2026-11-05T00:00:00')).toBe('2026-11-05')
    expect(lerData(new Date(Date.UTC(2026, 10, 5)))).toBe('2026-11-05')
    expect(lerData('31/02/2026')).toBeNull()
    expect(lerData('lixo')).toBeNull()
    expect(lerData(null)).toBeNull()
  })

  it('lê valores do Excel e em texto brasileiro', () => {
    expect(lerValor(1234.5)).toBe(1234.5)
    expect(lerValor('1.234,56')).toBe(1234.56)
    expect(lerValor('')).toBeNull()
    expect(lerValor('abc')).toBeNaN()
  })

  const linhas: Linhas = [
    ['RELATÓRIO DE ENTRADAS'],
    ['Nº da nota', 'Fornecedor', 'Data de entrada', 'Valor da nota', 'Valor de tabela', 'Obs'],
    ['1001', 'AGCO do Brasil', '05/11/2026', '9.000,00', '10.000,00', ''],
    [1002, 'Valtra', new Date(Date.UTC(2026, 10, 6)), 5000, null, 'urgente'],
    ['1001', 'agco do brasil', '07/11/2026', '8.500,00', '10.000,00', ''],
    ['1003', 'SKF', '32/13/2026', '100', '', ''],
    ['', 'SKF', '01/11/2026', '100', '', ''],
    ['1004', 'NSK', '02/11/2026', 'x', '', ''],
  ]

  it('reconhece as colunas e monta as notas', () => {
    const cab = 1
    const c = detectarColunasNota(linhas[cab].map(textoCelula))
    expect(c).toEqual({ numero: 0, fornecedor: 1, data: 2, valor: 3, referencia: 4, observacoes: 5 })
    const r = montarNotas(linhas, cab, c)
    expect(r.itens).toEqual([
      { numero: '1001', fornecedor: 'agco do brasil', data_entrada: '2026-11-07', valor_total: 8500, valor_referencia: 10000, observacoes: null },
      { numero: '1002', fornecedor: 'Valtra', data_entrada: '2026-11-06', valor_total: 5000, valor_referencia: null, observacoes: 'urgente' },
    ])
    expect(r.erros.map((e) => e.linha)).toEqual([6, 7, 8])
    expect(r.avisos.some((a) => a.motivo.includes('repetida'))).toBe(true)
    expect(r.totalValor).toBe(13500)
    expect(r.totalReferencia).toBe(10000)
  })

  it('sem colunas obrigatórias não importa nada', () => {
    const r = montarNotas(linhas, 1, { numero: 0, fornecedor: null, data: 2, valor: 3, referencia: null, observacoes: null })
    expect(r.itens).toHaveLength(0)
    expect(r.erros[0].motivo).toContain('Fornecedor')
  })
})
