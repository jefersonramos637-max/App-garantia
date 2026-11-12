import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Evento } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useTempoReal } from '../lib/hooks'
import { mensagemErro } from '../lib/erros'
import { DIAS_ALERTA, STATUS, classeStatus, rotuloStatus } from '../lib/constantes'
import { dataPorExtenso, formatarMoeda, numeroGarantia, tempoRelativo } from '../lib/formato'
import { Carregando, MensagemErro } from '../components/Comuns'

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

interface ItemComparacao {
  rotulo: string
  valor: number
  detalhe?: string
  link: string
  classe: string
}

/** Duas quantidades lado a lado com uma barra proporcional (ex.: Lojão × LL). */
function Comparacao({ titulo, itens }: { titulo: string; itens: ItemComparacao[] }) {
  const soma = itens.reduce((t, i) => t + i.valor, 0)
  return (
    <div className="comparacao">
      <h3>{titulo}</h3>
      <div className="barra-empilhada barra-fina" aria-hidden="true">
        {soma > 0 &&
          itens.map((i) => i.valor > 0 && <span key={i.rotulo} className={i.classe} style={{ width: `${(i.valor / soma) * 100}%` }} />)}
      </div>
      <ul>
        {itens.map((i) => (
          <li key={i.rotulo} className="comparacao-linha">
            <Link to={i.link}>
              <span className={`ponto ${i.classe}`} aria-hidden="true" />
              <span className="comparacao-rotulo">{i.rotulo}</span>
              <span className="comparacao-valor">{i.valor}</span>
            </Link>
            {i.detalhe && <small className="texto-suave">{i.detalhe}</small>}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Painel() {
  const { perfil, podeEditar } = useAuth()
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [, setRelogio] = useState(0)

  const carregar = useCallback(async () => {
    try {
      const [r, ev] = await Promise.all([
        supabase.rpc('resumo_garantias'),
        supabase.from('garantia_eventos').select('*').order('criado_em', { ascending: false }).limit(8),
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

  // Atualiza os "há X min" a cada minuto.
  useEffect(() => {
    const t = window.setInterval(() => setRelogio((v) => v + 1), 60_000)
    return () => window.clearInterval(t)
  }, [])

  useTempoReal(['garantias', 'garantia_eventos'], carregar)

  const primeiroNome = perfil?.nome?.trim().split(/\s+/)[0]
  const statusComValor = resumo ? STATUS.filter((s) => (resumo.por_status[s.valor] ?? 0) > 0) : []
  const empresa = (tipo: string) => resumo?.por_empresa.find((e) => e.tipo === tipo)

  return (
    <div className="pagina painel">
      <div className="pagina-cabecalho">
        <div>
          <h1>Olá{primeiroNome ? `, ${primeiroNome}` : ''}!</h1>
          <p className="texto-suave">{dataPorExtenso()}</p>
        </div>
        {podeEditar && (
          <Link to="/garantias/nova" className="botao so-celular">
            + Nova garantia
          </Link>
        )}
      </div>

      {erro && <MensagemErro texto={erro} aoTentarDeNovo={() => void carregar()} />}
      {!resumo && !erro && <Carregando />}

      {resumo && (
        <>
          <section className="indicadores" aria-label="Indicadores">
            <Link to="/garantias?status=andamento" className="indicador">
              <span>Em andamento</span>
              <strong>{resumo.em_andamento}</strong>
            </Link>
            <Link
              to="/garantias?status=atrasadas"
              className={resumo.atrasadas_30_dias > 0 ? 'indicador indicador-alerta' : 'indicador'}
            >
              <span>Abertas há mais de {DIAS_ALERTA} dias</span>
              <strong>{resumo.atrasadas_30_dias}</strong>
            </Link>
            <Link to="/garantias?status=CONCLUIDA" className="indicador">
              <span>Concluídas</span>
              <strong>{resumo.por_status.CONCLUIDA ?? 0}</strong>
            </Link>
            <div className="indicador">
              <span>Valor em andamento</span>
              <strong className="indicador-valor">{formatarMoeda(resumo.valor_em_andamento)}</strong>
            </div>
          </section>

          <div className="painel-grade">
            <section className="cartao">
              <header className="cartao-cabecalho">
                <h2>Situação</h2>
                <Link to="/garantias" className="link-discreto">
                  Ver todas ({resumo.total})
                </Link>
              </header>
              {resumo.total === 0 ? (
                <p className="texto-suave">Nenhuma garantia registrada ainda.</p>
              ) : (
                <>
                  <div className="barra-empilhada" aria-hidden="true">
                    {statusComValor.map((s) => (
                      <span
                        key={s.valor}
                        className={s.classe}
                        style={{ width: `${((resumo.por_status[s.valor] ?? 0) / resumo.total) * 100}%` }}
                      />
                    ))}
                  </div>
                  <ul className="legenda">
                    {statusComValor.map((s) => (
                      <li key={s.valor}>
                        <Link to={`/garantias?status=${s.valor}`}>
                          <span className={`ponto ${s.classe}`} aria-hidden="true" />
                          <span>{s.rotulo}</span>
                          <span className="legenda-valor">{resumo.por_status[s.valor]}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section className="cartao">
              <header className="cartao-cabecalho">
                <h2>Em andamento</h2>
              </header>
              <Comparacao
                titulo="Por empresa"
                itens={[
                  {
                    rotulo: empresa('MATRIZ')?.nome ?? 'Matriz',
                    valor: empresa('MATRIZ')?.em_andamento ?? 0,
                    detalhe: `${empresa('MATRIZ')?.total ?? 0} no total`,
                    link: `/garantias?status=andamento&empresa=${empresa('MATRIZ')?.empresa_id ?? ''}`,
                    classe: 'cor-matriz',
                  },
                  {
                    rotulo: empresa('FILIAL')?.nome ?? 'Filial',
                    valor: empresa('FILIAL')?.em_andamento ?? 0,
                    detalhe: `${empresa('FILIAL')?.total ?? 0} no total`,
                    link: `/garantias?status=andamento&empresa=${empresa('FILIAL')?.empresa_id ?? ''}`,
                    classe: 'cor-filial',
                  },
                ]}
              />
              <Comparacao
                titulo="Por origem"
                itens={[
                  {
                    rotulo: 'Nacional',
                    valor: resumo.por_origem.NACIONAL_em_andamento ?? 0,
                    detalhe: `${resumo.por_origem.NACIONAL ?? 0} no total`,
                    link: '/garantias?status=andamento&origem=NACIONAL',
                    classe: 'or-nacional',
                  },
                  {
                    rotulo: 'Importado',
                    valor: resumo.por_origem.IMPORTADO_em_andamento ?? 0,
                    detalhe: `${resumo.por_origem.IMPORTADO ?? 0} no total`,
                    link: '/garantias?status=andamento&origem=IMPORTADO',
                    classe: 'or-importado',
                  },
                ]}
              />
            </section>
          </div>

          <section className="cartao">
            <header className="cartao-cabecalho">
              <h2>Últimas movimentações</h2>
            </header>
            {eventos.length === 0 ? (
              <p className="texto-suave">Nenhuma movimentação ainda.</p>
            ) : (
              <ul className="movimentacoes">
                {eventos.map((e) => (
                  <li key={e.id}>
                    <span
                      className={`ponto ${e.tipo === 'STATUS' ? classeStatus(e.status_novo) : 'ponto-neutro'}`}
                      aria-hidden="true"
                    />
                    <p>
                      <Link to={`/garantias/${e.garantia_id}`}>Nº {numeroGarantia(e.garantia_id)}</Link>{' '}
                      <span className="texto-suave">·</span> <strong>{e.usuario_nome ?? 'Sistema'}</strong> {descreverEvento(e)}
                    </p>
                    <time dateTime={e.criado_em} className="texto-suave">
                      {tempoRelativo(e.criado_em)}
                    </time>
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
