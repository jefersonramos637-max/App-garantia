// Regras de senha (iguais às configuradas no Supabase: mínimo 10, maiúscula, minúscula e número).

export const TAMANHO_MINIMO_SENHA = 10

export interface RegraSenha {
  texto: string
  ok: boolean
}

export function regrasSenha(senha: string): RegraSenha[] {
  return [
    { texto: `Pelo menos ${TAMANHO_MINIMO_SENHA} caracteres`, ok: senha.length >= TAMANHO_MINIMO_SENHA },
    { texto: 'Uma letra maiúscula', ok: /[A-Z]/.test(senha) },
    { texto: 'Uma letra minúscula', ok: /[a-z]/.test(senha) },
    { texto: 'Um número', ok: /\d/.test(senha) },
  ]
}

export function senhaValida(senha: string): boolean {
  return senha.length <= 72 && regrasSenha(senha).every((r) => r.ok)
}
