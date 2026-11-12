// Interpretação de planilhas (Excel/CSV) de PRODUTOS e CLIENTES.
// Funções puras (sem acesso a arquivos), testadas em planilha.test.ts.

import { normalizarBusca } from './formato'
import type { Origem } from './constantes'

export type Celula = string | number | boolean | Date | null | undefined
export type Linhas = Celula[][]

export interface Problema {
  linha: number
  motivo: string
}

// ---------------------------------------------------------------------------
// Células
// ---------------------------------------------------------------------------

/** Converte qualquer célula em texto limpo. Números inteiros não ganham ".0". */
export function textoCelula(c: Celula): string {
  if (c === null || c === undefined) return ''
  if (c instanceof Date) {
    if (Number.isNaN(c.getTime())) return ''
    const d = String(c.getUTCDate()).padStart(2, '0')
    const m = String(c.getUTCMonth() + 1).padStart(2, '0')
    return `${d}/${m}/${c.getUTCFullYear()}`
  }
  if (typeof c === 'number') {
    if (!Number.isFinite(c)) return ''
    if (Number.isInteger(c)) return BigInt(c).toString()
    return String(c)
  }
  if (typeof c === 'boolean') return c ? 'SIM' : 'NÃO'
  return String(c).replace(/[\u00a0\s]+/g, ' ').trim()
}

function linhaVazia(linha: Celula[] | undefined): boolean {
  return !linha || linha.every((c) => textoCelula(c) === '')
}

// ---------------------------------------------------------------------------
// Colunas
// ---------------------------------------------------------------------------

export type CampoProduto = 'codigo' | 'descricao' | 'marcas' | 'origem' | 'referencia'
export type CampoCliente = 'codigo' | 'nome' | 'documento' | 'cidade' | 'uf' | 'telefone'

export const CAMPOS_PRODUTO: { campo: CampoProduto; rotulo: string; obrigatorio: boolean }[] = [
  { campo: 'codigo', rotulo: 'Código do produto', obrigatorio: false },
  { campo: 'descricao', rotulo: 'Descrição / nome da peça', obrigatorio: true },
  { campo: 'marcas', rotulo: 'Marca(s)', obrigatorio: false },
  { campo: 'origem', rotulo: 'Origem (Nacional/Importado)', obrigatorio: false },
  { campo: 'referencia', rotulo: 'Referência do fabricante', obrigatorio: false },
]

export const CAMPOS_CLIENTE: { campo: CampoCliente; rotulo: string; obrigatorio: boolean }[] = [
  { campo: 'codigo', rotulo: 'Código do cliente', obrigatorio: true },
  { campo: 'nome', rotulo: 'Nome / razão social', obrigatorio: true },
  { campo: 'documento', rotulo: 'CPF / CNPJ', obrigatorio: false },
  { campo: 'cidade', rotulo: 'Cidade', obrigatorio: false },
  { campo: 'uf', rotulo: 'UF', obrigatorio: false },
  { campo: 'telefone', rotulo: 'Telefone', obrigatorio: false },
]

// A ordem importa: padrões mais específicos primeiro.
const PADROES_PRODUTO: [CampoProduto, RegExp][] = [
  ['referencia', /(referencia(?! interna)|^ref\.?$|ref\.? ?(do )?fab|cod(igo|\.)? ?(do )?fabricante|codigo original|part ?number|^p\/?n$)/],
  ['marcas', /(marca|fabricante|montadora|^brand)/],
  ['origem', /(origem|procedencia|nacional|importad)/],
  ['codigo', /^(cod\b|cod\.|codigo|sku|ref\.? interna|referencia interna)/],
  ['descricao', /(descri|produto|peca|nome|^item$|material)/],
]

