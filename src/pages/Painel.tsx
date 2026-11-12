import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Evento } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useTempoReal } from '../lib/hooks'
import { mensagemErro } from '../lib/erros'
import { DIAS_ALERTA, STATUS, rotuloStatus } from '../lib/constantes'
import { formatarDataHora, formatarMoeda, numeroGarantia } from '../lib/formato'
import { Carregando, MensagemErro, SeloStatus } from '../components/Comuns'

interface Resumo {
  total: number
  em_andamento: number
  atrasadas_30_dias: number
  valor_em_andamento: number
  por_status: Record<string, number>
  por_empresa: { empresa_id: number; nome: string; tipo: string; total: number; em_andamento: number }[]
  por_origem: Record<string, number>
}

function lerResumo(dados: unknown): Resumo {
  const d = (dados ?? {}) as Partial<Resumo>
  return {
    total: Number(d.total ?? 0),
    em_andamento: Number(d.em_andamento ?? 0),
    atrasadas_30_dias: Number(d.atrasadas_30_dias ?? 0),
    valor_em_andamento: Number(d.valor_em_andamento ?? 0),
    por_status: d.por_status ?? {},
    por_empresa: Array.isArray(d.por_empresa) ? d.por_empresa : [],
    por_origem: d.por_origem ?? {},
  }
}

function descreverEvento(e: Evento): string {
  switch (e.tipo) {
    case 'CRIACAO':
      return 'registrou a garantia'
    case 'STATUS':
      return `mudou para “${rotuloStatus(e.status_novo)}”`
    case 'EDICAO':
      return 'editou dados'
    case 'COMENTARIO':
      return 'comentou'
    case 'ANEXO': {
      const d = e.descricao ?? ''
      if (d.startsWith('Anexo adicionado: ')) return `anexou “${d.slice(18)}”`
      if (d.startsWith('Anexo removido: ')) return `removeu o anexo “${d.slice(16)}”`
      return 'alterou anexos'
    }
    default:
      return e.tipo
  }
}

export function Painel() {
  const { perfil, podeEditar } = useAuth()
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const [r, ev] = await Promise.all([
        supabase.rpc('resumo_garantias'),
        supabase.from('garantia_eventos').select('*').order('criado_em', { ascending: false }).limit(12),
      ])
      if (r.error) throw r.error
      if (ev.error) throw ev.error
      setResumo(lerResumo(r.data))
      setEventos(ev.data)
      setErro(null)
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useTempoReal(['garantias', 'garantia_eventos'], carregar)

  const maxStatus = resumo ? Math.max(1, ...Object.values(resumo.por_status)) : 1

  return (
    <div className="pagina">
      <div className="pagina-cabecalho">
        <div>
          <h1>Olá{perfil?.nome ? `, ${perfil.nome.split(' ')[0]}` : ''}!</h1>
          <p className="texto-suave">Resumo das garantias — atualiza sozinho quando alguém faz alterações.</p>
        </div>
        {podeEditar && (
          <Link to="/garantias/nova" className="botao">
            + Nova garantia
          </Link>
        )}
      </div>

      {erro && <MensagemErro texto={erro} aoTentarDeNovo={() => void carregar()} />}
      {!resumo && !erro && <Carregando />}

      {resumo && (
        <>
          <section className="cartoes" aria-label="Indicadores">
            <Link to="/garantias?status=andamento" className="cartao-indicador">
              <span>Em andamento</span>
              <strong>{resumo.em_andamento}</strong>
            </Link>
            <Link
              to="/garantias?status=atrasadas"
              className={resumo.atrasadas_30_dias > 0 ? 'cartao-indicador alerta-indicador' : 'cartao-indicador'}
            >
              <span>Abertas há mais de {DIAS_ALERTA} dias</span>
              <strong>{resumo.atrasadas_30_dias}</strong>
            </Link>
            <Link to="/garantias?status=CONCLUIDA" className="cartao-indicador">
              <span>Concluídas</span>
              <strong>{resumo.por_status.CONCLUIDA ?? 0}</strong>
            </Link>
            <Link to="/garantias" className="cartao-indicador">
              <span>Total registradas</span>
              <strong>{resumo.total}</strong>
            </Link>
            <div className="cartao-indicador">
              <span>Valor em andamento</span>
              <strong className="valor-menor">{formatarMoeda(resumo.valor_em_andamento)}</strong>
            </div>
          </section>

          <div className="grade-2">
            <section className="painel-bloco">
              <h2>Por status</h2>
              <ul className="barras">
                {STATUS.map((s) => {
                  const n = resumo.por_status[s.valor] ?? 0
                  return (
                    <li key={s.valor}>
                      <Link to={`/garantias?status=${s.valor}`} className="barra-linha">
                        <span className="barra-rotulo">{s.rotulo}</span>
                        <span className="barra-trilho">
                          <span className={`barra-preenchida ${s.classe}`} style={{ width: `${(n / maxStatus) * 100}%` }} />
                        </span>
                        <span className="barra-valor">{n}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>

            <section className="painel-bloco">
              <h2>Por empresa</h2>
              <table className="tabela tabela-simples">
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th className="num">Em andamento</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.por_empresa.map((e) => (
                    <tr key={e.empresa_id}>
                      <td>
                        <Link to={`/garantias?empresa=${e.empresa_id}`}>{e.nome}</Link>{' '}
                        <small className="texto-suave">({e.tipo === 'MATRIZ' ? 'Matriz' : 'Filial'})</small>
                      </td>
                      <td className="num">{e.em_andamento}</td>
                      <td className="num">{e.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h2 className="mt">Nacional × Importado</h2>
              <table className="tabela tabela-simples">
                <thead>
                  <tr>
                    <th>Origem</th>
                    <th className="num">Em andamento</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <Link to="/garantias?origem=NACIONAL">Nacional</Link>
                    </td>
                    <td className="num">{resumo.por_origem.NACIONAL_em_andamento ?? 0}</td>
                    <td className="num">{resumo.por_origem.NACIONAL ?? 0}</td>
                  </tr>
                  <tr>
                    <td>
                      <Link to="/garantias?origem=IMPORTADO">Importado</Link>
                    </td>
                    <td className="num">{resumo.por_origem.IMPORTADO_em_andamento ?? 0}</td>
                    <td className="num">{resumo.por_origem.IMPORTADO ?? 0}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          </div>

          <section className="painel-bloco">
            <h2>Últimas movimentações</h2>
            {eventos.length === 0 ? (
              <p className="texto-suave">Nenhuma movimentação ainda.</p>
            ) : (
              <ul className="lista-eventos">
                {eventos.map((e) => (
                  <li key={e.id}>
                    <Link to={`/garantias/${e.garantia_id}`}>Nº {numeroGarantia(e.garantia_id)}</Link>{' '}
                    <span>
                      <strong>{e.usuario_nome ?? 'Sistema'}</strong> {descreverEvento(e)}
                    </span>
                    {e.tipo === 'STATUS' && <SeloStatus status={e.status_novo} />}
                    <small className="texto-suave">{formatarDataHora(e.criado_em)}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
