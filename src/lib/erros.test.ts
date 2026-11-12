import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { mensagemErro } from './erros'

describe('mensagemErro', () => {
  it('login', () => {
    expect(mensagemErro({ message: 'Invalid login credentials', status: 400 })).toBe('E-mail ou senha incorretos.')
    expect(mensagemErro({ message: 'Request rate limit reached', status: 429 })).toMatch(/Muitas tentativas/)
    expect(mensagemErro({ message: 'Invalid TOTP code entered', code: 'mfa_verification_failed' })).toMatch(/Código inválido/)
  })

  it('rede', () => {
    expect(mensagemErro(new TypeError('Failed to fetch'))).toMatch(/Sem conexão/)
  })

  it('banco de dados', () => {
    expect(mensagemErro({ code: '23505', message: 'duplicate key value violates unique constraint "clientes_chave_codigo_key"' })).toBe(
      'Já existe um cliente com este código.',
    )
    expect(
      mensagemErro({ code: '23503', message: 'update or delete on table "clientes" violates foreign key constraint' }),
    ).toMatch(/em uso/)
    expect(mensagemErro({ code: '42501', message: 'permission denied for table garantias' })).toBe(
      'Você não tem permissão para esta ação.',
    )
    expect(mensagemErro({ code: '42501', message: 'Somente administradores podem importar listas.' })).toBe(
      'Somente administradores podem importar listas.',
    )
    expect(mensagemErro({ code: '23514', message: 'violates check constraint "garantias_defeito_check"' })).toMatch(/defeito/)
  })

  it('arquivos', () => {
    expect(mensagemErro({ message: 'mime type text/html is not supported', code: 'InvalidMimeType' })).toMatch(/não permitido/)
    expect(mensagemErro({ message: 'The object exceeded the maximum allowed size' })).toMatch(/10 MB/)
  })

  it('desconhecido nunca mostra texto técnico em inglês', () => {
    expect(mensagemErro({ message: 'Some internal stack trace' })).toMatch(/erro inesperado/)
    expect(mensagemErro(undefined)).toMatch(/erro inesperado/)
  })
})

describe('configuração', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function erroCom(url: string, chave: string) {
    vi.stubEnv('VITE_SUPABASE_URL', url)
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', chave)
    vi.resetModules()
    const { erroDeConfiguracao } = await import('./config')
    return erroDeConfiguracao()
  }

  const jwt = (role: string) => `x.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.y`

  it('aceita a chave pública', async () => {
    expect(await erroCom('https://abc.supabase.co', 'sb_publishable_123')).toBeNull()
    expect(await erroCom('https://abc.supabase.co', jwt('anon'))).toBeNull()
  })

  it('RECUSA a chave secreta (evita vazamento de dados)', async () => {
    expect(await erroCom('https://abc.supabase.co', 'sb_secret_123')).toMatch(/PERIGO/)
    expect(await erroCom('https://abc.supabase.co', jwt('service_role'))).toMatch(/PERIGO/)
  })

  it('exige https fora do computador local', async () => {
    expect(await erroCom('http://abc.supabase.co', 'sb_publishable_1')).toMatch(/https/)
    expect(await erroCom('http://127.0.0.1:54321', 'sb_publishable_1')).toBeNull()
    expect(await erroCom('', 'sb_publishable_1')).toMatch(/VITE_SUPABASE_URL/)
    expect(await erroCom('https://abc.supabase.co', '')).toMatch(/VITE_SUPABASE_ANON_KEY/)
  })
})

describe('cabeçalhos de segurança da hospedagem', () => {
  const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8')

  it('tem CSP restritiva e proteções básicas', () => {
    expect(headers).toMatch(/Content-Security-Policy: default-src 'self'; script-src 'self';/)
    expect(headers).toMatch(/frame-ancestors 'none'/)
    expect(headers).toMatch(/object-src 'none'/)
    expect(headers).toMatch(/connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co/)
    expect(headers).toMatch(/Strict-Transport-Security: max-age=\d+/)
    expect(headers).toMatch(/X-Frame-Options: DENY/)
    expect(headers).toMatch(/X-Robots-Tag: noindex/)
    expect(headers).not.toMatch(/unsafe-inline|unsafe-eval/)
  })
})