const PADROES_CLIENTE: [CampoCliente, RegExp][] = [
  ['documento', /(cpf|cnpj|documento|^doc\b|inscricao)/],
  ['codigo', /^(cod\b|cod\.|codigo|cliente cod|id cliente|^id$)/],
  ['uf', /^(uf|estado|est\.?)$/],
  ['cidade', /(cidade|municipio|localidade)/],
  ['telefone', /(telefone|^tel\b|^fone|celular|whats|contato)/],
  ['nome', /(nome|razao|cliente|fantasia)/],
]

function detectar<C extends string>(cabecalho: string[], padroes: [C, RegExp][]): Record<C, number | null> {
  const resultado = Object.fromEntries(padroes.map(([c]) => [c, null])) as Record<C, number | null>
  const usadas = new Set<number>()
  for (const [campo, regex] of padroes) {
    const idx = cabecalho.findIndex((h, i) => !usadas.has(i) && h !== '' && regex.test(normalizarBusca(h)))
    if (idx >= 0) {
      resultado[campo] = idx
      usadas.add(idx)
    }
  }
  return resultado
}

export function detectarColunasProduto(cabecalho: string[]): Record<CampoProduto, number | null> {
  return detectar(cabecalho, PADROES_PRODUTO)
}

export function detectarColunasCliente(cabecalho: string[]): Record<CampoCliente, number | null> {
  return detectar(cabecalho, PADROES_CLIENTE)
}

/**
 * Encontra a linha de cabeçalho: a primeira (entre as 15 primeiras) que tenha
 * pelo menos um título reconhecido; senão, a primeira linha não vazia.
 */
export function localizarCabecalho(linhas: Linhas, tipo: 'produto' | 'cliente'): number {
  const padroes = tipo === 'produto' ? PADROES_PRODUTO : PADROES_CLIENTE
  const limite = Math.min(linhas.length, 15)
  for (let i = 0; i < limite; i++) {
    const cab = (linhas[i] ?? []).map(textoCelula)
    const reconhecidas = cab.filter((h) => h && padroes.some(([, r]) => r.test(normalizarBusca(h)))).length
    if (reconhecidas >= 1 && cab.filter(Boolean).length >= 2) return i
  }
  const primeira = linhas.findIndex((l) => !linhaVazia(l))
  return primeira < 0 ? 0 : primeira
}

// ---------------------------------------------------------------------------
// Produtos
// ---------------------------------------------------------------------------

export interface MarcaImportada {
  nome: string
  origem: Origem | null
  referencia: string | null
}

export interface ProdutoImportado {
  codigo: string | null
  descricao: string
  marcas: MarcaImportada[]
}

export interface ResultadoProdutos {
  itens: ProdutoImportado[]
  erros: Problema[]
  avisos: Problema[]
  linhasLidas: number
  totalMarcas: number
  produtosSemMarca: number
}

/** "VALTRA, John Deere / SKF; AGCO" -> ["VALTRA", "John Deere", "SKF", "AGCO"] */
export function separarMarcas(texto: string): string[] {
  const vistos = new Set<string>()
  const lista: string[] = []
  for (const parte of texto.split(/\s*(?:[,;|/\n\r]|\s-\s)\s*/)) {
    const nome = parte.replace(/\s+/g, ' ').trim()
    const chave = normalizarBusca(nome)
    if (nome && !vistos.has(chave)) {
      vistos.add(chave)
      lista.push(nome)
    }
  }
  return lista
}

/** Interpreta a origem: "Nacional", "NAC", "N" | "Importado", "IMP", "I". */
export function lerOrigem(texto: string): Origem | null | 'invalida' {
  const t = normalizarBusca(texto).replace(/[^a-z]/g, '')
  if (!t) return null
  if (t === 'n' || t.startsWith('nac') || t === 'brasil' || t === 'br') return 'NACIONAL'
  if (t === 'i' || t.startsWith('imp') || t.startsWith('estrang')) return 'IMPORTADO'
  return 'invalida'
}

