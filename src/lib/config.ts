// Leitura e validação das variáveis de ambiente (definidas na hospedagem).

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
const chave = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
const inatividade = Number.parseInt(import.meta.env.VITE_INATIVIDADE_MINUTOS ?? '', 10)

export const configuracao = {
  supabaseUrl: url,
  supabaseChave: chave,
  /** Minutos sem uso até encerrar a sessão automaticamente. */
  inatividadeMinutos: Number.isFinite(inatividade) && inatividade >= 5 && inatividade <= 720 ? inatividade : 30,
}

function papelDoJwt(token: string): string | null {
  const partes = token.split('.')
  if (partes.length !== 3) return null
  try {
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')))
    return typeof json?.role === 'string' ? json.role : null
  } catch {
    return null
  }
}

/**
 * Retorna uma mensagem de erro se a configuração estiver ausente ou PERIGOSA.
 * A chave secreta (service_role / sb_secret_) ignora todas as regras de
 * segurança do banco; se for colocada no site, qualquer pessoa poderia ler
 * tudo. Por isso o aplicativo se recusa a funcionar com ela.
 */
export function erroDeConfiguracao(): string | null {
  if (!url) return 'A variável VITE_SUPABASE_URL não foi configurada.'
  if (!/^https?:\/\/[^/\s]+$/i.test(url)) {
    return 'VITE_SUPABASE_URL inválida. Use o formato https://SEU-PROJETO.supabase.co'
  }
  if (!chave) return 'A variável VITE_SUPABASE_ANON_KEY não foi configurada.'
  if (chave.startsWith('sb_secret_') || papelDoJwt(chave) === 'service_role') {
    return (
      'PERIGO: foi configurada a chave SECRETA do Supabase. ' +
      'Use somente a chave pública ("Publishable key" ou "anon key") e troque ' +
      'a chave secreta no painel do Supabase, pois ela pode ter sido exposta.'
    )
  }
  if (url.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url)) {
    return 'A URL do Supabase deve usar https://'
  }
  return null
}
