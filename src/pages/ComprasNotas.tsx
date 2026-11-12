import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Empresa } from '../lib/supabase'
import type { Json, Tables } from '../lib/database.types'
import { useAvisos } from '../components/Avisos'
import { useAtrasado } from '../lib/hooks'
import { mensagemErro } from '../lib/erros'
import { formatarData, formatarMoeda, hojeISO, lerNumeroBR, numeroParaCampo, padraoBusca } from '../lib/formato'
import { lerArquivoPlanilha } from '../lib/leitorPlanilha'
import type { Aba } from '../lib/leitorPlanilha'
import {
  CAMPOS_NOTA,
  detectarColunasNota,
  emLotes,
  localizarCabecalhoNota,
  montarNotas,
  textoCelula,
} from '../lib/planilha'
import type { CampoNota, Problema } from '../lib/planilha'
import { baixarModeloNotas } from '../lib/exportar'
import { Campo, Carregando, MensagemErro, Paginacao, Vazio } from '../components/Comuns'
import { Confirmar, Modal } from '../components/Modal'

type Nota = Tables<'compras_notas'>
const POR_PAGINA = 50

// ---------------------------------------------------------------------------
// Lista e cadastro de notas
// ---------------------------------------------------------------------------
export function ComprasNotas() {
  const { avisar } = useAvisos()
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [texto, setTexto] = useState('')
  const busca = useAtrasado(texto, 300)
  const [mes, setMes] = useState('')
  const [empresaId, setEmpresaId] = useState('')
  const chaveFiltro = `${busca}|${mes}|${empresaId}`
  const [paginacao, setPaginacao] = useState({ pagina: 1, chave: chaveFiltro })
  const pagina = paginacao.chave === chaveFiltro ? paginacao.pagina : 1
  const [linhas, setLinhas] = useState<Nota[] | null>(null)
  const [total, setTotal] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [editar, setEditar] = useState<{ aberto: boolean; nota: Nota | null }>({ aberto: false, nota: null })
  const [excluir, setExcluir] = useState<Nota | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  useEffect(() => {
    void supabase
      .from('empresas')
      .select('*')
      .order('id')
      .then(({ data }) => setEmpresas(data ?? []))
  }, [])

  const nomeEmpresa = useMemo(() => new Map(empresas.map((e) => [e.id, e.nome])), [empresas])

  const carregar = useCallback(async () => {
    try {
      let q = supabase
        .from('compras_notas')
        .select('*', { count: 'exact' })
        .order('data_entrada', { ascending: false })
        .order('id', { ascending: false })
      const padrao = padraoBusca(busca)
      if (padrao) q = q.or(`fornecedor.ilike.${padrao},numero.ilike.${padrao}`)
      if (/^\d{4}-\d{2}$/.test(mes)) {
        const [a, m] = mes.split('-').map(Number)
        const prox = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`
        q = q.gte('data_entrada', `${mes}-01`).lt('data_entrada', prox)
      }
      if (/^\d+$/.test(empresaId)) q = q.eq('empresa_id', Number(empresaId))
      const { data, error, count } = await q.range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)
      if (error) throw error
      setLinhas(data)
      setTotal(count ?? 0)
      setErro(null)
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }, [busca, mes, empresaId, pagina])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function confirmarExclusao() {
    if (!excluir) return
    setExcluindo(true)
    try {
      const { data, error } = await supabase.from('compras_notas').delete().eq('id', excluir.id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('sem permissão')
      avisar(`Nota ${excluir.numero} excluída.`)
      setExcluir(null)
      void carregar()
    } catch (e) {
      avisar(mensagemErro(e), 'erro')
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <div className="painel">
      <div className="acoes acoes-topo">
        <span className="texto-suave">{total.toLocaleString('pt-BR')} nota(s)</span>
        <button type="button" className="botao" onClick={() => setEditar({ aberto: true, nota: null })}>
          + Lançar nota
        </button>
      </div>
      <section className="filtros" aria-label="Filtros">
        <div className="campo campo-largo">
          <label htmlFor="n-busca">Buscar</label>
          <input id="n-busca" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Fornecedor ou número da nota" />
        </div>
        <div className="campo">
          <label htmlFor="n-mes">Mês de entrada</label>
          <input id="n-mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="n-empresa">Empresa</label>
          <select id="n-empresa" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
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
      {!linhas && !erro && <Carregando />}
      {linhas && linhas.length === 0 && <Vazio>Nenhuma nota encontrada. Lance uma nota ou importe uma planilha.</Vazio>}
      {linhas && linhas.length > 0 && (
        <>
          <div className="tabela-container">
            <table className="tabela tabela-responsiva">
              <thead>
                <tr>
                  <th>Entrada</th>
                  <th>Nota</th>
                  <th>Fornecedor</th>
                  <th>Empresa</th>
                  <th className="num">Valor pago</th>
                  <th className="num">Referência</th>
                  <th className="num">Saving</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((n) => {
                  const saving = n.valor_referencia === null ? null : n.valor_referencia - n.valor_total
                  return (
                    <tr key={n.id}>
                      <td data-rotulo="Entrada">{formatarData(n.data_entrada)}</td>
                      <td data-rotulo="Nota">
                        <strong>{n.numero}</strong>
                      </td>
                      <td data-rotulo="Fornecedor">{n.fornecedor}</td>
                      <td data-rotulo="Empresa">{nomeEmpresa.get(n.empresa_id) ?? '—'}</td>
                      <td data-rotulo="Valor pago" className="num">
                        {formatarMoeda(n.valor_total)}
                      </td>
                      <td data-rotulo="Referência" className="num">
                        {n.valor_referencia === null ? '—' : formatarMoeda(n.valor_referencia)}
                      </td>
                      <td data-rotulo="Saving" className={saving !== null && saving < 0 ? 'num texto-perigo' : 'num'}>
                        {saving === null ? '—' : formatarMoeda(saving)}
                      </td>
                      <td className="acoes-linha">
                        <button type="button" className="botao-link" onClick={() => setEditar({ aberto: true, nota: n })}>
                          Editar
                        </button>
                        <button type="button" className="botao-link texto-perigo" onClick={() => setExcluir(n)}>
                          Excluir
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Paginacao pagina={pagina} porPagina={POR_PAGINA} total={total} aoMudar={(p) => setPaginacao({ pagina: p, chave: chaveFiltro })} />
        </>
      )}

      <FormNota
        aberto={editar.aberto}
        nota={editar.nota}
        empresas={empresas}
        aoFechar={() => setEditar({ aberto: false, nota: null })}
        aoSalvar={() => {
          avisar('Nota salva.')
          setEditar({ aberto: false, nota: null })
          void carregar()
        }}
      />
      <Confirmar
        aberto={excluir !== null}
        titulo="Excluir nota"
        mensagem={
          <>
            Excluir a nota <strong>{excluir?.numero}</strong> de {excluir?.fornecedor}? A exclusão fica registrada na auditoria.
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

function FormNota({
  aberto,
  nota,
  empresas,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean
  nota: Nota | null
  empresas: Empresa[]
  aoFechar: () => void
  aoSalvar: () => void
}) {
  return (
    <Modal aberto={aberto} titulo={nota ? 'Editar nota' : 'Lançar nota de entrada'} aoFechar={aoFechar}>
      {/* Nasce novo a cada abertura: nada é reiniciado depois de a pessoa começar a digitar. */}
      {aberto && <CorpoNota nota={nota} empresas={empresas} aoFechar={aoFechar} aoSalvar={aoSalvar} />}
    </Modal>
  )
}

function CorpoNota({
  nota,
  empresas,
  aoFechar,
  aoSalvar,
}: {
  nota: Nota | null
  empresas: Empresa[]
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const [empresaId, setEmpresaId] = useState(String(nota?.empresa_id ?? empresas[0]?.id ?? ''))
  const [numero, setNumero] = useState(nota?.numero ?? '')
  const [fornecedor, setFornecedor] = useState(nota?.fornecedor ?? '')
  const [data, setData] = useState(nota?.data_entrada ?? hojeISO())
  const [valor, setValor] = useState(numeroParaCampo(nota?.valor_total))
  const [referencia, setReferencia] = useState(numeroParaCampo(nota?.valor_referencia))
  const [obs, setObs] = useState(nota?.observacoes ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const v = lerNumeroBR(valor)
    const r = lerNumeroBR(referencia)
    if (!empresaId) return setErro('Escolha a empresa.')
    if (!numero.trim() || !fornecedor.trim()) return setErro('Informe o número da nota e o fornecedor.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return setErro('Informe a data de entrada.')
    if (v === null || Number.isNaN(v) || v < 0) return setErro('Informe o valor pago na nota (ex.: 1.234,56).')
    if (r !== null && (Number.isNaN(r) || r < 0)) return setErro('Valor de referência inválido (ex.: 1.234,56).')
    setSalvando(true)
    const dados = {
      empresa_id: Number(empresaId),
      numero: numero.trim(),
      fornecedor: fornecedor.trim(),
      data_entrada: data,
      valor_total: v,
      valor_referencia: r,
      observacoes: obs.trim() || null,
    }
    try {
      const { error } = nota
        ? await supabase.from('compras_notas').update(dados).eq('id', nota.id)
        : await supabase.from('compras_notas').insert(dados)
      if (error) throw error
      aoSalvar()
    } catch (er) {
      setErro(mensagemErro(er))
    } finally {
      setSalvando(false)
    }
  }

  const v = lerNumeroBR(valor)
  const r = lerNumeroBR(referencia)
  const saving = v !== null && r !== null && !Number.isNaN(v) && !Number.isNaN(r) ? r - v : null

  return (
    <form onSubmit={salvar} className="formulario">
      <div className="grade-campos">
        <Campo rotulo="Empresa" htmlFor="nf-empresa" obrigatorio>
          <select id="nf-empresa" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
            {empresas.map((e) => (
              <option key={e.id} value={String(e.id)}>
                {e.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Data de entrada" htmlFor="nf-data" obrigatorio>
          <input id="nf-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </Campo>
        <Campo rotulo="Número da nota" htmlFor="nf-numero" obrigatorio>
          <input id="nf-numero" value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={40} />
        </Campo>
        <Campo rotulo="Fornecedor" htmlFor="nf-fornecedor" obrigatorio>
          <input id="nf-fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} maxLength={200} />
        </Campo>
        <Campo rotulo="Valor pago na nota (R$)" htmlFor="nf-valor" obrigatorio>
          <input id="nf-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
        </Campo>
        <Campo
          rotulo="Valor de referência (R$)"
          htmlFor="nf-ref"
          ajuda={saving !== null ? `Saving desta nota: ${formatarMoeda(saving)}` : 'Tabela, cotação inicial ou preço anterior (opcional)'}
        >
          <input id="nf-ref" inputMode="decimal" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="0,00" />
        </Campo>
      </div>
      <Campo rotulo="Observações" htmlFor="nf-obs">
        <textarea id="nf-obs" rows={2} maxLength={1000} value={obs} onChange={(e) => setObs(e.target.value)} />
      </Campo>
      {erro && <MensagemErro texto={erro} />}
      <div className="acoes-formulario">
        <button type="button" className="botao botao-secundario" onClick={aoFechar} disabled={salvando}>
          Cancelar
        </button>
        <button type="submit" className="botao" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar nota'}
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Importação de planilha de notas
// ---------------------------------------------------------------------------
export function ComprasImportar() {
  const { avisar } = useAvisos()
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [empresaId, setEmpresaId] = useState('')
  const [arquivo, setArquivo] = useState<string | null>(null)
  const [abas, setAbas] = useState<Aba[]>([])
  const [abaIndice, setAbaIndice] = useState(0)
  const [linhaCabecalho, setLinhaCabecalho] = useState(0)
  const [colunas, setColunas] = useState<Record<CampoNota, number | null> | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [lendo, setLendo] = useState(false)
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null)
  const [resultado, setResultado] = useState<string[] | null>(null)

  useEffect(() => {
    void supabase
      .from('empresas')
      .select('*')
      .order('id')
      .then(({ data }) => {
        setEmpresas(data ?? [])
        if (data?.length) setEmpresaId(String(data[0].id))
      })
  }, [])

  const linhas = useMemo(() => abas[abaIndice]?.linhas ?? [], [abas, abaIndice])
  const cabecalho = useMemo(() => (linhas[linhaCabecalho] ?? []).map(textoCelula), [linhas, linhaCabecalho])
  const analise = useMemo(() => (colunas && linhas.length ? montarNotas(linhas, linhaCabecalho, colunas) : null), [colunas, linhas, linhaCabecalho])

  function preparar(lista: Aba[], indice: number) {
    const l = lista[indice]?.linhas ?? []
    const cab = localizarCabecalhoNota(l)
    setLinhaCabecalho(cab)
    setColunas(detectarColunasNota((l[cab] ?? []).map(textoCelula)))
  }

  function limpar() {
    setArquivo(null)
    setAbas([])
    setAbaIndice(0)
    setErro(null)
    setResultado(null)
    setColunas(null)
  }

  async function escolherArquivo(f: File | undefined) {
    limpar()
    if (!f) return
    setLendo(true)
    try {
      const lidas = (await lerArquivoPlanilha(f)).filter((a) => a.linhas.length > 0)
      if (lidas.length === 0) throw new Error('A planilha está vazia.')
      setArquivo(f.name)
      setAbas(lidas)
      preparar(lidas, 0)
    } catch (e) {
      setErro(e instanceof Error ? e.message : mensagemErro(e))
    } finally {
      setLendo(false)
    }
  }

  async function importar() {
    if (!analise || analise.itens.length === 0) return
    setErro(null)
    setResultado(null)
    const lotes = emLotes(analise.itens, 300)
    let novas = 0
    let atualizadas = 0
    let feitos = 0
    setProgresso({ feito: 0, total: analise.itens.length })
    try {
      for (const lote of lotes) {
        const { data, error } = await supabase.rpc('importar_compras_notas', { p_empresa_id: Number(empresaId), p_itens: lote as unknown as Json })
        if (error) throw error
        const r = (data ?? {}) as { novas?: number; atualizadas?: number }
        novas += Number(r.novas ?? 0)
        atualizadas += Number(r.atualizadas ?? 0)
        feitos += lote.length
        setProgresso({ feito: feitos, total: analise.itens.length })
      }
      setResultado([`${novas} nota(s) nova(s)`, `${atualizadas} nota(s) atualizada(s)`])
      avisar('Importação concluída com sucesso.')
    } catch (e) {
      setErro(`${mensagemErro(e)} ${feitos > 0 ? `As primeiras ${feitos} notas já foram importadas; corrija e importe de novo (notas repetidas apenas são atualizadas).` : 'Nada foi importado.'}`)
    } finally {
      setProgresso(null)
    }
  }

  const lista = (titulo: string, itens: Problema[], classe: string) =>
    itens.length > 0 && (
      <details className={`problemas ${classe}`} open={itens.length <= 10}>
        <summary>
          {titulo} ({itens.length})
        </summary>
        <ul>
          {itens.slice(0, 200).map((p, i) => (
            <li key={i}>
              Linha {p.linha}: {p.motivo}
            </li>
          ))}
        </ul>
      </details>
    )

  return (
    <div className="painel">
      <section className="painel-bloco">
        <h2 className="titulo-secao">1. Escolha a planilha</h2>
        <p className="texto-suave">
          Uma linha por nota de entrada, com: <strong>Número da nota</strong>, <strong>Fornecedor</strong>,{' '}
          <strong>Data de entrada</strong>, <strong>Valor da nota</strong> e, para calcular o saving,{' '}
          <strong>Valor de referência</strong> (tabela/cotação). Notas já importadas (mesmo fornecedor e número) são atualizadas.
        </p>
        <div className="grade-campos">
          <div className="campo">
            <label htmlFor="imp-empresa">Empresa das notas desta planilha</label>
            <select id="imp-empresa" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
              {empresas.map((e) => (
                <option key={e.id} value={String(e.id)}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="acoes">
          <input
            id="arquivo-notas"
            type="file"
            className="sr-only"
            accept=".xlsx,.xlsm,.csv,.txt"
            onClick={(e) => {
              e.currentTarget.value = ''
            }}
            onChange={(e) => void escolherArquivo(e.target.files?.[0])}
            disabled={lendo || progresso !== null}
          />
          <label htmlFor="arquivo-notas" className={lendo || progresso !== null ? 'botao desabilitado' : 'botao'}>
            Escolher arquivo…
          </label>
          {arquivo && <span className="texto-suave">{arquivo}</span>}
          <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => void baixarModeloNotas()}>
            Baixar planilha-modelo
          </button>
        </div>
        {lendo && <p>Lendo arquivo…</p>}
        {erro && <MensagemErro texto={erro} />}
      </section>

      {arquivo && colunas && (
        <section className="painel-bloco">
          <h2 className="titulo-secao">2. Confira as colunas</h2>
          <div className="grade-campos">
            {abas.length > 1 && (
              <div className="campo">
                <label htmlFor="imp-aba">Aba da planilha</label>
                <select
                  id="imp-aba"
                  value={abaIndice}
                  onChange={(e) => {
                    const i = Number(e.target.value)
                    setAbaIndice(i)
                    preparar(abas, i)
                  }}
                >
                  {abas.map((a, i) => (
                    <option key={a.nome + i} value={i}>
                      {a.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="campo">
              <label htmlFor="imp-linha">Linha dos títulos</label>
              <select
                id="imp-linha"
                value={linhaCabecalho}
                onChange={(e) => {
                  const i = Number(e.target.value)
                  setLinhaCabecalho(i)
                  setColunas(detectarColunasNota((linhas[i] ?? []).map(textoCelula)))
                }}
              >
                {linhas.slice(0, 15).map((l, i) => (
                  <option key={i} value={i}>
                    Linha {i + 1}: {l.map(textoCelula).filter(Boolean).slice(0, 4).join(' | ').slice(0, 60)}
                  </option>
                ))}
              </select>
            </div>
            {CAMPOS_NOTA.map((c) => (
              <div className="campo" key={c.campo}>
                <label htmlFor={`imp-${c.campo}`}>
                  {c.rotulo}
                  {c.obrigatorio && <span className="obrigatorio"> *</span>}
                </label>
                <select
                  id={`imp-${c.campo}`}
                  value={colunas[c.campo] ?? ''}
                  onChange={(e) => setColunas((a) => (a ? { ...a, [c.campo]: e.target.value === '' ? null : Number(e.target.value) } : a))}
                >
                  <option value="">(não usar)</option>
                  {cabecalho.map((h, i) => (
                    <option key={i} value={i}>
                      Coluna {i + 1}: {h || '(sem título)'}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      {arquivo && analise && (
        <section className="painel-bloco">
          <h2 className="titulo-secao">3. Prévia e importação</h2>
          <ul className="resumo-importacao">
            <li>
              <strong>{analise.linhasLidas}</strong> linha(s) lida(s)
            </li>
            <li>
              <strong>{analise.itens.length}</strong> nota(s) a importar
            </li>
            <li>
              Valor total <strong>{formatarMoeda(analise.totalValor)}</strong>
            </li>
            <li className={analise.erros.length ? 'texto-perigo' : undefined}>
              <strong>{analise.erros.length}</strong> linha(s) com erro (serão ignoradas)
            </li>
          </ul>
          {lista('Erros', analise.erros, 'problemas-erro')}
          {lista('Avisos', analise.avisos, 'problemas-aviso')}
          {progresso && (
            <div className="progresso" role="progressbar" aria-valuemin={0} aria-valuemax={progresso.total} aria-valuenow={progresso.feito}>
              <div className="progresso-barra" style={{ width: `${(progresso.feito / progresso.total) * 100}%` }} />
              <span>
                Importando… {progresso.feito} de {progresso.total}
              </span>
            </div>
          )}
          {resultado && (
            <div className="alerta alerta-sucesso" role="status">
              <strong>Importação concluída:</strong>
              <ul>
                {resultado.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="acoes-formulario">
            <button type="button" className="botao botao-secundario" onClick={limpar} disabled={progresso !== null}>
              Escolher outro arquivo
            </button>
            <button type="button" className="botao" onClick={() => void importar()} disabled={analise.itens.length === 0 || progresso !== null}>
              Importar {analise.itens.length} nota(s)
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
