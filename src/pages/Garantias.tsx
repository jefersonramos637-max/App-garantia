import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Empresa, GarantiaVisao } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAtrasado, useTempoReal } from '../lib/hooks'
import { mensagemErro } from '../lib/erros'
import { DIAS_ALERTA, ORIGENS, STATUS, STATUS_EM_ANDAMENTO, STATUS_FINAIS, ehStatus } from '../lib/constantes'
import { diasDesde, formatarData, formatarQuantidade, hojeISO, numeroGarantia, padraoBusca } from '../lib/formato'
import { exportarGarantiasExcel } from '../lib/exportar'
import { Carregando, MensagemErro, Paginacao, SeloOrigem, SeloStatus, Vazio } from '../components/Comuns'
import { useAvisos } from '../components/Avisos'

const POR_PAGINA = 25

const ORDENS = {
  recentes: { rotulo: 'Mais recentes', colunas: [['data_abertura', false], ['id', false]] },
  antigas: { rotulo: 'Mais antigas', colunas: [['data_abertura', true], ['id', true]] },
  numero: { rotulo: 'Número', colunas: [['id', false]] },
  cliente: { rotulo: 'Cliente (A–Z)', colunas: [['cliente_nome', true], ['id', false]] },
  atualizacao: { rotulo: 'Última atualização', colunas: [['atualizado_em', false]] },
} as const satisfies Record<string, { rotulo: string; colunas: readonly (readonly [keyof GarantiaVisao, boolean])[] }>

type Ordem = keyof typeof ORDENS

function dataMenosDias(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return hojeISO(d)
}

export interface Filtros {
  q: string
  status: string
  empresa: string
  origem: string
  de: string
  ate: string
}

/** Consulta da visão de garantias com os filtros da tela (usada na lista e na exportação). */
function consultaGarantias(f: Filtros, ordem: Ordem, contar: boolean) {
  let q = supabase.from('vw_garantias').select('*', contar ? { count: 'exact' } : undefined)
  const padrao = padraoBusca(f.q)
  if (padrao) q = q.ilike('busca', padrao)
  if (f.status === 'andamento') q = q.in('status', [...STATUS_EM_ANDAMENTO])
  else if (f.status === 'finalizadas') q = q.in('status', [...STATUS_FINAIS])
  else if (f.status === 'atrasadas') q = q.in('status', [...STATUS_EM_ANDAMENTO]).lt('data_abertura', dataMenosDias(DIAS_ALERTA))
  else if (ehStatus(f.status)) q = q.eq('status', f.status)
  if (/^\d+$/.test(f.empresa)) q = q.eq('empresa_id', Number(f.empresa))
  if (f.origem === 'NACIONAL' || f.origem === 'IMPORTADO') q = q.eq('origem', f.origem)
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.de)) q = q.gte('data_abertura', f.de)
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.ate)) q = q.lte('data_abertura', f.ate)
  for (const [coluna, asc] of ORDENS[ordem].colunas) q = q.order(coluna, { ascending: asc })
  return q
}

