import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Empresa } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { mensagemErro } from '../lib/erros'
import { PERIODOS, agruparPorMes, formatarPercentual, mesesDoPeriodo, rotuloMes, totalizar, variacao } from '../lib/compras'
import type { LinhaMensal, Periodo, ResumoMes } from '../lib/compras'
import { formatarMoeda } from '../lib/formato'
import { Carregando, MensagemErro } from '../components/Comuns'

/** Seção "Compras": resumo, notas de entrada e importação. Somente administradores. */
export function Compras() {
  const { ehAdmin } = useAuth()
  const local = useLocation()
  if (!ehAdmin) {
    return (
      <div className="pagina">
        <MensagemErro texto="Acesso restrito a administradores." />
      </div>
    )
  }
  const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'subnav-item ativo' : 'subnav-item')
  return (
    <div className="pagina">
      <div className="pagina-cabecalho">
        <div>
          <h1>Compras</h1>
          <p className="texto-suave">Notas de entrada e desempenho do setor (saving).</p>
        </div>
      </div>
      <nav className="subnav" aria-label="Seções de compras">
        <NavLink to="/compras" end className={link}>
          Resumo
        </NavLink>
        <NavLink to="/compras/notas" className={link}>
          Notas de entrada
        </NavLink>
        <NavLink to="/compras/importar" className={link}>
          Importar planilha
        </NavLink>
      </nav>
      <div key={local.pathname} className="transicao-pagina">
        <Outlet />
      </div>
    </div>
  )
}

