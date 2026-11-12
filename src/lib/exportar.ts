// Exportação de dados para Excel (.xlsx).
import writeXlsxFile from 'write-excel-file/browser'
import type { SheetData } from 'write-excel-file/browser'
import type { Tables } from './database.types'
import { rotuloOrigem, rotuloResolucao, rotuloStatus } from './constantes'
import { hojeISO, numeroGarantia } from './formato'

type Garantia = Tables<'vw_garantias'>

function dataExcel(iso: string | null): Date | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null
}

export interface ItemExportacao {
  garantia_id: number
  ordem: number
  origem: string
  quantidade: number
  valor_unitario: number | null
  produto_marcas: {
    referencia: string | null
    produtos: { codigo: string | null; descricao: string } | null
    marcas: { nome: string } | null
  } | null
}

type Linha = { g: Garantia; item: ItemExportacao | null; numeroItem: number }

const COLUNAS: { titulo: string; largura: number; valor: (l: Linha) => string | number | Date | null; formato?: string }[] = [
  { titulo: 'Nº', largura: 8, valor: (l) => numeroGarantia(l.g.id) },
  { titulo: 'Abertura', largura: 12, valor: (l) => dataExcel(l.g.data_abertura), formato: 'dd/mm/yyyy' },
  { titulo: 'Status', largura: 20, valor: (l) => rotuloStatus(l.g.status) },
  { titulo: 'Empresa', largura: 20, valor: (l) => l.g.empresa_nome },
  { titulo: 'Cód. cliente', largura: 12, valor: (l) => l.g.cliente_codigo },
  { titulo: 'Cliente', largura: 34, valor: (l) => l.g.cliente_nome },
  { titulo: 'Item', largura: 6, valor: (l) => l.numeroItem },
  { titulo: 'Cód. peça', largura: 14, valor: (l) => l.item?.produto_marcas?.produtos?.codigo ?? null },
  { titulo: 'Peça', largura: 38, valor: (l) => l.item?.produto_marcas?.produtos?.descricao ?? null },
  { titulo: 'Marca', largura: 18, valor: (l) => l.item?.produto_marcas?.marcas?.nome ?? null },
  { titulo: 'Origem', largura: 11, valor: (l) => (l.item ? rotuloOrigem(l.item.origem) : null) },
  { titulo: 'Quantidade', largura: 11, valor: (l) => l.item?.quantidade ?? null, formato: '#,##0.###' },
  { titulo: 'Valor unitário', largura: 14, valor: (l) => l.item?.valor_unitario ?? null, formato: '#,##0.00' },
  {
    titulo: 'Subtotal do item',
    largura: 15,
    valor: (l) => (l.item && l.item.valor_unitario !== null ? Math.round(l.item.quantidade * l.item.valor_unitario * 100) / 100 : null),
    formato: '#,##0.00',
  },
  { titulo: 'Total da garantia', largura: 16, valor: (l) => (l.numeroItem === 1 ? l.g.valor_total : null), formato: '#,##0.00' },
  { titulo: 'NF venda', largura: 12, valor: (l) => l.g.nota_fiscal_venda },
  { titulo: 'Data venda', largura: 12, valor: (l) => dataExcel(l.g.data_venda), formato: 'dd/mm/yyyy' },
  { titulo: 'Fornecedor', largura: 24, valor: (l) => l.g.fornecedor },
  { titulo: 'NF compra', largura: 12, valor: (l) => l.g.nota_fiscal_compra },
  { titulo: 'Protocolo fornecedor', largura: 18, valor: (l) => l.g.protocolo_fornecedor },
  { titulo: 'Defeito', largura: 50, valor: (l) => l.g.defeito },
  { titulo: 'Resolução', largura: 16, valor: (l) => (l.g.resolucao ? rotuloResolucao(l.g.resolucao) : null) },
  { titulo: 'Conclusão', largura: 12, valor: (l) => dataExcel(l.g.data_conclusao), formato: 'dd/mm/yyyy' },
  { titulo: 'Observações', largura: 40, valor: (l) => l.g.observacoes },
  { titulo: 'Registrada por', largura: 20, valor: (l) => l.g.criado_por_nome },
]

/** Uma linha por PRODUTO da garantia (garantias com 2 produtos ocupam 2 linhas). */
export async function exportarGarantiasExcel(garantias: Garantia[], itens: ItemExportacao[]): Promise<void> {
  const porGarantia = new Map<number, ItemExportacao[]>()
  for (const i of itens) porGarantia.set(i.garantia_id, [...(porGarantia.get(i.garantia_id) ?? []), i])
  const linhas: Linha[] = garantias.flatMap((g): Linha[] => {
    const lista = (porGarantia.get(g.id) ?? []).sort((a, b) => a.ordem - b.ordem)
    return lista.length ? lista.map((item, n): Linha => ({ g, item, numeroItem: n + 1 })) : [{ g, item: null, numeroItem: 1 }]
  })
  const dados: SheetData = [
    COLUNAS.map((c) => ({ value: c.titulo, fontWeight: 'bold' as const })),
    ...linhas.map((l) =>
      COLUNAS.map((c) => {
        const v = c.valor(l)
        if (v === null || v === undefined || v === '') return null
        if (v instanceof Date) return { value: v, type: Date, format: c.formato ?? 'dd/mm/yyyy' }
        if (typeof v === 'number') return { value: v, type: Number, format: c.formato }
        return { value: String(v), type: String }
      }),
    ),
  ]
  await writeXlsxFile(dados, { columns: COLUNAS.map((c) => ({ width: c.largura })) }).toFile(`garantias-${hojeISO()}.xlsx`)
}

/** Planilhas-modelo para importação. */
export async function baixarModeloProdutos(): Promise<void> {
  const dados: SheetData = [
    ['Código', 'Descrição', 'Marcas', 'Origem', 'Referência fabricante'].map((t) => ({ value: t, fontWeight: 'bold' as const })),
    ['P0001', 'FILTRO DE ÓLEO DO MOTOR', 'VALTRA, MASSEY FERGUSON', 'NACIONAL', ''],
    ['P0001', 'FILTRO DE ÓLEO DO MOTOR', 'JOHN DEERE', 'IMPORTADO', 'RE504836'],
    ['P0002', 'ROLAMENTO 6205', 'SKF; NSK', 'IMPORTADO', ''],
  ]
  await writeXlsxFile(dados, { columns: [{ width: 12 }, { width: 36 }, { width: 30 }, { width: 12 }, { width: 22 }] }).toFile(
    'modelo-produtos.xlsx',
  )
}

export async function baixarModeloClientes(): Promise<void> {
  const dados: SheetData = [
    ['Código', 'Nome', 'CPF/CNPJ', 'Cidade', 'UF', 'Telefone'].map((t) => ({ value: t, fontWeight: 'bold' as const })),
    ['000123', 'FAZENDA BOA VISTA LTDA', '12.345.678/0001-90', 'Rio Verde', 'GO', '(64) 99999-0000'],
    ['000124', 'JOSÉ DA SILVA', '123.456.789-00', 'Jataí', 'GO', ''],
  ]
  await writeXlsxFile(dados, { columns: [{ width: 10 }, { width: 36 }, { width: 20 }, { width: 18 }, { width: 6 }, { width: 18 }] }).toFile(
    'modelo-clientes.xlsx',
  )
}

export function nomeArquivoSeguro(nome: string): string {
  const semAcento = nome.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  const limpo = semAcento.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+/, '')
  return (limpo || 'arquivo').slice(-80)
}

