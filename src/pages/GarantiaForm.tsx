import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Cliente, Empresa } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAvisos } from '../components/Avisos'
import { useAvisoSaida } from '../lib/hooks'
import { mensagemErro } from '../lib/erros'
import { ORIGENS, RESOLUCOES, STATUS, ehStatus } from '../lib/constantes'
import type { Origem, Status } from '../lib/constantes'
import { formatarMoeda, hojeISO, lerNumeroBR, numeroGarantia, numeroParaCampo, padraoBusca } from '../lib/formato'
import type { Json } from '../lib/database.types'
import { Autocompletar } from '../components/Autocompletar'
import { Campo, Carregando, MensagemErro } from '../components/Comuns'
import { FormCliente, FormProduto } from '../components/Formularios'
import type { ProdutoSalvo } from '../components/Formularios'

type ClienteOpcao = Pick<Cliente, 'id' | 'codigo' | 'nome' | 'cidade' | 'uf'>
type ProdutoOpcao = ProdutoSalvo

interface MarcaDoProduto {
  marca_id: number
  nome: string
  origem_padrao: string | null
  referencia: string | null
  ativo: boolean
}

type Erros = Partial<Record<string, string>>

/** Um produto dentro da garantia. */
interface ItemForm {
  chave: number
  produto: ProdutoOpcao | null
  marcas: MarcaDoProduto[]
  carregandoMarcas: boolean
  marcaId: number | null
  origem: Origem | ''
  origemSugerida: boolean
  quantidade: string
  valor: string
}

const MAXIMO_ITENS = 50
let proximaChave = 1

function itemVazio(): ItemForm {
  return {
    chave: proximaChave++,
    produto: null,
    marcas: [],
    carregandoMarcas: false,
    marcaId: null,
    origem: '',
    origemSugerida: false,
    quantidade: '1',
    valor: '',
  }
}

