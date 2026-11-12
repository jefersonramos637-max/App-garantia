import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Cliente, Marca } from '../lib/supabase'
import { mensagemErro } from '../lib/erros'
import { ORIGENS } from '../lib/constantes'
import type { Origem } from '../lib/constantes'
import { normalizarBusca, padraoBusca } from '../lib/formato'
import { Modal } from './Modal'
import { Autocompletar } from './Autocompletar'
import { Campo, Carregando, MensagemErro } from './Comuns'

export const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
]

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

interface PropsCliente {
  aberto: boolean
  cliente: Cliente | null
  textoInicial?: string
  aoFechar: () => void
  aoSalvar: (cliente: Cliente) => void
}

export function FormCliente({ aberto, cliente, textoInicial, aoFechar, aoSalvar }: PropsCliente) {
  const [codigo, setCodigo] = useState('')
  const [nome, setNome] = useState('')
  const [documento, setDocumento] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    const inicial = (textoInicial ?? '').trim()
    const pareceCodigo = /^[\d.\-/]+$/.test(inicial)
    setCodigo(cliente?.codigo ?? (pareceCodigo ? inicial : ''))
    setNome(cliente?.nome ?? (pareceCodigo ? '' : inicial))
    setDocumento(cliente?.documento ?? '')
    setCidade(cliente?.cidade ?? '')
    setUf(cliente?.uf ?? '')
    setTelefone(cliente?.telefone ?? '')
    setAtivo(cliente?.ativo ?? true)
    setErro(null)
  }, [aberto, cliente, textoInicial])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!codigo.trim() || !nome.trim()) {
      setErro('Preencha o código e o nome do cliente.')
      return
    }
    setSalvando(true)
    const dados = {
      codigo: codigo.trim(),
      nome: nome.trim(),
      documento: documento.trim() || null,
      cidade: cidade.trim() || null,
      uf: uf || null,
      telefone: telefone.trim() || null,
      ativo,
    }
    try {
      const resposta = cliente
        ? await supabase.from('clientes').update(dados).eq('id', cliente.id).select().single()
        : await supabase.from('clientes').insert(dados).select().single()
      if (resposta.error) throw resposta.error
      aoSalvar(resposta.data)
    } catch (er) {
      setErro(mensagemErro(er))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal aberto={aberto} titulo={cliente ? 'Editar cliente' : 'Novo cliente'} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="formulario">
        <div className="grade-campos">
          <Campo rotulo="Código" htmlFor="cli-codigo" obrigatorio>
            <input id="cli-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={60} required />
          </Campo>
          <Campo rotulo="Nome / razão social" htmlFor="cli-nome" obrigatorio>
            <input id="cli-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} required />
          </Campo>
          <Campo rotulo="CPF / CNPJ" htmlFor="cli-doc">
            <input id="cli-doc" value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={30} />
          </Campo>
          <Campo rotulo="Telefone" htmlFor="cli-tel">
            <input id="cli-tel" type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={40} />
          </Campo>
          <Campo rotulo="Cidade" htmlFor="cli-cidade">
            <input id="cli-cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={100} />
          </Campo>
          <Campo rotulo="UF" htmlFor="cli-uf">
            <select id="cli-uf" value={uf} onChange={(e) => setUf(e.target.value)}>
              <option value="">—</option>
              {UFS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        {cliente && (
          <label className="caixa-marcar">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Cliente ativo
            (inativos não aparecem para novas garantias)
          </label>
        )}
        {erro && <MensagemErro texto={erro} />}
        <div className="acoes-formulario">
          <button type="button" className="botao botao-secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" className="botao" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar cliente'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Produto (com as várias marcas)
// ---------------------------------------------------------------------------

interface MarcaNoFormulario {
  nome: string
  origem: Origem | ''
  referencia: string
  ativo: boolean
  existente: boolean
}

export interface ProdutoSalvo {
  id: number
  codigo: string | null
  descricao: string
}

interface PropsProduto {
  aberto: boolean
  produtoId: number | null
  textoInicial?: string
  aoFechar: () => void
  aoSalvar: (produto: ProdutoSalvo) => void
}

export async function buscarMarcas(termo: string): Promise<Marca[]> {
  let q = supabase.from('marcas').select('*').eq('ativo', true).order('nome').limit(20)
  const padrao = padraoBusca(termo)
  if (padrao) q = q.ilike('nome', padrao)
  const { data, error } = await q
  if (error) throw error
  return data
}

export function FormProduto({ aberto, produtoId, textoInicial, aoFechar, aoSalvar }: PropsProduto) {
  const [codigo, setCodigo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [marcas, setMarcas] = useState<MarcaNoFormulario[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setErro(null)
    if (produtoId === null) {
      setCodigo('')
      setDescricao((textoInicial ?? '').trim())
      setAtivo(true)
      setMarcas([])
      return
    }
    let cancelado = false
    setCarregando(true)
    supabase
      .from('produtos')
      .select('id, codigo, descricao, ativo, produto_marcas(origem_padrao, referencia, ativo, marcas(nome))')
      .eq('id', produtoId)
      .single()
      .then(({ data, error }) => {
        if (cancelado) return
        setCarregando(false)
        if (error) {
          setErro(mensagemErro(error))
          return
        }
        setCodigo(data.codigo ?? '')
        setDescricao(data.descricao)
        setAtivo(data.ativo)
        setMarcas(
          data.produto_marcas
            .map((pm) => ({
              nome: pm.marcas?.nome ?? '',
              origem: (pm.origem_padrao ?? '') as Origem | '',
              referencia: pm.referencia ?? '',
              ativo: pm.ativo,
              existente: true,
            }))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
        )
      })
    return () => {
      cancelado = true
    }
  }, [aberto, produtoId, textoInicial])

  function adicionarMarca(nome: string) {
    const limpo = nome.replace(/\s+/g, ' ').trim()
    if (!limpo) return
    if (limpo.length > 120) {
      setErro('Nome de marca muito longo (máximo 120 caracteres).')
      return
    }
    setMarcas((lista) => {
      const existente = lista.find((m) => normalizarBusca(m.nome) === normalizarBusca(limpo))
      if (existente) return lista.map((m) => (m === existente ? { ...m, ativo: true } : m))
      return [...lista, { nome: limpo, origem: '', referencia: '', ativo: true, existente: false }]
    })
  }

  function alterarMarca(indice: number, mudancas: Partial<MarcaNoFormulario>) {
    setMarcas((lista) => lista.map((m, i) => (i === indice ? { ...m, ...mudancas } : m)))
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!descricao.trim()) {
      setErro('Informe a descrição do produto.')
      return
    }
    setSalvando(true)
    try {
      const { data: id, error } = await supabase.rpc('salvar_produto', {
        p_id: produtoId ?? undefined,
        p_codigo: codigo.trim(),
        p_descricao: descricao.trim(),
        p_ativo: ativo,
        p_marcas: marcas.map((m) => ({
          nome: m.nome,
          origem: m.origem || null,
          referencia: m.referencia.trim() || null,
          ativo: m.ativo,
        })),
      })
      if (error) throw error
      const { data: produto, error: erroProduto } = await supabase
        .from('produtos')
        .select('id, codigo, descricao')
        .eq('id', id)
        .single()
      if (erroProduto) throw erroProduto
      aoSalvar(produto)
    } catch (er) {
      setErro(mensagemErro(er))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal aberto={aberto} titulo={produtoId ? 'Editar produto' : 'Novo produto'} aoFechar={aoFechar} largo>
      {carregando ? (
        <Carregando />
      ) : (
        <form onSubmit={salvar} className="formulario">
          <div className="grade-campos">
            <Campo rotulo="Código" htmlFor="prod-codigo" ajuda="Opcional, mas recomendado.">
              <input id="prod-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={60} />
            </Campo>
            <Campo rotulo="Descrição da peça" htmlFor="prod-descricao" obrigatorio>
              <input
                id="prod-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                maxLength={300}
                required
              />
            </Campo>
          </div>

          <fieldset className="grupo">
            <legend>Marcas em que este produto é vendido</legend>
            {marcas.length === 0 && (
              <p className="texto-suave">Nenhuma marca ainda. Para registrar garantias, o produto precisa de pelo menos uma marca.</p>
            )}
            {marcas.length > 0 && (
              <div className="tabela-container">
                <table className="tabela tabela-simples tabela-marcas">
                  <thead>
                    <tr>
                      <th>Marca</th>
                      <th>Origem padrão</th>
                      <th>Ref. fabricante</th>
                      <th>Ativa</th>
                      <th>
                        <span className="sr-only">Remover</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {marcas.map((m, i) => (
                      <tr key={normalizarBusca(m.nome)} className={m.ativo ? undefined : 'linha-inativa'}>
                        <td>{m.nome}</td>
                        <td>
                          <select
                            aria-label={`Origem padrão de ${m.nome}`}
                            value={m.origem}
                            onChange={(e) => alterarMarca(i, { origem: e.target.value as Origem | '' })}
                          >
                            <option value="">Não definida</option>
                            {ORIGENS.map((o) => (
                              <option key={o.valor} value={o.valor}>
                                {o.rotulo}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            aria-label={`Referência do fabricante para ${m.nome}`}
                            value={m.referencia}
                            maxLength={80}
                            onChange={(e) => alterarMarca(i, { referencia: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`${m.nome} ativa`}
                            checked={m.ativo}
                            onChange={(e) => alterarMarca(i, { ativo: e.target.checked })}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="botao-link texto-perigo"
                            onClick={() => setMarcas((lista) => lista.filter((_, j) => j !== i))}
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Campo rotulo="Adicionar marca" htmlFor="prod-nova-marca" ajuda="Busque uma marca existente ou cadastre uma nova.">
              <Autocompletar<Marca>
                id="prod-nova-marca"
                valor={null}
                aoSelecionar={(m) => m && adicionarMarca(m.nome)}
                buscar={buscarMarcas}
                rotulo={(m) => m.nome}
                chave={(m) => m.id}
                placeholder="Digite o nome da marca…"
                acaoExtra={{
                  texto: '+ Cadastrar como nova marca',
                  aoClicar: (termo) => adicionarMarca(termo),
                }}
              />
            </Campo>
            <small className="ajuda">
              Marcas removidas que já têm garantias registradas não são apagadas — ficam apenas inativas.
            </small>
          </fieldset>

          {produtoId !== null && (
            <label className="caixa-marcar">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Produto ativo
              (inativos não aparecem para novas garantias)
            </label>
          )}
          {erro && <MensagemErro texto={erro} />}
          <div className="acoes-formulario">
            <button type="button" className="botao botao-secundario" onClick={aoFechar} disabled={salvando}>
              Cancelar
            </button>
            <button type="submit" className="botao" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar produto'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
