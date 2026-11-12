import { Fragment, useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { RegistroAuditoria } from '../lib/supabase'
import type { Database, Json } from '../lib/database.types'
import { useAuth } from '../auth/AuthContext'
import { useAvisos } from '../components/Avisos'
import { mensagemErro } from '../lib/erros'
import { PAPEIS, rotuloPapel } from '../lib/constantes'
import type { Papel } from '../lib/constantes'
import { formatarDataHora } from '../lib/formato'
import { senhaValida } from '../lib/senha'
import { Carregando, MensagemErro, Paginacao, Vazio } from '../components/Comuns'
import { Confirmar, Modal } from '../components/Modal'

type Usuario = Database['public']['Functions']['listar_usuarios']['Returns'][number]

/** Senha provisória forte (12 caracteres, sem caracteres confusos). */
export function gerarSenhaProvisoria(): string {
  const maiusculas = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const minusculas = 'abcdefghijkmnpqrstuvwxyz'
  const numeros = '23456789'
  const todos = maiusculas + minusculas + numeros
  const aleatorio = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n
  const escolher = (conjunto: string) => conjunto[aleatorio(conjunto.length)]
  const chars = [escolher(maiusculas), escolher(minusculas), escolher(numeros)]
  while (chars.length < 12) chars.push(escolher(todos))
  for (let i = chars.length - 1; i > 0; i--) {
    const j = aleatorio(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

// ---------------------------------------------------------------------------
// USUÁRIOS
// ---------------------------------------------------------------------------
export function Usuarios() {
  const { ehAdmin, sessao } = useAuth()
  const { avisar } = useAvisos()
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [editar, setEditar] = useState<Usuario | null>(null)
  const [nome, setNome] = useState('')
  const [papel, setPapel] = useState<Papel>('operador')
  const [ativo, setAtivo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erroEditar, setErroEditar] = useState<string | null>(null)
  const [senhaPara, setSenhaPara] = useState<Usuario | null>(null)
  const [senha, setSenha] = useState('')
  const [erroSenha, setErroSenha] = useState<string | null>(null)
  const [senhaDefinida, setSenhaDefinida] = useState<string | null>(null)
  const [remover2fa, setRemover2fa] = useState<Usuario | null>(null)
  const meuId = sessao?.user.id

  const carregar = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('listar_usuarios')
      if (error) throw error
      setUsuarios(data)
      setErro(null)
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  function abrirEdicao(u: Usuario) {
    setEditar(u)
    setNome(u.nome)
    setPapel((PAPEIS.some((p) => p.valor === u.papel) ? u.papel : 'operador') as Papel)
    setAtivo(u.ativo)
    setErroEditar(null)
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!editar) return
    setSalvando(true)
    setErroEditar(null)
    try {
      const { data, error } = await supabase
        .from('perfis')
        .update({ nome: nome.trim(), papel, ativo })
        .eq('id', editar.id)
        .select('id')
      if (error) throw error
      if (!data?.length) throw new Error('sem permissão')
      avisar('Usuário atualizado.')
      setEditar(null)
      void carregar()
    } catch (er) {
      setErroEditar(mensagemErro(er))
    } finally {
      setSalvando(false)
    }
  }

  async function definirSenha(e: FormEvent) {
    e.preventDefault()
    if (!senhaPara) return
    if (!senhaValida(senha)) {
      setErroSenha('A senha precisa ter pelo menos 10 caracteres, com letra maiúscula, minúscula e número.')
      return
    }
    setSalvando(true)
    setErroSenha(null)
    try {
      const { error } = await supabase.rpc('admin_definir_senha', { p_usuario: senhaPara.id, p_senha: senha })
      if (error) throw error
      setSenhaDefinida(senha)
      void carregar()
    } catch (er) {
      setErroSenha(mensagemErro(er))
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarRemocao2fa() {
    if (!remover2fa) return
    setSalvando(true)
    try {
      const { error } = await supabase.rpc('admin_remover_2fa', { p_usuario: remover2fa.id })
      if (error) throw error
      avisar('Verificação em duas etapas removida. O usuário pode ativá-la de novo em “Minha conta”.')
      setRemover2fa(null)
      void carregar()
    } catch (er) {
      avisar(mensagemErro(er), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  if (!ehAdmin) return <MensagemErro texto="Acesso restrito a administradores." />

  const pendentes = usuarios?.filter((u) => !u.ativo).length ?? 0

  return (
    <div className="pagina">
      <div className="pagina-cabecalho">
        <div>
          <h2 className="titulo-secao">Usuários</h2>
          <p className="texto-suave">
            {usuarios?.length ?? 0} usuário(s){pendentes > 0 && <> · <strong>{pendentes} aguardando liberação</strong></>}
          </p>
        </div>
      </div>

      <details className="painel-bloco ajuda-bloco">
        <summary>Como dar acesso a uma nova pessoa</summary>
        <ol>
          <li>
            Entre no painel do <strong>Supabase</strong> → seu projeto → <strong>Authentication</strong> →{' '}
            <strong>Users</strong> → <strong>Add user</strong> → <strong>Create new user</strong>.
          </li>
          <li>
            Informe o e-mail da pessoa e uma senha provisória, marque <strong>Auto Confirm User</strong> e clique em{' '}
            <strong>Create user</strong>.
          </li>
          <li>
            Volte a esta tela e clique em <strong>Atualizar lista</strong>. A pessoa aparece como “Aguardando liberação”.
          </li>
          <li>
            Clique em <strong>Editar</strong>, escolha o papel (Administrador, Operador ou Consulta), marque{' '}
            <strong>Acesso liberado</strong> e salve.
          </li>
          <li>Envie o endereço do aplicativo, o e-mail e a senha provisória à pessoa. No primeiro acesso ela cria a própria senha.</li>
        </ol>
        <p className="texto-suave">Para retirar o acesso, edite o usuário e desmarque “Acesso liberado”. As sessões dele são encerradas na hora.</p>
      </details>

      <div className="acoes">
        <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => void carregar()}>
          Atualizar lista
        </button>
      </div>

      {erro && <MensagemErro texto={erro} aoTentarDeNovo={() => void carregar()} />}
      {!usuarios && !erro && <Carregando />}
      {usuarios && usuarios.length === 0 && <Vazio>Nenhum usuário.</Vazio>}
      {usuarios && usuarios.length > 0 && (
        <div className="tabela-container">
          <table className="tabela tabela-responsiva">
            <thead>
              <tr>
                <th>Nome / e-mail</th>
                <th>Papel</th>
                <th>Situação</th>
                <th>2 etapas</th>
                <th>Último acesso</th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className={u.ativo ? undefined : 'linha-inativa'}>
                  <td data-rotulo="Nome / e-mail">
                    <strong>{u.nome || '—'}</strong>
                    {u.id === meuId && <span className="selo">Você</span>}
                    <div className="texto-pequeno texto-suave">{u.email}</div>
                  </td>
                  <td data-rotulo="Papel">{rotuloPapel(u.papel)}</td>
                  <td data-rotulo="Situação">
                    {u.ativo ? <span className="selo st-concluida">Liberado</span> : <span className="selo st-reprovada">Aguardando liberação / bloqueado</span>}
                    {u.deve_trocar_senha && <div className="texto-pequeno texto-suave">Senha provisória</div>}
                  </td>
                  <td data-rotulo="2 etapas">{u.dois_fatores ? 'Ativada' : '—'}</td>
                  <td data-rotulo="Último acesso">{u.ultimo_acesso ? formatarDataHora(u.ultimo_acesso) : 'Nunca'}</td>
                  <td className="acoes-linha">
                    <button type="button" className="botao-link" onClick={() => abrirEdicao(u)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="botao-link"
                      onClick={() => {
                        setSenhaPara(u)
                        setSenha(gerarSenhaProvisoria())
                        setErroSenha(null)
                        setSenhaDefinida(null)
                      }}
                    >
                      Redefinir senha
                    </button>
                    {u.dois_fatores && (
                      <button type="button" className="botao-link texto-perigo" onClick={() => setRemover2fa(u)}>
                        Remover 2 etapas
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal aberto={editar !== null} titulo="Editar usuário" aoFechar={() => setEditar(null)}>
        <form onSubmit={salvar} className="formulario">
          <p className="texto-suave">{editar?.email}</p>
          <div className="campo">
            <label htmlFor="usu-nome">Nome</label>
            <input id="usu-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
          </div>
          <fieldset className="grupo-interno">
            <legend>Papel</legend>
            {PAPEIS.map((p) => (
              <label key={p.valor} className="caixa-marcar opcao-papel">
                <input
                  type="radio"
                  name="papel"
                  value={p.valor}
                  checked={papel === p.valor}
                  disabled={editar?.id === meuId}
                  onChange={() => setPapel(p.valor)}
                />
                <span>
                  <strong>{p.rotulo}</strong> — <small>{p.descricao}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="caixa-marcar">
            <input type="checkbox" checked={ativo} disabled={editar?.id === meuId} onChange={(e) => setAtivo(e.target.checked)} />{' '}
            <strong>Acesso liberado</strong>
          </label>
          {editar?.id === meuId && <small className="ajuda">Você não pode alterar o próprio papel nem bloquear o próprio acesso.</small>}
          {erroEditar && <MensagemErro texto={erroEditar} />}
          <div className="acoes-formulario">
            <button type="button" className="botao botao-secundario" onClick={() => setEditar(null)} disabled={salvando}>
              Cancelar
            </button>
            <button type="submit" className="botao" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal aberto={senhaPara !== null} titulo="Redefinir senha" aoFechar={() => setSenhaPara(null)}>
        {senhaDefinida ? (
          <div className="formulario">
            <div className="alerta alerta-sucesso">
              Senha provisória definida para <strong>{senhaPara?.email}</strong>. Todas as sessões dele foram encerradas.
            </div>
            <p>Envie esta senha à pessoa por um canal seguro. No próximo acesso ela será obrigada a criar uma nova:</p>
            <p className="senha-gerada">{senhaDefinida}</p>
            <div className="acoes-formulario">
              <button
                type="button"
                className="botao botao-secundario"
                onClick={() => void navigator.clipboard?.writeText(senhaDefinida).then(() => avisar('Senha copiada.'))}
              >
                Copiar
              </button>
              <button type="button" className="botao" onClick={() => setSenhaPara(null)}>
                Concluir
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={definirSenha} className="formulario">
            <p>
              Definir uma senha provisória para <strong>{senhaPara?.email}</strong>. A pessoa será desconectada e deverá
              criar uma nova senha no próximo acesso.
            </p>
            <div className="campo">
              <label htmlFor="senha-provisoria">Senha provisória</label>
              <div className="linha-campo">
                <input id="senha-provisoria" value={senha} onChange={(e) => setSenha(e.target.value)} maxLength={72} autoComplete="off" />
                <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => setSenha(gerarSenhaProvisoria())}>
                  Gerar outra
                </button>
              </div>
            </div>
            {erroSenha && <MensagemErro texto={erroSenha} />}
            <div className="acoes-formulario">
              <button type="button" className="botao botao-secundario" onClick={() => setSenhaPara(null)} disabled={salvando}>
                Cancelar
              </button>
              <button type="submit" className="botao" disabled={salvando}>
                {salvando ? 'Salvando…' : 'Definir senha'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Confirmar
        aberto={remover2fa !== null}
        titulo="Remover verificação em duas etapas"
        mensagem={
          <>
            Remover a verificação em duas etapas de <strong>{remover2fa?.email}</strong>? Use quando a pessoa perdeu o
            celular. Ela será desconectada e poderá ativar de novo em “Minha conta”.
          </>
        }
        textoConfirmar="Remover"
        perigoso
        ocupado={salvando}
        aoConfirmar={() => void confirmarRemocao2fa()}
        aoCancelar={() => setRemover2fa(null)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// AUDITORIA
// ---------------------------------------------------------------------------
const TABELAS_AUDITORIA: Record<string, string> = {
  garantias: 'Garantias',
  clientes: 'Clientes',
  produtos: 'Produtos',
  marcas: 'Marcas',
  produto_marcas: 'Produto × marca',
  anexos: 'Anexos',
  perfis: 'Usuários',
  empresas: 'Empresas',
  'auth.users': 'Senhas',
  'auth.mfa_factors': 'Verificação 2 etapas',
}

const OPERACOES: Record<string, string> = { INSERT: 'Inclusão', UPDATE: 'Alteração', DELETE: 'Exclusão' }
const IGNORAR = new Set(['atualizado_em', 'atualizado_por', 'criado_em'])

function valorTexto(v: Json | undefined): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function diferencas(r: RegistroAuditoria): { campo: string; antes: string; depois: string }[] {
  const antes = (r.dados_antigos ?? {}) as Record<string, Json>
  const depois = (r.dados_novos ?? {}) as Record<string, Json>
  const campos = new Set([...Object.keys(antes), ...Object.keys(depois)])
  const lista: { campo: string; antes: string; depois: string }[] = []
  for (const c of campos) {
    if (IGNORAR.has(c)) continue
    const a = valorTexto(antes[c])
    const d = valorTexto(depois[c])
    if (r.operacao === 'UPDATE' && a === d) continue
    if (r.operacao === 'INSERT' && d === '—') continue
    if (r.operacao === 'DELETE' && a === '—') continue
    lista.push({ campo: c, antes: a, depois: d })
  }
  return lista
}

export function Auditoria() {
  const { ehAdmin } = useAuth()
  const [tabela, setTabela] = useState('')
  const [operacao, setOperacao] = useState('')
  const chaveFiltro = `${tabela}|${operacao}`
  const [paginacao, setPaginacao] = useState({ pagina: 1, chave: chaveFiltro })
  const pagina = paginacao.chave === chaveFiltro ? paginacao.pagina : 1
  const setPagina = (p: number) => setPaginacao({ pagina: p, chave: chaveFiltro })
  const [linhas, setLinhas] = useState<RegistroAuditoria[] | null>(null)
  const [total, setTotal] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<number | null>(null)
  const POR_PAGINA = 50

  const carregar = useCallback(async () => {
    try {
      let q = supabase.from('auditoria').select('*', { count: 'exact' }).order('id', { ascending: false })
      if (tabela) q = q.eq('tabela', tabela)
      if (operacao) q = q.eq('operacao', operacao)
      const { data, error, count } = await q.range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)
      if (error) throw error
      setLinhas(data)
      setTotal(count ?? 0)
      setErro(null)
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }, [tabela, operacao, pagina])

  useEffect(() => {
    void carregar()
  }, [carregar])

  if (!ehAdmin) return <MensagemErro texto="Acesso restrito a administradores." />

  return (
    <div className="pagina">
      <div className="pagina-cabecalho">
        <div>
          <h2 className="titulo-secao">Auditoria</h2>
          <p className="texto-suave">Registro permanente de todas as inclusões, alterações e exclusões. Ninguém consegue apagar.</p>
        </div>
      </div>
      <section className="filtros">
        <div className="campo">
          <label htmlFor="aud-tabela">Área</label>
          <select id="aud-tabela" value={tabela} onChange={(e) => setTabela(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(TABELAS_AUDITORIA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="aud-op">Operação</label>
          <select id="aud-op" value={operacao} onChange={(e) => setOperacao(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(OPERACOES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </section>
      {erro && <MensagemErro texto={erro} aoTentarDeNovo={() => void carregar()} />}
      {!linhas && !erro && <Carregando />}
      {linhas && linhas.length === 0 && <Vazio>Nenhum registro.</Vazio>}
      {linhas && linhas.length > 0 && (
        <>
          <div className="tabela-container">
            <table className="tabela tabela-responsiva">
              <thead>
                <tr>
                  <th>Data/hora</th>
                  <th>Usuário</th>
                  <th>Área</th>
                  <th>Operação</th>
                  <th>Registro</th>
                  <th>
                    <span className="sr-only">Detalhes</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((r) => (
                  <Fragment key={r.id}>
                    <tr>
                      <td data-rotulo="Data/hora">{formatarDataHora(r.criado_em)}</td>
                      <td data-rotulo="Usuário">{r.usuario_email ?? 'Sistema / painel'}</td>
                      <td data-rotulo="Área">{TABELAS_AUDITORIA[r.tabela] ?? r.tabela}</td>
                      <td data-rotulo="Operação">{OPERACOES[r.operacao] ?? r.operacao}</td>
                      <td data-rotulo="Registro">{r.registro_id ?? '—'}</td>
                      <td>
                        <button type="button" className="botao-link" onClick={() => setAberto(aberto === r.id ? null : r.id)}>
                          {aberto === r.id ? 'Ocultar' : 'Detalhes'}
                        </button>
                      </td>
                    </tr>
                    {aberto === r.id && (
                      <tr className="linha-detalhe">
                        <td colSpan={6}>
                          <table className="tabela tabela-simples">
                            <thead>
                              <tr>
                                <th>Campo</th>
                                {r.operacao !== 'INSERT' && <th>Antes</th>}
                                {r.operacao !== 'DELETE' && <th>Depois</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {diferencas(r).map((d) => (
                                <tr key={d.campo}>
                                  <td>{d.campo}</td>
                                  {r.operacao !== 'INSERT' && <td className="quebra">{d.antes}</td>}
                                  {r.operacao !== 'DELETE' && <td className="quebra">{d.depois}</td>}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacao pagina={pagina} porPagina={POR_PAGINA} total={total} aoMudar={setPagina} />
        </>
      )}
    </div>
  )
}