async function carregarMarcasDoProduto(produtoId: number, manterMarcaId: number | null): Promise<MarcaDoProduto[]> {
  const { data, error } = await supabase
    .from('produto_marcas')
    .select('marca_id, origem_padrao, referencia, ativo, marcas(nome, ativo)')
    .eq('produto_id', produtoId)
  if (error) throw error
  return data
    .map((pm) => ({
      marca_id: pm.marca_id,
      nome: pm.marcas?.nome ?? '?',
      origem_padrao: pm.origem_padrao,
      referencia: pm.referencia,
      ativo: pm.ativo && (pm.marcas?.ativo ?? false),
    }))
    .filter((m) => m.ativo || m.marca_id === manterMarcaId)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function totalDoItem(i: ItemForm): number | null {
  const q = lerNumeroBR(i.quantidade)
  const v = lerNumeroBR(i.valor)
  if (q === null || v === null || Number.isNaN(q) || Number.isNaN(v)) return null
  return q * v
}

async function buscarClientes(termo: string): Promise<ClienteOpcao[]> {
  let q = supabase.from('clientes').select('id, codigo, nome, cidade, uf').eq('ativo', true).order('nome').limit(20)
  const padrao = padraoBusca(termo)
  if (padrao) q = q.ilike('busca', padrao)
  const { data, error } = await q
  if (error) throw error
  const t = termo.trim().toLowerCase()
  // Código exato aparece primeiro.
  return [...data].sort((a, b) => Number(b.codigo.toLowerCase() === t) - Number(a.codigo.toLowerCase() === t))
}

async function buscarProdutos(termo: string): Promise<ProdutoOpcao[]> {
  let q = supabase.from('produtos').select('id, codigo, descricao').eq('ativo', true).order('descricao').limit(20)
  const padrao = padraoBusca(termo)
  if (padrao) q = q.ilike('busca', padrao)
  const { data, error } = await q
  if (error) throw error
  const t = termo.trim().toLowerCase()
  return [...data].sort(
    (a, b) => Number((b.codigo ?? '').toLowerCase() === t) - Number((a.codigo ?? '').toLowerCase() === t),
  )
}

export function GarantiaForm() {
  const { id: idParam } = useParams()
  const idGarantia = idParam ? Number(idParam) : null
  const editando = idGarantia !== null
  const navegar = useNavigate()
  const { podeEditar } = useAuth()
  const { avisar } = useAvisos()

  const [carregando, setCarregando] = useState(editando)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [empresas, setEmpresas] = useState<Empresa[]>([])

  const [empresaId, setEmpresaId] = useState<number | null>(null)
  const [cliente, setCliente] = useState<ClienteOpcao | null>(null)
  const [itens, setItens] = useState<ItemForm[]>(() => [itemVazio()])
  const [status, setStatus] = useState<Status>('ABERTA')
  const [resolucao, setResolucao] = useState('')
  const [dataAbertura, setDataAbertura] = useState(hojeISO())
  const [nfVenda, setNfVenda] = useState('')
  const [dataVenda, setDataVenda] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [nfCompra, setNfCompra] = useState('')
  const [protocolo, setProtocolo] = useState('')
  const [defeito, setDefeito] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null)

  const [erros, setErros] = useState<Erros>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [alterado, setAlterado] = useState(false)
  const [modalCliente, setModalCliente] = useState<{ aberto: boolean; texto: string }>({ aberto: false, texto: '' })
  const [modalProduto, setModalProduto] = useState<{ aberto: boolean; chave: number | null; id: number | null; texto: string }>({
    aberto: false,
    chave: null,
    id: null,
    texto: '',
  })

  useAvisoSaida(alterado && !salvando)

  /** Marca o formulário como alterado e apaga o erro do campo corrigido. */
  const marcar = (...campos: string[]) => {
    setAlterado(true)
    if (campos.length) {
      setErros((atual) => {
        if (!campos.some((c) => atual[c])) return atual
        const novo = { ...atual }
        for (const c of campos) delete novo[c]
        return novo
      })
    }
  }

  // Empresas
  useEffect(() => {
    supabase
      .from('empresas')
      .select('*')
      .eq('ativo', true)
      .order('id')
      .then(({ data, error }) => {
        if (error) setErroCarga(mensagemErro(error))
        else setEmpresas(data)
      })
  }, [])

  // Edição: carrega a garantia e os seus produtos
  useEffect(() => {
    if (!editando || idGarantia === null) return
    let cancelado = false
    ;(async () => {
      try {
        if (!Number.isSafeInteger(idGarantia) || idGarantia <= 0) throw new Error('Garantia não encontrada.')
        const [gar, its] = await Promise.all([
          supabase.from('vw_garantias').select('*').eq('id', idGarantia).maybeSingle(),
          supabase
            .from('garantia_itens')
            .select('id, ordem, produto_id, marca_id, origem, quantidade, valor_unitario, produto_marcas(produtos(id, codigo, descricao))')
            .eq('garantia_id', idGarantia)
            .order('ordem')
            .order('id'),
        ])
        if (gar.error) throw gar.error
        if (its.error) throw its.error
        const g = gar.data
        if (!g) throw new Error('Garantia não encontrada.')
        const carregados: ItemForm[] = await Promise.all(
          its.data.map(async (it) => {
            const prod = it.produto_marcas?.produtos
            const marcas = await carregarMarcasDoProduto(it.produto_id, it.marca_id)
            return {
              chave: proximaChave++,
              produto: prod ? { id: prod.id, codigo: prod.codigo, descricao: prod.descricao } : null,
              marcas,
              carregandoMarcas: false,
              marcaId: it.marca_id,
              origem: (it.origem ?? '') as Origem | '',
              origemSugerida: false,
              quantidade: numeroParaCampo(it.quantidade),
              valor: numeroParaCampo(it.valor_unitario),
            }
          }),
        )
        if (cancelado) return
        setItens(carregados.length ? carregados : [itemVazio()])
        setEmpresaId(g.empresa_id)
        setCliente({ id: g.cliente_id!, codigo: g.cliente_codigo ?? '', nome: g.cliente_nome ?? '', cidade: null, uf: null })
        setStatus(ehStatus(g.status) ? g.status : 'ABERTA')
        setResolucao(g.resolucao ?? '')
        setDataAbertura(g.data_abertura ?? hojeISO())
        setNfVenda(g.nota_fiscal_venda ?? '')
        setDataVenda(g.data_venda ?? '')
        setFornecedor(g.fornecedor ?? '')
        setNfCompra(g.nota_fiscal_compra ?? '')
        setProtocolo(g.protocolo_fornecedor ?? '')
        setDefeito(g.defeito ?? '')
        setObservacoes(g.observacoes ?? '')
        setAtualizadoEm(g.atualizado_em)
      } catch (e) {
        if (!cancelado) setErroCarga(e instanceof Error && e.message.startsWith('Garantia') ? e.message : mensagemErro(e))
      } finally {
        if (!cancelado) setCarregando(false)
      }
    })()
    return () => {
      cancelado = true
    }
  }, [editando, idGarantia])

  // ---------- Produtos da garantia ----------
  function alterarItem(chave: number, mudancas: Partial<ItemForm>, ...camposComErro: string[]) {
    setItens((lista) => lista.map((i) => (i.chave === chave ? { ...i, ...mudancas } : i)))
    marcar(...camposComErro.map((c) => `i${chave}.${c}`))
  }

  function escolherMarca(chave: number, id: number | null, lista: MarcaDoProduto[]) {
    const m = lista.find((x) => x.marca_id === id)
    setItens((todos) =>
      todos.map((i) => {
        if (i.chave !== chave) return i
        if (m?.origem_padrao === 'NACIONAL' || m?.origem_padrao === 'IMPORTADO') {
          return { ...i, marcaId: id, origem: m.origem_padrao, origemSugerida: true }
        }
        return { ...i, marcaId: id, origem: i.origemSugerida ? '' : i.origem, origemSugerida: false }
      }),
    )
    marcar(`i${chave}.marca`, `i${chave}.origem`)
  }

  async function escolherProduto(chave: number, p: ProdutoOpcao | null) {
    setItens((todos) =>
      todos.map((i) =>
        i.chave === chave
          ? {
              ...i,
              produto: p,
              marcaId: null,
              marcas: [],
              carregandoMarcas: p !== null,
              origem: i.origemSugerida ? '' : i.origem,
              origemSugerida: false,
            }
          : i,
      ),
    )
    marcar(`i${chave}.produto`, `i${chave}.marca`)
    if (!p) return
    try {
      const lista = await carregarMarcasDoProduto(p.id, null)
      setItens((todos) => todos.map((i) => (i.chave === chave ? { ...i, marcas: lista, carregandoMarcas: false } : i)))
      if (lista.length === 1) escolherMarca(chave, lista[0].marca_id, lista)
    } catch (e) {
      setErroGeral(mensagemErro(e))
      setItens((todos) => todos.map((i) => (i.chave === chave ? { ...i, carregandoMarcas: false } : i)))
    }
  }

  async function recarregarMarcas(chave: number, produtoId: number) {
    const atual = itens.find((i) => i.chave === chave)
    try {
      const lista = await carregarMarcasDoProduto(produtoId, atual?.marcaId ?? null)
      setItens((todos) => todos.map((i) => (i.chave === chave ? { ...i, marcas: lista } : i)))
      if (atual && !atual.marcaId && lista.length === 1) escolherMarca(chave, lista[0].marca_id, lista)
    } catch (e) {
      setErroGeral(mensagemErro(e))
    }
  }

  function adicionarItem() {
    if (itens.length >= MAXIMO_ITENS) return
    setItens((lista) => [...lista, itemVazio()])
    marcar()
  }

  function removerItem(chave: number) {
    setItens((lista) => (lista.length > 1 ? lista.filter((i) => i.chave !== chave) : lista))
    marcar()
  }

  const totalGeral = useMemo(() => {
    const somas = itens.map(totalDoItem).filter((v): v is number => v !== null)
    return somas.length ? somas.reduce((a, b) => a + b, 0) : null
  }, [itens])

  function validar(): Erros {
    const e: Erros = {}
    if (!empresaId) e.empresa = 'Escolha a empresa (Lojão dos Tratores ou LL Tratores).'
    if (!cliente) e.cliente = 'Selecione o cliente.'
    for (const i of itens) {
      const k = (c: string) => `i${i.chave}.${c}`
      if (!i.produto) e[k('produto')] = 'Selecione a peça.'
      if (i.produto && !i.marcaId) e[k('marca')] = 'Selecione a marca.'
      if (!i.origem) e[k('origem')] = 'Informe se o produto é nacional ou importado.'
      const q = lerNumeroBR(i.quantidade)
      if (q === null) e[k('quantidade')] = 'Informe a quantidade.'
      else if (Number.isNaN(q) || q <= 0) e[k('quantidade')] = 'Quantidade inválida.'
      else if (q > 1_000_000) e[k('quantidade')] = 'Quantidade muito alta.'
      else if (Math.round(q * 1000) / 1000 !== q) e[k('quantidade')] = 'Use no máximo 3 casas decimais.'
      const v = lerNumeroBR(i.valor)
      if (v !== null && (Number.isNaN(v) || v < 0 || v > 100_000_000)) e[k('valor')] = 'Valor inválido. Exemplo: 1.234,56'
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataAbertura)) e.dataAbertura = 'Informe a data de abertura.'
    else if (dataAbertura > hojeISO()) e.dataAbertura = 'A data de abertura não pode ser no futuro.'
    if (dataVenda && dataAbertura && dataVenda > dataAbertura) e.dataVenda = 'A venda não pode ser depois da abertura da garantia.'
    if (defeito.trim().length < 3) e.defeito = 'Descreva o defeito (mínimo 3 caracteres).'
    return e
  }

  async function salvar(ev: FormEvent) {
    ev.preventDefault()
    setErroGeral(null)
    const encontrados = validar()
    setErros(encontrados)
    if (Object.keys(encontrados).length > 0) {
      setErroGeral('Corrija os campos destacados.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setSalvando(true)
    const dados: Json = {
      empresa_id: empresaId!,
      cliente_id: cliente!.id,
      ...(editando ? {} : { status }),
      resolucao: resolucao || null,
      data_abertura: dataAbertura,
      nota_fiscal_venda: nfVenda.trim() || null,
      data_venda: dataVenda || null,
      fornecedor: fornecedor.trim() || null,
      nota_fiscal_compra: nfCompra.trim() || null,
      protocolo_fornecedor: protocolo.trim() || null,
      defeito: defeito.trim(),
      observacoes: observacoes.trim() || null,
    }
    const lista: Json = itens.map((i) => ({
      produto_id: i.produto!.id,
      marca_id: i.marcaId!,
      origem: i.origem,
      quantidade: lerNumeroBR(i.quantidade)!,
      valor_unitario: lerNumeroBR(i.valor),
    }))
    try {
      const { data: id, error } = await supabase.rpc('salvar_garantia', {
        p_dados: dados,
        p_itens: lista,
        p_id: editando && idGarantia !== null ? idGarantia : undefined,
        p_atualizado_em: editando && atualizadoEm ? atualizadoEm : undefined,
      })
      if (error) throw error
      setAlterado(false)
      if (editando) {
        avisar(`Garantia Nº ${numeroGarantia(id)} atualizada.`)
        navegar(`/garantias/${id}`)
      } else {
        avisar(`Garantia Nº ${numeroGarantia(id)} registrada com sucesso.`)
        navegar(`/garantias/${id}`, { replace: true })
      }
    } catch (e) {
      setErroGeral(mensagemErro(e))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSalvando(false)
    }
  }

  if (!podeEditar) {
    return (
      <div className="pagina">
        <MensagemErro texto="Seu usuário tem acesso somente para consulta." />
      </div>
    )
  }
  if (carregando) return <Carregando />
  if (erroCarga) {
    return (
      <div className="pagina">
        <MensagemErro texto={erroCarga} />
        <Link to="/garantias">Voltar para a lista</Link>
      </div>
    )
  }

  return (
    <div className="pagina pagina-formulario">
      <div className="pagina-cabecalho">
        <div>
          <h1>{editando ? `Editar garantia Nº ${numeroGarantia(idGarantia)}` : 'Nova garantia'}</h1>
          <p className="texto-suave">Campos com * são obrigatórios.</p>
        </div>
      </div>

      {erroGeral && <MensagemErro texto={erroGeral} />}

      <form onSubmit={salvar} className="formulario" noValidate>
        <fieldset className="grupo">
          <legend>Empresa *</legend>
          <div className="opcoes-cartao" role="radiogroup" aria-label="Empresa">
            {empresas.map((e) => (
              <label key={e.id} className={empresaId === e.id ? 'opcao-cartao selecionada' : 'opcao-cartao'}>
                <input
                  type="radio"
                  name="empresa"
                  value={e.id}
                  checked={empresaId === e.id}
                  onChange={() => {
                    setEmpresaId(e.id)
                    marcar('empresa')
                  }}
                />
                <strong>{e.nome}</strong>
                <small>{e.tipo === 'MATRIZ' ? 'Empresa principal (matriz)' : 'Filial'}</small>
              </label>
            ))}
          </div>
          {erros.empresa && <small className="erro-campo">{erros.empresa}</small>}
        </fieldset>

        <fieldset className="grupo">
          <legend>Cliente</legend>
          <Campo rotulo="Cliente" htmlFor="cliente" obrigatorio erro={erros.cliente} ajuda="Busque pelo código ou nome.">
            <Autocompletar<ClienteOpcao>
              id="cliente"
              valor={cliente}
              aoSelecionar={(c) => {
                setCliente(c)
                marcar('cliente')
              }}
              buscar={buscarClientes}
              rotulo={(c) => `${c.codigo} — ${c.nome}`}
              detalhe={(c) => [c.cidade, c.uf].filter(Boolean).join(' / ') || null}
              chave={(c) => c.id}
              placeholder="Código ou nome do cliente"
              invalido={!!erros.cliente}
              acaoExtra={{ texto: '+ Cadastrar novo cliente', aoClicar: (t) => setModalCliente({ aberto: true, texto: t }) }}
            />
          </Campo>
        </fieldset>

        <fieldset className="grupo">
          <legend>Produtos da garantia ({itens.length})</legend>
          {itens.map((item, indice) => {
            const sufixo = indice + 1
            const k = (c: string) => `i${item.chave}.${c}`
            const marcaSelecionada = item.marcas.find((m) => m.marca_id === item.marcaId)
            const totalItem = totalDoItem(item)
            return (
              <div className="item-garantia" key={item.chave} role="group" aria-label={`Produto ${sufixo}`}>
                <div className="item-garantia-cabecalho">
                  <strong>Produto {sufixo}</strong>
                  {itens.length > 1 && (
                    <button type="button" className="botao-link texto-perigo" onClick={() => removerItem(item.chave)}>
                      Remover
                    </button>
                  )}
                </div>

                <Campo
                  rotulo="Peça / produto"
                  htmlFor={`produto-${item.chave}`}
                  obrigatorio
                  erro={erros[k('produto')]}
                  ajuda="Busque pelo código ou descrição."
                >
                  <Autocompletar<ProdutoOpcao>
                    id={`produto-${item.chave}`}
                    valor={item.produto}
                    aoSelecionar={(p) => void escolherProduto(item.chave, p)}
                    buscar={buscarProdutos}
                    rotulo={(p) => (p.codigo ? `${p.codigo} — ${p.descricao}` : p.descricao)}
                    chave={(p) => p.id}
                    placeholder="Código ou descrição da peça"
                    invalido={!!erros[k('produto')]}
                    acaoExtra={{
                      texto: '+ Cadastrar novo produto',
                      aoClicar: (t) => setModalProduto({ aberto: true, chave: item.chave, id: null, texto: t }),
                    }}
                  />
                </Campo>

                {item.produto && (
                  <Campo rotulo="Marca" htmlFor={`marca-${item.chave}`} obrigatorio erro={erros[k('marca')]}>
                    {item.carregandoMarcas ? (
                      <Carregando texto="Carregando marcas…" />
                    ) : item.marcas.length === 0 ? (
                      <div className="alerta alerta-info">
                        Este produto ainda não tem marcas cadastradas.{' '}
                        <button
                          type="button"
                          className="botao-link"
                          onClick={() => setModalProduto({ aberto: true, chave: item.chave, id: item.produto!.id, texto: '' })}
                        >
                          Adicionar marca ao produto
                        </button>
                      </div>
                    ) : (
                      <div className="linha-campo">
                        <select
                          id={`marca-${item.chave}`}
                          value={item.marcaId ?? ''}
                          aria-invalid={!!erros[k('marca')] || undefined}
                          onChange={(e) => escolherMarca(item.chave, e.target.value ? Number(e.target.value) : null, item.marcas)}
                        >
                          <option value="">Selecione a marca…</option>
                          {item.marcas.map((m) => (
                            <option key={m.marca_id} value={m.marca_id}>
                              {m.nome}
                              {m.referencia ? ` (ref. ${m.referencia})` : ''}
                              {m.ativo ? '' : ' — inativa'}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="botao botao-secundario botao-pequeno"
                          onClick={() => setModalProduto({ aberto: true, chave: item.chave, id: item.produto!.id, texto: '' })}
                        >
                          Outra marca…
                        </button>
                      </div>
                    )}
                  </Campo>
                )}

                <fieldset className="grupo-interno">
                  <legend>
                    Origem do produto <span className="obrigatorio">*</span>
                  </legend>
                  <div className="opcoes-linha" role="radiogroup" aria-label={`Origem do produto ${sufixo}`}>
                    {ORIGENS.map((o) => (
                      <label key={o.valor} className={item.origem === o.valor ? 'opcao-pilula selecionada' : 'opcao-pilula'}>
                        <input
                          type="radio"
                          name={`origem-${item.chave}`}
                          value={o.valor}
                          checked={item.origem === o.valor}
                          onChange={() => alterarItem(item.chave, { origem: o.valor, origemSugerida: false }, 'origem')}
                        />
                        {o.rotulo}
                      </label>
                    ))}
                  </div>
                  {item.origemSugerida && marcaSelecionada && (
                    <small className="ajuda">Preenchido pelo cadastro da marca {marcaSelecionada.nome}. Confira.</small>
                  )}
                  {erros[k('origem')] && <small className="erro-campo">{erros[k('origem')]}</small>}
                </fieldset>

                <div className="grade-campos">
                  <Campo rotulo="Quantidade" htmlFor={`quantidade-${item.chave}`} obrigatorio erro={erros[k('quantidade')]}>
                    <input
                      id={`quantidade-${item.chave}`}
                      inputMode="decimal"
                      value={item.quantidade}
                      onChange={(e) => alterarItem(item.chave, { quantidade: e.target.value }, 'quantidade')}
                      aria-invalid={!!erros[k('quantidade')] || undefined}
                    />
                  </Campo>
                  <Campo
                    rotulo="Valor unitário (R$)"
                    htmlFor={`valor-${item.chave}`}
                    erro={erros[k('valor')]}
                    ajuda={totalItem !== null ? `Subtotal: ${formatarMoeda(totalItem)}` : 'Opcional'}
                  >
                    <input
                      id={`valor-${item.chave}`}
                      inputMode="decimal"
                      placeholder="0,00"
                      value={item.valor}
                      onChange={(e) => alterarItem(item.chave, { valor: e.target.value }, 'valor')}
                      aria-invalid={!!erros[k('valor')] || undefined}
                    />
                  </Campo>
                </div>
              </div>
            )
          })}

          <div className="item-garantia-rodape">
            <button type="button" className="botao botao-secundario" onClick={adicionarItem} disabled={itens.length >= MAXIMO_ITENS}>
              + Adicionar produto
            </button>
            {totalGeral !== null && (
              <span className="total-garantia">
                Total da garantia: <strong>{formatarMoeda(totalGeral)}</strong>
              </span>
            )}
          </div>
        </fieldset>

        <fieldset className="grupo">
          <legend>Defeito</legend>
          <Campo rotulo="Descrição do defeito / reclamação" htmlFor="defeito" obrigatorio erro={erros.defeito}>
            <textarea
              id="defeito"
              rows={4}
              maxLength={4000}
              value={defeito}
              onChange={(e) => {
                setDefeito(e.target.value)
                marcar('defeito')
              }}
              aria-invalid={!!erros.defeito || undefined}
            />
          </Campo>
        </fieldset>

        <fieldset className="grupo">
          <legend>Processo</legend>
          <div className="grade-campos">
            <Campo rotulo="Data de abertura" htmlFor="data-abertura" obrigatorio erro={erros.dataAbertura}>
              <input
                id="data-abertura"
                type="date"
                max={hojeISO()}
                value={dataAbertura}
                onChange={(e) => {
                  setDataAbertura(e.target.value)
                  marcar('dataAbertura', 'dataVenda')
                }}
              />
            </Campo>
            {!editando && (
              <Campo rotulo="Status inicial" htmlFor="status" ajuda="Use outro status só ao cadastrar garantias antigas.">
                <select
                  id="status"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value as Status)
                    marcar()
                  }}
                >
                  {STATUS.map((s) => (
                    <option key={s.valor} value={s.valor}>
                      {s.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
            <Campo rotulo="Resolução" htmlFor="resolucao" ajuda="Preencha quando houver definição.">
              <select
                id="resolucao"
                value={resolucao}
                onChange={(e) => {
                  setResolucao(e.target.value)
                  marcar()
                }}
              >
                <option value="">—</option>
                {RESOLUCOES.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {r.rotulo}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        </fieldset>

        <fieldset className="grupo">
          <legend>Notas fiscais e fornecedor (opcional)</legend>
          <div className="grade-campos">
            <Campo rotulo="NF de venda ao cliente" htmlFor="nf-venda">
              <input id="nf-venda" maxLength={60} value={nfVenda} onChange={(e) => { setNfVenda(e.target.value); marcar() }} />
            </Campo>
            <Campo rotulo="Data da venda" htmlFor="data-venda" erro={erros.dataVenda}>
              <input id="data-venda" type="date" value={dataVenda} onChange={(e) => { setDataVenda(e.target.value); marcar('dataVenda') }} />
            </Campo>
            <Campo rotulo="Fornecedor" htmlFor="fornecedor">
              <input id="fornecedor" maxLength={200} value={fornecedor} onChange={(e) => { setFornecedor(e.target.value); marcar() }} />
            </Campo>
            <Campo rotulo="NF de compra (fornecedor)" htmlFor="nf-compra">
              <input id="nf-compra" maxLength={60} value={nfCompra} onChange={(e) => { setNfCompra(e.target.value); marcar() }} />
            </Campo>
            <Campo rotulo="Protocolo no fornecedor" htmlFor="protocolo">
              <input id="protocolo" maxLength={60} value={protocolo} onChange={(e) => { setProtocolo(e.target.value); marcar() }} />
            </Campo>
          </div>
          <Campo rotulo="Observações" htmlFor="observacoes">
            <textarea
              id="observacoes"
              rows={3}
              maxLength={4000}
              value={observacoes}
              onChange={(e) => {
                setObservacoes(e.target.value)
                marcar()
              }}
            />
          </Campo>
        </fieldset>

        <div className="acoes-formulario acoes-fixas">
          <button
            type="button"
            className="botao botao-secundario"
            onClick={() => navegar(editando ? `/garantias/${idGarantia}` : '/garantias')}
            disabled={salvando}
          >
            Cancelar
          </button>
          <button type="submit" className="botao" disabled={salvando}>
            {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Registrar garantia'}
          </button>
        </div>
      </form>

      <FormCliente
        aberto={modalCliente.aberto}
        cliente={null}
        textoInicial={modalCliente.texto}
        aoFechar={() => setModalCliente({ aberto: false, texto: '' })}
        aoSalvar={(c) => {
          setCliente(c)
          marcar('cliente')
          setModalCliente({ aberto: false, texto: '' })
          avisar(`Cliente ${c.codigo} cadastrado.`)
        }}
      />
      <FormProduto
        aberto={modalProduto.aberto}
        produtoId={modalProduto.id}
        textoInicial={modalProduto.texto}
        aoFechar={() => setModalProduto({ aberto: false, chave: null, id: null, texto: '' })}
        aoSalvar={(p) => {
          const chave = modalProduto.chave
          const mesmoProduto = modalProduto.id !== null
          setModalProduto({ aberto: false, chave: null, id: null, texto: '' })
          avisar('Produto salvo.')
          if (chave === null) return
          if (mesmoProduto) {
            alterarItem(chave, { produto: p })
            void recarregarMarcas(chave, p.id)
          } else {
            void escolherProduto(chave, p)
          }
        }}
      />
    </div>
  )
}
