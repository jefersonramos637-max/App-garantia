export const STATUS = [
  { valor: 'ABERTA', rotulo: 'Aberta', classe: 'st-aberta' },
  { valor: 'EM_ANALISE', rotulo: 'Em análise', classe: 'st-analise' },
  { valor: 'ENVIADA_FORNECEDOR', rotulo: 'Enviada ao fornecedor', classe: 'st-enviada' },
  { valor: 'APROVADA', rotulo: 'Aprovada', classe: 'st-aprovada' },
  { valor: 'REPROVADA', rotulo: 'Reprovada', classe: 'st-reprovada' },
  { valor: 'CONCLUIDA', rotulo: 'Concluída', classe: 'st-concluida' },
  { valor: 'CANCELADA', rotulo: 'Cancelada', classe: 'st-cancelada' },
] as const

export type Status = (typeof STATUS)[number]['valor']

export const STATUS_FINAIS: readonly Status[] = ['CONCLUIDA', 'REPROVADA', 'CANCELADA']
export const STATUS_EM_ANDAMENTO: readonly Status[] = STATUS.map((s) => s.valor).filter(
  (s) => !STATUS_FINAIS.includes(s),
)

export function rotuloStatus(valor: string | null | undefined): string {
  return STATUS.find((s) => s.valor === valor)?.rotulo ?? valor ?? '—'
}

export function classeStatus(valor: string | null | undefined): string {
  return STATUS.find((s) => s.valor === valor)?.classe ?? ''
}

export function ehStatus(valor: string | null | undefined): valor is Status {
  return STATUS.some((s) => s.valor === valor)
}

export const ORIGENS = [
  { valor: 'NACIONAL', rotulo: 'Nacional' },
  { valor: 'IMPORTADO', rotulo: 'Importado' },
] as const

export type Origem = (typeof ORIGENS)[number]['valor']

export function rotuloOrigem(valor: string | null | undefined): string {
  if (valor === 'MISTA') return 'Mista'
  return ORIGENS.find((o) => o.valor === valor)?.rotulo ?? '—'
}

export const RESOLUCOES = [
  { valor: 'TROCA', rotulo: 'Troca da peça' },
  { valor: 'CREDITO', rotulo: 'Crédito' },
  { valor: 'REPARO', rotulo: 'Reparo' },
  { valor: 'REEMBOLSO', rotulo: 'Reembolso' },
  { valor: 'SEM_COBERTURA', rotulo: 'Sem cobertura' },
] as const

export function rotuloResolucao(valor: string | null | undefined): string {
  return RESOLUCOES.find((r) => r.valor === valor)?.rotulo ?? '—'
}

export const PAPEIS = [
  { valor: 'admin', rotulo: 'Administrador', descricao: 'Acesso total: usuários, importação, cadastros e garantias.' },
  { valor: 'operador', rotulo: 'Operador', descricao: 'Registra e acompanha garantias; cadastra clientes e produtos.' },
  { valor: 'consulta', rotulo: 'Consulta', descricao: 'Somente visualiza. Não altera nada.' },
] as const

export type Papel = (typeof PAPEIS)[number]['valor']

export function rotuloPapel(valor: string | null | undefined): string {
  return PAPEIS.find((p) => p.valor === valor)?.rotulo ?? valor ?? '—'
}

/** Garantias em andamento há mais dias que isso aparecem como "atrasadas". */
export const DIAS_ALERTA = 30

export const TAMANHO_MAXIMO_ANEXO = 10 * 1024 * 1024
export const TIPOS_ANEXO = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