export function montarProdutos(
  linhas: Linhas,
  linhaCabecalho: number,
  colunas: Record<CampoProduto, number | null>,
): ResultadoProdutos {
  const erros: Problema[] = []
  const avisos: Problema[] = []
  const porChave = new Map<string, ProdutoImportado>()
  let linhasLidas = 0

  if (colunas.descricao === null) {
    return {
      itens: [],
      erros: [{ linha: linhaCabecalho + 1, motivo: 'Selecione a coluna da descrição do produto.' }],
      avisos,
      linhasLidas: 0,
      totalMarcas: 0,
      produtosSemMarca: 0,
    }
  }

  const ler = (linha: Celula[], col: number | null) => (col === null ? '' : textoCelula(linha[col]))

  for (let i = linhaCabecalho + 1; i < linhas.length; i++) {
    const linha = linhas[i]
    if (linhaVazia(linha)) continue
    linhasLidas++
    const numero = i + 1
    const codigo = ler(linha, colunas.codigo) || null
    const descricao = ler(linha, colunas.descricao)

    if (!descricao) {
      erros.push({ linha: numero, motivo: 'Sem descrição do produto — linha ignorada.' })
      continue
    }
    if (descricao.length > 300) {
      erros.push({ linha: numero, motivo: 'Descrição com mais de 300 caracteres — linha ignorada.' })
      continue
    }
    if (codigo && codigo.length > 60) {
      erros.push({ linha: numero, motivo: 'Código com mais de 60 caracteres — linha ignorada.' })
      continue
    }

    const origemTexto = ler(linha, colunas.origem)
    let origem = lerOrigem(origemTexto)
    if (origem === 'invalida') {
      avisos.push({ linha: numero, motivo: `Origem "${origemTexto}" não reconhecida — ficará em branco.` })
      origem = null
    }
    const referencia = ler(linha, colunas.referencia).slice(0, 80) || null
    const nomesMarcas = separarMarcas(ler(linha, colunas.marcas)).filter((m) => {
      if (m.length > 120) {
        avisos.push({ linha: numero, motivo: `Marca "${m.slice(0, 30)}…" muito longa — ignorada.` })
        return false
      }
      return true
    })

    const chave = codigo ? `c:${normalizarBusca(codigo)}` : `d:${normalizarBusca(descricao)}`
    let item = porChave.get(chave)
    if (!item) {
      item = { codigo, descricao, marcas: [] }
      porChave.set(chave, item)
    } else if (normalizarBusca(item.descricao) !== normalizarBusca(descricao)) {
      avisos.push({
        linha: numero,
        motivo: `O código "${codigo}" aparece com descrições diferentes. Será usada: "${descricao}".`,
      })
      item.descricao = descricao
    }

    for (const nome of nomesMarcas) {
      const existente = item.marcas.find((m) => normalizarBusca(m.nome) === normalizarBusca(nome))
      if (existente) {
        if (origem && existente.origem && existente.origem !== origem) {
          avisos.push({
            linha: numero,
            motivo: `Marca "${nome}" do produto "${descricao}" com origens diferentes. Será usada: ${origem}.`,
          })
        }
        existente.origem = origem ?? existente.origem
        existente.referencia = referencia ?? existente.referencia
      } else {
        item.marcas.push({ nome, origem, referencia })
      }
    }
  }

  const itens = [...porChave.values()]
  return {
    itens,
    erros,
    avisos,
    linhasLidas,
    totalMarcas: new Set(itens.flatMap((p) => p.marcas.map((m) => normalizarBusca(m.nome)))).size,
    produtosSemMarca: itens.filter((p) => p.marcas.length === 0).length,
  }
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export interface ClienteImportado {
  codigo: string
  nome: string
  documento: string | null
  cidade: string | null
  uf: string | null
  telefone: string | null
}

export interface ResultadoClientes {
  itens: ClienteImportado[]
  erros: Problema[]
  avisos: Problema[]
  linhasLidas: number
}

/**
 * CPF/CNPJ salvo como NÚMERO no Excel perde os zeros à esquerda.
 * CPF tem 11 dígitos e CNPJ 14: se vier com 9-10 ou 12-13 dígitos, completa.
 */
export function lerDocumento(c: Celula): { valor: string | null; corrigido: boolean } {
  const texto = textoCelula(c)
  if (!texto) return { valor: null, corrigido: false }
  if (typeof c === 'number') {
    const digitos = texto.replace(/\D/g, '')
    if (digitos.length >= 9 && digitos.length <= 10) return { valor: digitos.padStart(11, '0'), corrigido: true }
    if (digitos.length >= 12 && digitos.length <= 13) return { valor: digitos.padStart(14, '0'), corrigido: true }
    return { valor: digitos, corrigido: false }
  }
  return { valor: texto.slice(0, 30), corrigido: false }
}

export function montarClientes(
  linhas: Linhas,
  linhaCabecalho: number,
  colunas: Record<CampoCliente, number | null>,
): ResultadoClientes {
  const erros: Problema[] = []
  const avisos: Problema[] = []
  const porCodigo = new Map<string, ClienteImportado & { linha: number }>()
  let linhasLidas = 0

  if (colunas.codigo === null || colunas.nome === null) {
    return {
      itens: [],
      erros: [{ linha: linhaCabecalho + 1, motivo: 'Selecione as colunas de código e nome do cliente.' }],
      avisos,
      linhasLidas: 0,
    }
  }

  const ler = (linha: Celula[], col: number | null) => (col === null ? '' : textoCelula(linha[col]))

  for (let i = linhaCabecalho + 1; i < linhas.length; i++) {
    const linha = linhas[i]
    if (linhaVazia(linha)) continue
    linhasLidas++
    const numero = i + 1
    const codigo = ler(linha, colunas.codigo)
    const nome = ler(linha, colunas.nome)

    if (!codigo) {
      erros.push({ linha: numero, motivo: 'Sem código do cliente — linha ignorada.' })
      continue
    }
    if (!nome) {
      erros.push({ linha: numero, motivo: `Cliente ${codigo} sem nome — linha ignorada.` })
      continue
    }
    if (codigo.length > 60 || nome.length > 200) {
      erros.push({ linha: numero, motivo: `Cliente ${codigo}: código ou nome grande demais — linha ignorada.` })
      continue
    }

    const doc = colunas.documento === null ? { valor: null, corrigido: false } : lerDocumento(linha[colunas.documento])
    if (doc.corrigido) {
      avisos.push({ linha: numero, motivo: `CPF/CNPJ do cliente ${codigo} veio sem os zeros à esquerda e foi completado.` })
    }

    let uf: string | null = ler(linha, colunas.uf).toUpperCase() || null
    if (uf && !/^[A-Z]{2}$/.test(uf)) {
      avisos.push({ linha: numero, motivo: `UF "${uf}" inválida para o cliente ${codigo} — ficará em branco.` })
      uf = null
    }

    const chave = normalizarBusca(codigo)
    const anterior = porCodigo.get(chave)
    if (anterior) {
      avisos.push({
        linha: numero,
        motivo: `Código ${codigo} repetido (também na linha ${anterior.linha}). Será usada esta linha.`,
      })
    }
    porCodigo.set(chave, {
      linha: numero,
      codigo,
      nome,
      documento: doc.valor,
      cidade: ler(linha, colunas.cidade).slice(0, 100) || null,
      uf,
      telefone: ler(linha, colunas.telefone).slice(0, 40) || null,
    })
  }

  const itens: ClienteImportado[] = [...porCodigo.values()].map((c) => ({
    codigo: c.codigo,
    nome: c.nome,
    documento: c.documento,
    cidade: c.cidade,
    uf: c.uf,
    telefone: c.telefone,
  }))
  return { itens, erros, avisos, linhasLidas }
}

/** Divide uma lista em pedaços (para enviar ao servidor em lotes). */
export function emLotes<T>(lista: T[], tamanho: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho))
  return lotes
}
