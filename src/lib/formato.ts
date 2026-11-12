// Formatação no padrão brasileiro e utilitários de texto.

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const quantidade = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })
const dataHora = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** "2026-11-05" -> "05/11/2026" (sem conversão de fuso, evita "voltar um dia"). */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return '—'
  return `${m[3]}/${m[2]}/${m[1]}`
}

export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dataHora.format(d)
}

export function formatarMoeda(valor: number | null | undefined): string {
  return valor === null || valor === undefined || Number.isNaN(valor) ? '—' : moeda.format(valor)
}

export function formatarQuantidade(valor: number | null | undefined): string {
  return valor === null || valor === undefined || Number.isNaN(valor) ? '—' : quantidade.format(valor)
}

/** Número de exibição da garantia: 12 -> "00012". */
export function numeroGarantia(id: number | null | undefined): string {
  return id === null || id === undefined ? '—' : String(id).padStart(5, '0')
}

/** Data de hoje (no aparelho do usuário) no formato AAAA-MM-DD. */
export function hojeISO(agora: Date = new Date()): string {
  const a = agora.getFullYear()
  const m = String(agora.getMonth() + 1).padStart(2, '0')
  const d = String(agora.getDate()).padStart(2, '0')
  return `${a}-${m}-${d}`
}

/** Dias corridos entre uma data AAAA-MM-DD e hoje. */
export function diasDesde(iso: string | null | undefined, agora: Date = new Date()): number | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null
  if (!m) return null
  const inicio = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate())
  return Math.round((hoje - inicio) / 86_400_000)
}

/** Mesma normalização usada no banco: sem acentos, minúsculas, espaços simples. */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Escapa caracteres especiais do LIKE/ILIKE (%, _ e \) e da sintaxe do PostgREST. */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, ' ')
}

/** Padrão "%termo%" já normalizado e escapado, ou null se a busca estiver vazia. */
export function padraoBusca(texto: string): string | null {
  const t = normalizarBusca(texto)
  return t ? `%${escaparLike(t).replace(/ /g, '%')}%` : null
}

/**
 * Converte texto digitado no padrão brasileiro em número.
 * "1.234,56" -> 1234.56 | "150,5" -> 150.5 | "150.50" -> 150.5 | "1.500" -> 1500
 * Retorna null se vazio e NaN se inválido.
 */
export function lerNumeroBR(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, '').replace(/^R\$/i, '')
  if (!t) return null
  let normal: string
  if (t.includes(',')) {
    normal = t.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    normal = t.replace(/\./g, '')
  } else {
    normal = t
  }
  if (!/^-?\d+(\.\d+)?$/.test(normal)) return Number.NaN
  return Number(normal)
}

/** Número -> texto para preencher campos de formulário ("1234.5" -> "1234,5"). */
export function numeroParaCampo(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return ''
  return String(valor).replace('.', ',')
}

export function tamanhoArquivo(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

/** "hoje", "há 1 dia", "há 5 dias". */
export function textoDias(dias: number | null): string {
  if (dias === null) return ''
  if (dias <= 0) return 'hoje'
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`
}
