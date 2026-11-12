import { useCallback, useEffect, useMemo, useState } from 'react'
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
  const [produto, setProduto] = useState<ProdutoOpcao | null>(null)
  const [marcasProduto, setMarcasProduto] = useState<MarcaDoProduto[]>([])
  const [carregandoMarcas, setCarregandoMarcas] = useState(false)
  const [marcaId, setMarcaId] = useState<number | null>(null)
  const [origem, setOrigem] = useState<Origem | ''>('')
  const [origemSugerida, setOrigemSugerida] = useState(false)
  const [quantidade, setQuantidade] = useState('1')
  const [valorUnitario, setValorUnitario] = useState('')
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
  const [modalProduto, setModalProduto] = useState<{ aberto: boolean; id: number | null; texto: string }>({
    aberto: false,
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

  const carregarMarcas = useCallback(async (produtoId: number, manterMarcaId: number | null) => {
    setCarregandoMarcas(true)
    try {
      const { data, error } = await supabase
        .from('produto_marcas')
        .select('marca_id, origem_padrao, referencia, ativo, marcas(nome, ativo)')
        .eq('produto_id', produtoId)
      if (error) throw error
      const lista = data
        .map((pm) => ({
          marca_id: pm.marca_id,
          nome: pm.marcas?.nome ?? '?',
          origem_padrao: pm.origem_padrao,
          referencia: pm.referencia,
          ativo: pm.ativo && (pm.marcas?.ativo ?? false),
        }))
        .filter((m) => m.ativo || m.marca_id === manterMarcaId)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      setMarcasProduto(lista)
      return lista
    } catch (e) {
      setErroGeral(mensagemErro(e))
      setMarcasProduto([])
      return []
    } finally {
      setCarregandoMarcas(false)
    }
  }, [])

  // Edição: carrega a garantia
  useEffect(() => {
    if (!editando || idGarantia === null) return
    let cancelado = false
    ;(async () => {
      try {
        if (!Number.isSafeInteger(idGarantia) || idGarantia <= 0) throw new Error('Garantia não encontrada.')
        const { data: g, error } = await supabase.from('vw_garantias').select('*').eq('id', idGarantia).maybeSingle()
        if (error) throw error
        if (!g) throw new Error('Garantia não encontrada.')
        if (cancelado) return
        setEmpresaId(g.empresa_id)
        setCliente({ id: g.cliente_id!, codigo: g.cliente_codigo ?? '', nome: g.cliente_nome ?? '', cidade: null, uf: null })
        setProduto({ id: g.produto_id!, codigo: g.produto_codigo, descricao: g.produto_descricao ?? '' })
        setMarcaId(g.marca_id)
        setOrigem((g.origem ?? '') as Origem | '')
        setQuantidade(numeroParaCampo(g.quantidade))
        setValorUnitario(numeroParaCampo(g.valor_unitario))
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
        await carregarMarcas(g.produto_id!, g.marca_id)
      } catch (e) {
        if (!cancelado) setErroCarga(e instanceof Error && e.message.startsWith('Garantia') ? e.message : mensagemErro(e))
      } finally {
        if (!cancelado) setCarregando(false)
      }
    })()
    return () => {
      cancelado = true
    }
  }, [editando, idGarantia, carregarMarcas])

  async function escolherProduto(p: ProdutoOpcao | null) {
    setProduto(p)
    setMarcaId(null)
    setMarcasProduto([])
    if (origemSugerida) {
      setOrigem('')
      setOrigemSugerida(false)
    }
    marcar('produto', 'marca')
    if (!p) return
    const lista = await carregarMarcas(p.id, null)
    if (lista.length === 1) escolherMarca(lista[0].marca_id, lista)
  }

  function escolherMarca(id: number | null, lista: MarcaDoProduto[] = marcasProduto) {
    setMarcaId(id)
    marcar('marca')
    const m = lista.find((x) => x.marca_id === id)
    if (m?.origem_padrao === 'NACIONAL' || m?.origem_padrao === 'IMPORTADO') {
      setOrigem(m.origem_padrao)
      setOrigemSugerida(true)
      marcar('origem')
    } else if (origemSugerida) {
      setOrigem('')
      setOrigemSugerida(false)
    }
  }

  const valorNumero = lerNumeroBR(valorUnitario)
  const quantidadeNumero = lerNumeroBR(quantidade)
  const total = useMemo(
    () =>
      valorNumero !== null && !Number.isNaN(valorNumero) && quantidadeNumero !== null && !Number.isNaN(quantidadeNumero)
        ? valorNumero * quantidadeNumero
        : null,
    [valorNumero, quantidadeNumero],
  )

  function validar(): Erros {
    const e: Erros = {}
    if (!empresaId) e.empresa = 'Escolha a empresa (Lojão dos Tratores ou LL Tratores).'
    if (!cliente) e.cliente = 'Selecione o cliente.'
    if (!produto) e.produto = 'Selecione a peça.'
    if (produto && !marcaId) e.marca = 'Selecione a marca.'
    if (!origem) e.origem = 'Informe se o produto é nacional ou importado.'
    if (quantidadeNumero === null) e.quantidade = 'Informe a quantidade.'
    else if (Number.isNaN(quantidadeNumero) || quantidadeNumero <= 0) e.quantidade = 'Quantidade inválida.'
    else if (quantidadeNumero > 1_000_000) e.quantidade = 'Quantidade muito alta.'
    else if (Math.round(quantidadeNumero * 1000) / 1000 !== quantidadeNumero) e.quantidade = 'Use no máximo 3 casas decimais.'
    if (valorNumero !== null && (Number.isNaN(valorNumero) || valorNumero < 0 || valorNumero > 100_000_000)) {
      e.valor = 'Valor inválido. Exemplo: 1.234,56'
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
    const dados = {
      empresa_id: empresaId!,
      cliente_id: cliente!.id,
      produto_id: produto!.id,
      marca_id: marcaId!,
      origem: origem as Origem,
      quantidade: quantidadeNumero!,
      valor_unitario: valorNumero,
      data_abertura: dataAbertura,
      nota_fiscal_venda: nfVenda.trim() || null,
      data_venda: dataVenda || null,
      fornecedor: fornecedor.trim() || null,
      nota_fiscal_compra: nfCompra.trim() || null,
      protocolo_fornecedor: protocolo.trim() || null,
      defeito: defeito.trim(),
      observacoes: observacoes.trim() || null,
    }
    try {
      if (editando && idGarantia !== null) {
        let consulta = supabase
          .from('garantias')
          .update({ ...dados, resolucao: resolucao || null })
          .eq('id', idGarantia)
        if (atualizadoEm) consulta = consulta.eq('atualizado_em', atualizadoEm)
        const { data, error } = await consulta.select('id')
        if (error) throw error
        if (!data || data.length === 0) {
          throw new Error(
            'Esta garantia foi alterada por outra pessoa enquanto você editava. Copie suas alterações, recarregue a página e tente novamente.',
          )
        }
        setAlterado(false)
        avisar(`Garantia Nº ${numeroGarantia(idGarantia)} atualizada.`)
        navegar(`/garantias/${idGarantia}`)
      } else {
        const { data, error } = await supabase
          .from('garantias')
          .insert({ ...dados, status, resolucao: resolucao || null })
          .select('id')
          .single()
        if (error) throw error
        setAlterado(false)
        avisar(`Garantia Nº ${numeroGarantia(data.id)} registrada com sucesso.`)
        navegar(`/garantias/${data.id}`, { replace: true })
      }
    } catch (e) {
      setErroGeral(e instanceof Error && e.message.startsWith('Esta garantia') ? e.message : mensagemErro(e))
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

  const marcaSelecionada = marcasProduto.find((m) => m.marca_id === marcaId)

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
          <legend>Cliente e peça</legend>
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

          <Campo rotulo="Peça / produto" htmlFor="produto" obrigatorio erro={erros.produto} ajuda="Busque pelo código ou descrição.">
            <Autocompletar<ProdutoOpcao>
              id="produto"
              valor={produto}
              aoSelecionar={(p) => void escolherProduto(p)}
              buscar={buscarProdutos}
              rotulo={(p) => (p.codigo ? `${p.codigo} — ${p.descricao}` : p.descricao)}
              chave={(p) => p.id}
              placeholder="Código ou descrição da peça"
              invalido={!!erros.produto}
              acaoExtra={{
                texto: '+ Cadastrar novo produto',
                aoClicar: (t) => setModalProduto({ aberto: true, id: null, texto: t }),
              }}
            />
          </Campo>

          {produto && (
            <Campo rotulo="Marca" htmlFor="marca" obrigatorio erro={erros.marca}>
              {carregandoMarcas ? (
                <Carregando texto="Carregando marcas…" />
              ) : marcasProduto.length === 0 ? (
                <div className="alerta alerta-info">
                  Este produto ainda não tem marcas cadastradas.{' '}
                  <button
                    type="button"
                    className="botao-link"
                    onClick={() => setModalProduto({ aberto: true, id: produto.id, texto: '' })}
                  >
                    Adicionar marca ao produto
                  </button>
                </div>
              ) : (
                <div className="linha-campo">
                  <select
                    id="marca"
                    value={marcaId ?? ''}
                    aria-invalid={!!erros.marca || undefined}
                    onChange={(e) => escolherMarca(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Selecione a marca…</option>
                    {marcasProduto.map((m) => (
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
                    onClick={() => setModalProduto({ aberto: true, id: produto.id, texto: '' })}
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
            <div className="opcoes-linha" role="radiogroup" aria-label="Origem do produto">
              {ORIGENS.map((o) => (
                <label key={o.valor} className={origem === o.valor ? 'opcao-pilula selecionada' : 'opcao-pilula'}>
                  <input
                    type="radio"
                    name="origem"
                    value={o.valor}
                    checked={origem === o.valor}
                    onChange={() => {
                      setOrigem(o.valor)
                      setOrigemSugerida(false)
                      marcar('origem')
                    }}
                  />
                  {o.rotulo}
                </label>
              ))}
            </div>
            {origemSugerida && marcaSelecionada && (
              <small className="ajuda">Preenchido pelo cadastro da marca {marcaSelecionada.nome}. Confira.</small>
            )}
            {erros.origem && <small className="erro-campo">{erros.origem}</small>}
          </fieldset>

          <div className="grade-campos">
            <Campo rotulo="Quantidade" htmlFor="quantidade" obrigatorio erro={erros.quantidade}>
              <input
                id="quantidade"
                inputMode="decimal"
                value={quantidade}
                onChange={(e) => {
                  setQuantidade(e.target.value)
                  marcar('quantidade')
                }}
                aria-invalid={!!erros.quantidade || undefined}
              />
            </Campo>
            <Campo
              rotulo="Valor unitário (R$)"
              htmlFor="valor"
              erro={erros.valor}
              ajuda={total !== null ? `Total: ${formatarMoeda(total)}` : 'Opcional'}
            >
              <input
                id="valor"
                inputMode="decimal"
                placeholder="0,00"
                value={valorUnitario}
                onChange={(e) => {
                  setValorUnitario(e.target.value)
                  marcar('valor')
                }}
                aria-invalid={!!erros.valor || undefined}
              />
            </Campo>
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
        aoFechar={() => setModalProduto({ aberto: false, id: null, texto: '' })}
        aoSalvar={(p) => {
          const mesmoProduto = produto?.id === p.id
          setModalProduto({ aberto: false, id: null, texto: '' })
          avisar('Produto salvo.')
          if (mesmoProduto) {
            setProduto(p)
            void carregarMarcas(p.id, marcaId).then((lista) => {
              if (!marcaId && lista.length === 1) escolherMarca(lista[0].marca_id, lista)
            })
          } else {
            void escolherProduto(p)
          }
        }}
      />
    </div>
  )
}
