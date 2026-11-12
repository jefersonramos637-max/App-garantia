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

const COLUNAS: { titulo: string; largura: number; valor: (g: Garantia) => string | number | Date | null; formato?: string }[] = [
  { titulo: 'Nº', largura: 8, valor: (g) => numeroGarantia(g.id) },
  { titulo: 'Abertura', largura: 12, valor: (g) => dataExcel(g.data_abertura), formato: 'dd/mm/yyyy' },
  { titulo: 'Status', largura: 20, valor: (g) => rotuloStatus(g.status) },
  { titulo: 'Empresa', largura: 20, valor: (g) => g.empresa_nome },
  { titulo: 'Cód. cliente', largura: 12, valor: (g) => g.cliente_codigo },
  { titulo: 'Cliente', largura: 34, valor: (g) => g.cliente_nome },
  { titulo: 'Cód. peça', largura: 14, valor: (g) => g.produto_codigo },
  { titulo: 'Peça', largura: 38, valor: (g) => g.produto_descricao },
  { titulo: 'Marca', largura: 18, valor: (g) => g.marca_nome },
  { titulo: 'Origem', largura: 11, valor: (g) => rotuloOrigem(g.origem) },
  { titulo: 'Quantidade', largura: 11, valor: (g) => g.quantidade, formato: '#,##0.###' },
  { titulo: 'Valor unitário', largura: 14, valor: (g) => g.valor_unitario, formato: '#,##0.00' },
  { titulo: 'Valor total', largura: 14, valor: (g) => g.valor_total, formato: '#,##0.00' },
  { titulo: 'NF venda', largura: 12, valor: (g) => g.nota_fiscal_venda },
  { titulo: 'Data venda', largura: 12, valor: (g) => dataExcel(g.data_venda), formato: 'dd/mm/yyyy' },
  { titulo: 'Fornecedor', largura: 24, valor: (g) => g.fornecedor },
  { titulo: 'NF compra', largura: 12, valor: (g) => g.nota_fiscal_compra },
  { titulo: 'Protocolo fornecedor', largura: 18, valor: (g) => g.protocolo_fornecedor },
  { titulo: 'Defeito', largura: 50, valor: (g) => g.defeito },
  { titulo: 'Resolução', largura: 16, valor: (g) => (g.resolucao ? rotuloResolucao(g.resolucao) : null) },
  { titulo: 'Conclusão', largura: 12, valor: (g) => dataExcel(g.data_conclusao), formato: 'dd/mm/yyyy' },
  { titulo: 'Observações', largura: 40, valor: (g) => g.observacoes },
  { titulo: 'Registrada por', largura: 20, valor: (g) => g.criado_por_nome },
]

export async function exportarGarantiasExcel(garantias: Garantia[]): Promise<void> {
  const dados: SheetData = [
    COLUNAS.map((c) => ({ value: c.titulo, fontWeight: 'bold' as const })),
    ...garantias.map((g) =>
      COLUNAS.map((c) => {
        const v = c.valor(g)
        if (v === null || v === undefined || v === '') return null
        if (v instanceof Date) return { value: v, type: Date, format: c.formato ?? 'dd/mm/yyyy' }
        if (typeof v === 'number') return { value: v, type: Number, format: c.formato }
        return { value: String(v), type: String }
      }),
    ),
  ]
  await writeXlsxFile(dados, { columns: COLUNAS.map((c) => ({ width: c.largura })) }).toFile(
    `garantias-${hojeISO()}.xlsx`,
  )
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

