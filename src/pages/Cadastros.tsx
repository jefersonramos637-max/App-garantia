import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Cliente, Marca } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAvisos } from '../components/Avisos'
import { useAtrasado } from '../lib/hooks'
import { mensagemErro } from '../lib/erros'
import { padraoBusca } from '../lib/formato'
import { Carregando, MensagemErro, Paginacao, Vazio } from '../components/Comuns'
import { Confirmar, Modal } from '../components/Modal'
import { FormCliente, FormProduto } from '../components/Formularios'

const POR_PAGINA = 50

function BarraBusca({
  id,
  texto,
  aoMudar,
  inativos,
  aoMudarInativos,
  placeholder,
}: {
  id: string
  texto: string
  aoMudar: (v: string) => void
  inativos: boolean
  aoMudarInativos: (v: boolean) => void
  placeholder: string
}) {
  return (
    <section className="filtros" aria-label="Busca">
      <div className="campo campo-largo">
        <label htmlFor={id}>Buscar</label>
        <input id={id} type="search" value={texto} onChange={(e) => aoMudar(e.target.value)} placeholder={placeholder} />
      </div>
      <label className="caixa-marcar">
        <input type="checkbox" checked={inativos} onChange={(e) => aoMudarInativos(e.target.checked)} /> Mostrar inativos
      </label>
    </section>
  )
}

