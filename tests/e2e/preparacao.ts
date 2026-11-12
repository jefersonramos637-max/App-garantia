// Antes dos testes: recria o banco local do zero e cadastra os usuários de teste.
import { execSync } from 'node:child_process'
import { SENHA_INICIAL, SENHA_NOVA, USUARIOS, clienteServico } from './apoio'

export default async function preparacao() {
  execSync('npx supabase db reset', { stdio: 'ignore' })
  const svc = clienteServico()

  const criar = async (email: string, senha: string) => {
    const { data, error } = await svc.auth.admin.createUser({ email, password: senha, email_confirm: true })
    if (error) throw error
    return data.user.id
  }

  const admin = await criar(USUARIOS.admin, SENHA_INICIAL)
  const operador = await criar(USUARIOS.operador, SENHA_NOVA)
  const consulta = await criar(USUARIOS.consulta, SENHA_NOVA)
  await criar(USUARIOS.pendente, SENHA_NOVA)

  // Mesmo comando que o administrador roda uma única vez no SQL Editor.
  const atualizar = async (id: string, dados: Record<string, unknown>) => {
    const { error } = await svc.from('perfis').update(dados).eq('id', id)
    if (error) throw error
  }
  await atualizar(admin, { papel: 'admin', ativo: true, nome: 'Jeferson Admin' })
  await atualizar(operador, { papel: 'operador', ativo: true, nome: 'Olívia Operadora', deve_trocar_senha: false })
  await atualizar(consulta, { papel: 'consulta', ativo: true, nome: 'Carlos Consulta', deve_trocar_senha: false })
}