function Grafico({
  titulo,
  meses,
  valor,
  formatar,
  permitirNegativo,
}: {
  titulo: string
  meses: ResumoMes[]
  valor: (m: ResumoMes) => number
  formatar: (v: number) => string
  permitirNegativo?: boolean
}) {
  const maximo = Math.max(1, ...meses.map((m) => Math.abs(valor(m))))
  return (
    <section className="cartao">
      <header className="cartao-cabecalho">
        <h2>{titulo}</h2>
      </header>
      <div className="grafico-barras" role="img" aria-label={titulo}>
        {meses.map((m) => {
          const v = valor(m)
          const negativo = permitirNegativo && v < 0
          return (
            <div className="grafico-coluna" key={m.mes} title={`${rotuloMes(m.mes)}: ${formatar(v)}`}>
              <span className="grafico-valor">{v === 0 ? '' : formatar(v)}</span>
              <span className="grafico-trilho">
                <span
                  className={negativo ? 'grafico-barra negativa' : 'grafico-barra'}
                  style={{ height: `${(Math.abs(v) / maximo) * 100}%` }}
                />
              </span>
              <span className="grafico-rotulo">{rotuloMes(m.mes)}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

const compacta = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

export function ComprasResumo() {
  const [periodo, setPeriodo] = useState<Periodo>('12m')
  const [empresaId, setEmpresaId] = useState('')
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [linhas, setLinhas] = useState<LinhaMensal[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const meses = useMemo(() => mesesDoPeriodo(periodo), [periodo])

  useEffect(() => {
    void supabase
      .from('empresas')
      .select('*')
      .order('id')
      .then(({ data }) => setEmpresas(data ?? []))
  }, [])

  const carregar = useCallback(async () => {
    try {
      let q = supabase.from('vw_compras_mensal').select('*').gte('mes', meses[0]).lte('mes', meses[meses.length - 1])
      if (/^\d+$/.test(empresaId)) q = q.eq('empresa_id', Number(empresaId))
      const { data, error } = await q
      if (error) throw error
      setLinhas(
        data.map((l) => ({
          mes: l.mes ?? '',
          empresa_id: l.empresa_id ?? 0,
          notas: Number(l.notas ?? 0),
          fornecedores: Number(l.fornecedores ?? 0),
          valor_total: Number(l.valor_total ?? 0),
          notas_com_referencia: Number(l.notas_com_referencia ?? 0),
          valor_referencia: Number(l.valor_referencia ?? 0),
          valor_pago_com_referencia: Number(l.valor_pago_com_referencia ?? 0),
          saving: Number(l.saving ?? 0),
        })),
      )
      setErro(null)
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }, [meses, empresaId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const resumo = useMemo(() => (linhas ? agruparPorMes(linhas, meses) : null), [linhas, meses])
  const totais = useMemo(() => (resumo ? totalizar(resumo) : null), [resumo])

  const atual = resumo ? resumo[resumo.length - 1] : null
  const anterior = resumo && resumo.length > 1 ? resumo[resumo.length - 2] : null
  const variacaoNotas = atual && anterior ? variacao(atual.notas, anterior.notas) : null

  return (
    <div className="painel compras-resumo">
      <section className="filtros" aria-label="Filtros">
        <div className="campo">
          <label htmlFor="c-periodo">Período</label>
          <select id="c-periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
            {PERIODOS.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="c-empresa">Empresa</label>
          <select id="c-empresa" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
            <option value="">Todas</option>
            {empresas.map((e) => (
              <option key={e.id} value={String(e.id)}>
                {e.nome}
              </option>
            ))}
          </select>
        </div>
      </section>

      {erro && <MensagemErro texto={erro} aoTentarDeNovo={() => void carregar()} />}
      {!resumo && !erro && <Carregando />}

      {resumo && totais && (
        <>
          <section className="indicadores" aria-label="Indicadores de compras">
            <div className="indicador">
              <span>Notas de entrada</span>
              <strong>{totais.notas.toLocaleString('pt-BR')}</strong>
              {periodo === '12m' || periodo === 'ano' ? (
                <small className="texto-suave">
                  {atual?.notas ?? 0} neste mês
                  {variacaoNotas !== null && ` (${variacaoNotas >= 0 ? '+' : '−'}${formatarPercentual(Math.abs(variacaoNotas), 0)} vs. mês anterior)`}
                </small>
              ) : null}
            </div>
            <div className="indicador">
              <span>Valor comprado</span>
              <strong className="indicador-valor">{formatarMoeda(totais.valor)}</strong>
              <small className="texto-suave">Ticket médio {formatarMoeda(totais.ticketMedio)}</small>
            </div>
            <div className={totais.saving < 0 ? 'indicador indicador-alerta' : 'indicador indicador-saving'}>
              <span>Saving</span>
              <strong className="indicador-valor">{formatarMoeda(totais.saving)}</strong>
              <small className="texto-suave">{formatarPercentual(totais.savingPercentual)} sobre o valor de referência</small>
            </div>
            <div className="indicador">
              <span>Notas com referência</span>
              <strong>{formatarPercentual(totais.cobertura, 0)}</strong>
              <small className="texto-suave">Só elas entram no cálculo do saving</small>
            </div>
          </section>

          <div className="painel-grade">
            <Grafico titulo="Notas de entrada por mês" meses={resumo} valor={(m) => m.notas} formatar={(v) => String(v)} />
            <Grafico
              titulo="Saving por mês"
              meses={resumo}
              valor={(m) => m.saving}
              formatar={(v) => `${v < 0 ? '−' : ''}R$ ${compacta.format(Math.abs(v))}`}
              permitirNegativo
            />
          </div>

          <section className="cartao">
            <header className="cartao-cabecalho">
              <h2>Mês a mês</h2>
            </header>
            <div className="tabela-container">
              <table className="tabela tabela-simples">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th className="num">Notas</th>
                    <th className="num">Valor comprado</th>
                    <th className="num">Referência</th>
                    <th className="num">Saving</th>
                    <th className="num">Saving %</th>
                  </tr>
                </thead>
                <tbody>
                  {[...resumo].reverse().map((m) => (
                    <tr key={m.mes}>
                      <td>{rotuloMes(m.mes)}</td>
                      <td className="num">{m.notas}</td>
                      <td className="num">{formatarMoeda(m.valor)}</td>
                      <td className="num">{m.notasComReferencia ? formatarMoeda(m.referencia) : '—'}</td>
                      <td className={m.saving < 0 ? 'num texto-perigo' : 'num'}>{m.notasComReferencia ? formatarMoeda(m.saving) : '—'}</td>
                      <td className="num">{m.referencia > 0 ? formatarPercentual(m.saving / m.referencia) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="texto-suave texto-pequeno">
              Saving = valor de referência (preço de tabela, cotação inicial ou preço anterior) − valor pago na nota. Valores
              negativos mostram compras acima da referência.
            </p>
          </section>
        </>
      )}
    </div>
  )
}