// ---------------------------------------------------------------------------
// CLIENTES
// ---------------------------------------------------------------------------
export function Clientes() {
  const { podeEditar, ehAdmin } = useAuth()
  const { avisar } = useAvisos()
  const [texto, setTexto] = useState('')
  const busca = useAtrasado(texto, 300)
  const [inativos, setInativos] = useState(false)
  const chaveFiltro = `${busca}|${inativos}`
  const [paginacao, setPaginacao] = useState({ pagina: 1, chave: chaveFiltro })
  // Ao mudar a busca, volta para a página 1 sem consultar duas vezes.
  const pagina = paginacao.chave === chaveFiltro ? paginacao.pagina : 1
  const setPagina = (p: number) => setPaginacao({ pagina: p, chave: chaveFiltro })
  const [linhas, setLinhas] = useState<Cliente[] | null>(null)
  const [total, setTotal] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [editar, setEditar] = useState<{ aberto: boolean; cliente: Cliente | null }>({ aberto: false, cliente: null })
  const [excluir, setExcluir] = useState<Cliente | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const carregar = useCallback(async () => {
    try {
      let q = supabase.from('clientes').select('*', { count: 'exact' }).order('nome').order('id')
      const padrao = padraoBusca(busca)
      if (padrao) q = q.ilike('busca', padrao)
      if (!inativos) q = q.eq('ativo', true)
      const { data, error, count } = await q.range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)
      if (error) throw error
      setLinhas(data)
      setTotal(count ?? 0)
      setErro(null)
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }, [busca, inativos, pagina])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function confirmarExclusao() {
    if (!excluir) return
    setExcluindo(true)
    try {
      const { data, error } = await supabase.from('clientes').delete().eq('id', excluir.id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('sem permissão')
      avisar(`Cliente ${excluir.codigo} excluído.`)
      setExcluir(null)
      void carregar()
    } catch (e) {
      avisar(mensagemErro(e), 'erro')
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <div className="pagina">
      <div className="pagina-cabecalho">
        <div>
          <h1>Clientes</h1>
          <p className="texto-suave">{total.toLocaleString('pt-BR')} cliente(s)</p>
        </div>
        {podeEditar && (
          <button type="button" className="botao" onClick={() => setEditar({ aberto: true, cliente: null })}>
            + Novo cliente
          </button>
        )}
      </div>
      <BarraBusca
        id="busca-clientes"
        texto={texto}
        aoMudar={setTexto}
        inativos={inativos}
        aoMudarInativos={setInativos}
        placeholder="Código, nome, CPF/CNPJ ou cidade"
      />
      {erro && <MensagemErro texto={erro} aoTentarDeNovo={() => void carregar()} />}
      {!linhas && !erro && <Carregando />}
      {linhas && linhas.length === 0 && <Vazio>Nenhum cliente encontrado.</Vazio>}
      {linhas && linhas.length > 0 && (
        <>
          <div className="tabela-container">
            <table className="tabela tabela-responsiva">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nome</th>
                  <th>CPF / CNPJ</th>
                  <th>Cidade / UF</th>
                  <th>Telefone</th>
                  {podeEditar && (
                    <th>
                      <span className="sr-only">Ações</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {linhas.map((c) => (
                  <tr key={c.id} className={c.ativo ? undefined : 'linha-inativa'}>
                    <td data-rotulo="Código">
                      <strong>{c.codigo}</strong>
                    </td>
                    <td data-rotulo="Nome">
                      {c.nome} {!c.ativo && <span className="selo">Inativo</span>}
                    </td>
                    <td data-rotulo="CPF / CNPJ">{c.documento ?? '—'}</td>
                    <td data-rotulo="Cidade / UF">{[c.cidade, c.uf].filter(Boolean).join(' / ') || '—'}</td>
                    <td data-rotulo="Telefone">{c.telefone ?? '—'}</td>
                    {podeEditar && (
                      <td className="acoes-linha">
                        <button type="button" className="botao-link" onClick={() => setEditar({ aberto: true, cliente: c })}>
                          Editar
                        </button>
                        {ehAdmin && (
                          <button type="button" className="botao-link texto-perigo" onClick={() => setExcluir(c)}>
                            Excluir
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacao pagina={pagina} porPagina={POR_PAGINA} total={total} aoMudar={setPagina} />
        </>
      )}
      <FormCliente
        aberto={editar.aberto}
        cliente={editar.cliente}
        aoFechar={() => setEditar({ aberto: false, cliente: null })}
        aoSalvar={(c) => {
          avisar(`Cliente ${c.codigo} salvo.`)
          setEditar({ aberto: false, cliente: null })
          void carregar()
        }}
      />
      <Confirmar
        aberto={excluir !== null}
        titulo="Excluir cliente"
        mensagem={
          <>
            Excluir o cliente <strong>{excluir?.codigo} — {excluir?.nome}</strong>? Clientes com garantias não podem ser
            excluídos; nesse caso, edite e desmarque “Cliente ativo”.
          </>
        }
        textoConfirmar="Excluir"
        perigoso
        ocupado={excluindo}
        aoConfirmar={() => void confirmarExclusao()}
        aoCancelar={() => setExcluir(null)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// PRODUTOS
// ---------------------------------------------------------------------------
interface ProdutoLinha {
  id: number
  codigo: string | null
  descricao: string
  ativo: boolean
  produto_marcas: { origem_padrao: string | null; ativo: boolean; marcas: { nome: string } | null }[]
}

export function Produtos() {
  const { podeEditar, ehAdmin } = useAuth()
  const { avisar } = useAvisos()
  const [texto, setTexto] = useState('')
  const busca = useAtrasado(texto, 300)
  const [inativos, setInativos] = useState(false)
  const chaveFiltro = `${busca}|${inativos}`
  const [paginacao, setPaginacao] = useState({ pagina: 1, chave: chaveFiltro })
  // Ao mudar a busca, volta para a página 1 sem consultar duas vezes.
  const pagina = paginacao.chave === chaveFiltro ? paginacao.pagina : 1
  const setPagina = (p: number) => setPaginacao({ pagina: p, chave: chaveFiltro })
  const [linhas, setLinhas] = useState<ProdutoLinha[] | null>(null)
  const [total, setTotal] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [editar, setEditar] = useState<{ aberto: boolean; id: number | null }>({ aberto: false, id: null })
  const [excluir, setExcluir] = useState<ProdutoLinha | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const carregar = useCallback(async () => {
    try {
      let q = supabase
        .from('produtos')
        .select('id, codigo, descricao, ativo, produto_marcas(origem_padrao, ativo, marcas(nome))', { count: 'exact' })
        .order('descricao')
        .order('id')
      const padrao = padraoBusca(busca)
      if (padrao) q = q.ilike('busca', padrao)
      if (!inativos) q = q.eq('ativo', true)
      const { data, error, count } = await q.range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)
      if (error) throw error
      setLinhas(data)
      setTotal(count ?? 0)
      setErro(null)
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }, [busca, inativos, pagina])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function confirmarExclusao() {
    if (!excluir) return
    setExcluindo(true)
    try {
      const { data, error } = await supabase.from('produtos').delete().eq('id', excluir.id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('sem permissão')
      avisar('Produto excluído.')
      setExcluir(null)
      void carregar()
    } catch (e) {
      avisar(mensagemErro(e), 'erro')
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <div className="pagina">
      <div className="pagina-cabecalho">
        <div>
          <h1>Produtos</h1>
          <p className="texto-suave">{total.toLocaleString('pt-BR')} produto(s)</p>
        </div>
        {podeEditar && (
          <button type="button" className="botao" onClick={() => setEditar({ aberto: true, id: null })}>
            + Novo produto
          </button>
        )}
      </div>
      <BarraBusca
        id="busca-produtos"
        texto={texto}
        aoMudar={setTexto}
        inativos={inativos}
        aoMudarInativos={setInativos}
        placeholder="Código ou descrição da peça"
      />
      {erro && <MensagemErro texto={erro} aoTentarDeNovo={() => void carregar()} />}
      {!linhas && !erro && <Carregando />}
      {linhas && linhas.length === 0 && <Vazio>Nenhum produto encontrado.</Vazio>}
      {linhas && linhas.length > 0 && (
        <>
          <div className="tabela-container">
            <table className="tabela tabela-responsiva">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descrição</th>
                  <th>Marcas</th>
                  {podeEditar && (
                    <th>
                      <span className="sr-only">Ações</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {linhas.map((p) => (
                  <tr key={p.id} className={p.ativo ? undefined : 'linha-inativa'}>
                    <td data-rotulo="Código">
                      <strong>{p.codigo ?? '—'}</strong>
                    </td>
                    <td data-rotulo="Descrição">
                      {p.descricao} {!p.ativo && <span className="selo">Inativo</span>}
                    </td>
                    <td data-rotulo="Marcas">
                      {p.produto_marcas.length === 0 && <span className="texto-alerta">Sem marca</span>}
                      <span className="chips">
                        {[...p.produto_marcas]
                          .sort((a, b) => (a.marcas?.nome ?? '').localeCompare(b.marcas?.nome ?? '', 'pt-BR'))
                          .map((pm) => (
                            <span
                              key={pm.marcas?.nome}
                              className={pm.ativo ? 'chip' : 'chip chip-inativo'}
                              title={pm.origem_padrao ? `Origem padrão: ${pm.origem_padrao === 'NACIONAL' ? 'Nacional' : 'Importado'}` : 'Origem não definida'}
                            >
                              {pm.marcas?.nome}
                              {pm.origem_padrao && <small> · {pm.origem_padrao === 'NACIONAL' ? 'NAC' : 'IMP'}</small>}
                            </span>
                          ))}
                      </span>
                    </td>
                    {podeEditar && (
                      <td className="acoes-linha">
                        <button type="button" className="botao-link" onClick={() => setEditar({ aberto: true, id: p.id })}>
                          Editar
                        </button>
                        {ehAdmin && (
                          <button type="button" className="botao-link texto-perigo" onClick={() => setExcluir(p)}>
                            Excluir
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacao pagina={pagina} porPagina={POR_PAGINA} total={total} aoMudar={setPagina} />
        </>
      )}
      <FormProduto
        aberto={editar.aberto}
        produtoId={editar.id}
        aoFechar={() => setEditar({ aberto: false, id: null })}
        aoSalvar={() => {
          avisar('Produto salvo.')
          setEditar({ aberto: false, id: null })
          void carregar()
        }}
      />
      <Confirmar
        aberto={excluir !== null}
        titulo="Excluir produto"
        mensagem={
          <>
            Excluir o produto <strong>{excluir?.descricao}</strong>? Produtos com garantias não podem ser excluídos;
            nesse caso, edite e desmarque “Produto ativo”.
          </>
        }
        textoConfirmar="Excluir"
        perigoso
        ocupado={excluindo}
        aoConfirmar={() => void confirmarExclusao()}
        aoCancelar={() => setExcluir(null)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// MARCAS
// ---------------------------------------------------------------------------
type MarcaLinha = Marca & { produto_marcas: { count: number }[] }

export function Marcas() {
  const { podeEditar, ehAdmin } = useAuth()
  const { avisar } = useAvisos()
  const [texto, setTexto] = useState('')
  const busca = useAtrasado(texto, 300)
  const [inativos, setInativos] = useState(false)
  const chaveFiltro = `${busca}|${inativos}`
  const [paginacao, setPaginacao] = useState({ pagina: 1, chave: chaveFiltro })
  // Ao mudar a busca, volta para a página 1 sem consultar duas vezes.
  const pagina = paginacao.chave === chaveFiltro ? paginacao.pagina : 1
  const setPagina = (p: number) => setPaginacao({ pagina: p, chave: chaveFiltro })
  const [linhas, setLinhas] = useState<MarcaLinha[] | null>(null)
  const [total, setTotal] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [editar, setEditar] = useState<MarcaLinha | null>(null)
  const [nome, setNome] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erroEditar, setErroEditar] = useState<string | null>(null)
  const [excluir, setExcluir] = useState<MarcaLinha | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const carregar = useCallback(async () => {
    try {
      let q = supabase.from('marcas').select('*, produto_marcas(count)', { count: 'exact' }).order('nome')
      const padrao = padraoBusca(busca)
      if (padrao) q = q.ilike('nome', padrao)
      if (!inativos) q = q.eq('ativo', true)
      const { data, error, count } = await q.range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)
      if (error) throw error
      setLinhas(data as MarcaLinha[])
      setTotal(count ?? 0)
      setErro(null)
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }, [busca, inativos, pagina])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!editar) return
    if (!nome.trim()) {
      setErroEditar('Informe o nome da marca.')
      return
    }
    setSalvando(true)
    setErroEditar(null)
    try {
      const { error } = await supabase.from('marcas').update({ nome: nome.trim(), ativo }).eq('id', editar.id)
      if (error) throw error
      avisar('Marca salva.')
      setEditar(null)
      void carregar()
    } catch (er) {
      setErroEditar(mensagemErro(er))
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarExclusao() {
    if (!excluir) return
    setExcluindo(true)
    try {
      const { data, error } = await supabase.from('marcas').delete().eq('id', excluir.id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('sem permissão')
      avisar('Marca excluída.')
      setExcluir(null)
      void carregar()
    } catch (e) {
      avisar(mensagemErro(e), 'erro')
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <div className="pagina">
      <div className="pagina-cabecalho">
        <div>
          <h1>Marcas</h1>
          <p className="texto-suave">Para incluir uma marca em um produto, edite o produto.</p>
        </div>
      </div>
      <BarraBusca
        id="busca-marcas"
        texto={texto}
        aoMudar={setTexto}
        inativos={inativos}
        aoMudarInativos={setInativos}
        placeholder="Nome da marca"
      />
      {erro && <MensagemErro texto={erro} aoTentarDeNovo={() => void carregar()} />}
      {!linhas && !erro && <Carregando />}
      {linhas && linhas.length === 0 && <Vazio>Nenhuma marca encontrada.</Vazio>}
      {linhas && linhas.length > 0 && (
        <>
          <div className="tabela-container">
            <table className="tabela tabela-responsiva">
              <thead>
                <tr>
                  <th>Marca</th>
                  <th className="num">Produtos</th>
                  {podeEditar && (
                    <th>
                      <span className="sr-only">Ações</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {linhas.map((m) => (
                  <tr key={m.id} className={m.ativo ? undefined : 'linha-inativa'}>
                    <td data-rotulo="Marca">
                      <strong>{m.nome}</strong> {!m.ativo && <span className="selo">Inativa</span>}
                    </td>
                    <td data-rotulo="Produtos" className="num">
                      {m.produto_marcas[0]?.count ?? 0}
                    </td>
                    {podeEditar && (
                      <td className="acoes-linha">
                        <button
                          type="button"
                          className="botao-link"
                          onClick={() => {
                            setEditar(m)
                            setNome(m.nome)
                            setAtivo(m.ativo)
                            setErroEditar(null)
                          }}
                        >
                          Editar
                        </button>
                        {ehAdmin && (
                          <button type="button" className="botao-link texto-perigo" onClick={() => setExcluir(m)}>
                            Excluir
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacao pagina={pagina} porPagina={POR_PAGINA} total={total} aoMudar={setPagina} />
        </>
      )}
      <Modal aberto={editar !== null} titulo="Editar marca" aoFechar={() => setEditar(null)}>
        <form onSubmit={salvar} className="formulario">
          <div className="campo">
            <label htmlFor="marca-nome">Nome</label>
            <input id="marca-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} required />
          </div>
          <label className="caixa-marcar">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Marca ativa
          </label>
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
      <Confirmar
        aberto={excluir !== null}
        titulo="Excluir marca"
        mensagem={
          <>
            Excluir a marca <strong>{excluir?.nome}</strong>? Só é possível excluir marcas que não estejam em nenhum
            produto. Caso contrário, desative a marca.
          </>
        }
        textoConfirmar="Excluir"
        perigoso
        ocupado={excluindo}
        aoConfirmar={() => void confirmarExclusao()}
        aoCancelar={() => setExcluir(null)}
      />
    </div>
  )
}