export function Garantias() {
  const { podeEditar } = useAuth()
  const { avisar } = useAvisos()
  const navegar = useNavigate()
  const [params, setParams] = useSearchParams()
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [linhas, setLinhas] = useState<GarantiaVisao[] | null>(null)
  const [total, setTotal] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)
  const [textoBusca, setTextoBusca] = useState(params.get('q') ?? '')
  const buscaAtrasada = useAtrasado(textoBusca, 350)

  const filtros: Filtros = {
    q: params.get('q') ?? '',
    status: params.get('status') ?? '',
    empresa: params.get('empresa') ?? '',
    origem: params.get('origem') ?? '',
    de: params.get('de') ?? '',
    ate: params.get('ate') ?? '',
  }
  const ordemParam = params.get('ordem') ?? 'recentes'
  const ordem: Ordem = ordemParam in ORDENS ? (ordemParam as Ordem) : 'recentes'
  const pagina = Math.max(1, Number.parseInt(params.get('pagina') ?? '1', 10) || 1)
  const chaveFiltros = JSON.stringify([filtros, ordem, pagina])

  const mudarParam = useCallback(
    (alteracoes: Record<string, string>) => {
      setParams(
        (atual) => {
          const novo = new URLSearchParams(atual)
          for (const [k, v] of Object.entries(alteracoes)) {
            if (v) novo.set(k, v)
            else novo.delete(k)
          }
          if (!('pagina' in alteracoes)) novo.delete('pagina')
          return novo
        },
        { replace: true },
      )
    },
    [setParams],
  )

  useEffect(() => {
    if ((params.get('q') ?? '') !== buscaAtrasada) mudarParam({ q: buscaAtrasada })
  }, [buscaAtrasada, mudarParam, params])

  useEffect(() => {
    supabase
      .from('empresas')
      .select('*')
      .order('id')
      .then(({ data }) => setEmpresas(data ?? []))
  }, [])

  const carregar = useCallback(async () => {
    const [f, o, p] = JSON.parse(chaveFiltros) as [Filtros, Ordem, number]
    try {
      const { data, error, count } = await consultaGarantias(f, o, true).range((p - 1) * POR_PAGINA, p * POR_PAGINA - 1)
      if (error) throw error
      setLinhas(data)
      setTotal(count ?? 0)
      setErro(null)
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }, [chaveFiltros])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useTempoReal(['garantias'], carregar)

  async function exportar() {
    setExportando(true)
    try {
      const todas: GarantiaVisao[] = []
      const lote = 1000
      for (let inicio = 0; ; inicio += lote) {
        const { data, error } = await consultaGarantias(filtros, ordem, false).range(inicio, inicio + lote - 1)
        if (error) throw error
        todas.push(...data)
        if (data.length < lote) break
      }
      if (todas.length === 0) {
        avisar('Nenhuma garantia para exportar com estes filtros.', 'info')
        return
      }
      await exportarGarantiasExcel(todas)
      avisar(`${todas.length} garantia(s) exportada(s) para Excel.`)
    } catch (e) {
      avisar(mensagemErro(e), 'erro')
    } finally {
      setExportando(false)
    }
  }

  const temFiltro = Object.values(filtros).some(Boolean)

  return (
    <div className="pagina">
      <div className="pagina-cabecalho">
        <h1>Garantias</h1>
        <div className="acoes">
          <button type="button" className="botao botao-secundario" onClick={() => void exportar()} disabled={exportando}>
            {exportando ? 'Exportando…' : 'Exportar Excel'}
          </button>
          {podeEditar && (
            <Link to="/garantias/nova" className="botao">
              + Nova garantia
            </Link>
          )}
        </div>
      </div>

      <section className="filtros" aria-label="Filtros">
        <div className="campo campo-largo">
          <label htmlFor="busca">Buscar</label>
          <input
            id="busca"
            type="search"
            placeholder="Nº, cliente, código, peça, marca, NF, fornecedor…"
            value={textoBusca}
            onChange={(e) => setTextoBusca(e.target.value)}
          />
        </div>
        <div className="campo">
          <label htmlFor="f-status">Situação</label>
          <select id="f-status" value={filtros.status} onChange={(e) => mudarParam({ status: e.target.value })}>
            <option value="">Todas</option>
            <option value="andamento">Em andamento</option>
            <option value="atrasadas">Abertas há mais de {DIAS_ALERTA} dias</option>
            <option value="finalizadas">Finalizadas</option>
            {STATUS.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="f-empresa">Empresa</label>
          <select id="f-empresa" value={filtros.empresa} onChange={(e) => mudarParam({ empresa: e.target.value })}>
            <option value="">Todas</option>
            {empresas.map((e) => (
              <option key={e.id} value={String(e.id)}>
                {e.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="f-origem">Origem</label>
          <select id="f-origem" value={filtros.origem} onChange={(e) => mudarParam({ origem: e.target.value })}>
            <option value="">Todas</option>
            {ORIGENS.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="f-de">Aberta de</label>
          <input id="f-de" type="date" value={filtros.de} onChange={(e) => mudarParam({ de: e.target.value })} />
        </div>
        <div className="campo">
          <label htmlFor="f-ate">até</label>
          <input id="f-ate" type="date" value={filtros.ate} onChange={(e) => mudarParam({ ate: e.target.value })} />
        </div>
        <div className="campo">
          <label htmlFor="f-ordem">Ordenar por</label>
          <select id="f-ordem" value={ordem} onChange={(e) => mudarParam({ ordem: e.target.value === 'recentes' ? '' : e.target.value })}>
            {Object.entries(ORDENS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.rotulo}
              </option>
            ))}
          </select>
        </div>
        {temFiltro && (
          <button
            type="button"
            className="botao botao-link"
            onClick={() => {
              setTextoBusca('')
              setParams({}, { replace: true })
            }}
          >
            Limpar filtros
          </button>
        )}
      </section>

      {erro && <MensagemErro texto={erro} aoTentarDeNovo={() => void carregar()} />}
      {!linhas && !erro && <Carregando />}

      {linhas && linhas.length === 0 && (
        <Vazio>
          {temFiltro ? 'Nenhuma garantia encontrada com estes filtros.' : 'Nenhuma garantia registrada ainda.'}
        </Vazio>
      )}

      {linhas && linhas.length > 0 && (
        <>
          <div className="tabela-container">
            <table className="tabela tabela-responsiva tabela-clicavel">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Abertura</th>
                  <th>Cliente</th>
                  <th>Peça / marca</th>
                  <th className="num">Qtd.</th>
                  <th>Origem</th>
                  <th>Empresa</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((g) => {
                  const dias = diasDesde(g.data_abertura)
                  const atrasada =
                    dias !== null && dias > DIAS_ALERTA && !STATUS_FINAIS.includes(g.status as (typeof STATUS_FINAIS)[number])
                  return (
                    <tr
                      key={g.id}
                      onClick={() => navegar(`/garantias/${g.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') navegar(`/garantias/${g.id}`)
                      }}
                      tabIndex={0}
                    >
                      <td data-rotulo="Nº">
                        <Link to={`/garantias/${g.id}`} onClick={(e) => e.stopPropagation()}>
                          {numeroGarantia(g.id)}
                        </Link>
                      </td>
                      <td data-rotulo="Abertura">
                        {formatarData(g.data_abertura)}
                        {atrasada && (
                          <small className="texto-alerta" title="Em andamento há muitos dias">
                            {' '}
                            · {dias} dias
                          </small>
                        )}
                      </td>
                      <td data-rotulo="Cliente">
                        <span className="texto-suave">{g.cliente_codigo}</span> {g.cliente_nome}
                      </td>
                      <td data-rotulo="Peça / marca">
                        {g.produto_codigo && <span className="texto-suave">{g.produto_codigo} </span>}
                        {g.produto_descricao}
                        <div className="texto-pequeno">{g.marca_nome}</div>
                      </td>
                      <td data-rotulo="Qtd." className="num">
                        {formatarQuantidade(g.quantidade)}
                      </td>
                      <td data-rotulo="Origem">
                        <SeloOrigem origem={g.origem} />
                      </td>
                      <td data-rotulo="Empresa">{g.empresa_nome}</td>
                      <td data-rotulo="Status">
                        <SeloStatus status={g.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Paginacao
            pagina={pagina}
            porPagina={POR_PAGINA}
            total={total}
            aoMudar={(p) => mudarParam({ pagina: p > 1 ? String(p) : '' })}
          />
        </>
      )}
    </div>
  )
}
