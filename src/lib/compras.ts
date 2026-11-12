// Cálculos do desempenho do setor de compras (notas de entrada e saving).

export interface LinhaMensal {
  mes: string // AAAA-MM-01
  empresa_id: number
  notas: number
  fornecedores: number
  valor_total: number
  notas_com_referencia: number
  valor_referencia: number
  valor_pago_com_referencia: number
  saving: number
}

export interface ResumoMes {
  mes: string
  notas: number
  valor: number
  notasComReferencia: number
  referencia: number
  pagoComReferencia: number
  saving: number
}

export type Periodo = '12m' | 'ano' | 'anoAnterior'

export const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: '12m', rotulo: 'Últimos 12 meses' },
  { valor: 'ano', rotulo: 'Este ano' },
  { valor: 'anoAnterior', rotulo: 'Ano passado' },
]

function mesISO(ano: number, mes0: number): string {
  const d = new Date(Date.UTC(ano, mes0, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

/** Lista de meses (AAAA-MM-01) do período, do mais antigo ao mais recente. */
export function mesesDoPeriodo(periodo: Periodo, hoje: Date = new Date()): string[] {
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth()
  if (periodo === '12m') return Array.from({ length: 12 }, (_, i) => mesISO(ano, mes - 11 + i))
  if (periodo === 'ano') return Array.from({ length: mes + 1 }, (_, i) => mesISO(ano, i))
  return Array.from({ length: 12 }, (_, i) => mesISO(ano - 1, i))
}

/** Soma as linhas (uma por empresa) em um resumo por mês, preenchendo meses sem notas com zero. */
export function agruparPorMes(linhas: LinhaMensal[], meses: string[]): ResumoMes[] {
  return meses.map((mes) => {
    const doMes = linhas.filter((l) => l.mes === mes)
    const soma = (f: (l: LinhaMensal) => number) => doMes.reduce((t, l) => t + Number(f(l)), 0)
    return {
      mes,
      notas: soma((l) => l.notas),
      valor: soma((l) => l.valor_total),
      notasComReferencia: soma((l) => l.notas_com_referencia),
      referencia: soma((l) => l.valor_referencia),
      pagoComReferencia: soma((l) => l.valor_pago_com_referencia),
      saving: soma((l) => l.saving),
    }
  })
}

export interface Totais {
  notas: number
  valor: number
  saving: number
  /** Saving ÷ valor de referência (nas notas que têm referência); null se não houver referência. */
  savingPercentual: number | null
  /** Parte das notas que informam o valor de referência (0 a 1). */
  cobertura: number | null
  ticketMedio: number | null
}

export function totalizar(meses: ResumoMes[]): Totais {
  const notas = meses.reduce((t, m) => t + m.notas, 0)
  const valor = meses.reduce((t, m) => t + m.valor, 0)
  const saving = meses.reduce((t, m) => t + m.saving, 0)
  const referencia = meses.reduce((t, m) => t + m.referencia, 0)
  const comRef = meses.reduce((t, m) => t + m.notasComReferencia, 0)
  return {
    notas,
    valor,
    saving,
    savingPercentual: referencia > 0 ? saving / referencia : null,
    cobertura: notas > 0 ? comRef / notas : null,
    ticketMedio: notas > 0 ? valor / notas : null,
  }
}

const meses = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })

/** "2026-11-01" -> "nov. de 26" (curto, para gráficos e tabelas). */
export function rotuloMes(iso: string): string {
  const [a, m] = iso.split('-').map(Number)
  return meses.format(new Date(Date.UTC(a, m - 1, 1))).replace('.', '')
}

export function formatarPercentual(valor: number | null, casas = 1): string {
  if (valor === null || Number.isNaN(valor)) return '—'
  return `${(valor * 100).toFixed(casas).replace('.', ',')}%`
}

/** Variação em relação ao mês anterior: "+12,5%" / "−3,0%" / null se não houver base. */
export function variacao(atual: number, anterior: number): number | null {
  return anterior > 0 ? (atual - anterior) / anterior : null
}
