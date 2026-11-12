import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Json } from '../lib/database.types'
import { useAuth } from '../auth/AuthContext'
import { useAvisos } from '../components/Avisos'
import { mensagemErro } from '../lib/erros'
import { lerArquivoPlanilha } from '../lib/leitorPlanilha'
import type { Aba } from '../lib/leitorPlanilha'
import {
  CAMPOS_CLIENTE,
  CAMPOS_PRODUTO,
  detectarColunasCliente,
  detectarColunasProduto,
  emLotes,
  localizarCabecalho,
  montarClientes,
  montarProdutos,
  textoCelula,
} from '../lib/planilha'
import type { CampoCliente, CampoProduto, Problema } from '../lib/planilha'
import { baixarModeloClientes, baixarModeloProdutos } from '../lib/exportar'
import { rotuloOrigem } from '../lib/constantes'
import { MensagemErro } from '../components/Comuns'

type Tipo = 'produtos' | 'clientes'
const TAMANHO_LOTE = 300

interface Resultado {
  linhas: string[]
}

function ListaProblemas({ titulo, itens, classe }: { titulo: string; itens: Problema[]; classe: string }) {
  if (itens.length === 0) return null
  return (
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
        {itens.length > 200 && <li>… e mais {itens.length - 200}.</li>}
      </ul>
    </details>
  )
}

export function Importar() {
  const { ehAdmin } = useAuth()
  const { avisar } = useAvisos()
  const [tipo, setTipo] = useState<Tipo>('produtos')
  const [arquivo, setArquivo] = useState<string | null>(null)
  const [abas, setAbas] = useState<Aba[]>([])
  const [abaIndice, setAbaIndice] = useState(0)
  const [linhaCabecalho, setLinhaCabecalho] = useState(0)
  const [colunasProduto, setColunasProduto] = useState<Record<CampoProduto, number | null> | null>(null)
  const [colunasCliente, setColunasCliente] = useState<Record<CampoCliente, number | null> | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [lendo, setLendo] = useState(false)
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  const linhas = useMemo(() => abas[abaIndice]?.linhas ?? [], [abas, abaIndice])
  const cabecalho = useMemo(() => (linhas[linhaCabecalho] ?? []).map(textoCelula), [linhas, linhaCabecalho])

  function prepararAba(lista: Aba[], indice: number, t: Tipo) {
    const l = lista[indice]?.linhas ?? []
    const cab = localizarCabecalho(l, t === 'produtos' ? 'produto' : 'cliente')
    setLinhaCabecalho(cab)
    const titulos = (l[cab] ?? []).map(textoCelula)
    setColunasProduto(detectarColunasProduto(titulos))
    setColunasCliente(detectarColunasCliente(titulos))
  }

  function limpar() {
    setArquivo(null)
    setAbas([])
    setAbaIndice(0)
    setErro(null)
    setResultado(null)
    setProgresso(null)
    setColunasCliente(null)
    setColunasProduto(null)
  }

  async function escolherArquivo(f: File | undefined) {
    limpar()
    if (!f) return
    setLendo(true)
    try {
      const lidas = await lerArquivoPlanilha(f)
      const comDados = lidas.filter((a) => a.linhas.length > 0)
      if (comDados.length === 0) throw new Error('A planilha está vazia.')
      setArquivo(f.name)
      setAbas(comDados)
      setAbaIndice(0)
      prepararAba(comDados, 0, tipo)
    } catch (e) {
      setErro(e instanceof Error ? e.message : mensagemErro(e))
    } finally {
      setLendo(false)
    }
  }

  const analiseProdutos = useMemo(
    () => (tipo === 'produtos' && colunasProduto && linhas.length ? montarProdutos(linhas, linhaCabecalho, colunasProduto) : null),
    [tipo, colunasProduto, linhas, linhaCabecalho],
  )
  const analiseClientes = useMemo(
    () => (tipo === 'clientes' && colunasCliente && linhas.length ? montarClientes(linhas, linhaCabecalho, colunasCliente) : null),
    [tipo, colunasCliente, linhas, linhaCabecalho],
  )

  async function importar() {
    setErro(null)
    setResultado(null)
    const itens: unknown[] = tipo === 'produtos' ? (analiseProdutos?.itens ?? []) : (analiseClientes?.itens ?? [])
    if (itens.length === 0) return
    const lotes = emLotes(itens, TAMANHO_LOTE)
    const soma: Record<string, number> = {}
    setProgresso({ feito: 0, total: itens.length })
    let feitos = 0
    try {
      for (const lote of lotes) {
        const { data, error } =
          tipo === 'produtos'
            ? await supabase.rpc('importar_produtos', { p_itens: lote as Json })
            : await supabase.rpc('importar_clientes', { p_itens: lote as Json })
        if (error) throw error
        for (const [k, v] of Object.entries((data ?? {}) as Record<string, number>)) soma[k] = (soma[k] ?? 0) + Number(v)
        feitos += lote.length
        setProgresso({ feito: feitos, total: itens.length })
      }
      const linhasResultado =
        tipo === 'produtos'
          ? [
              `${soma.produtos_novos ?? 0} produto(s) novo(s)`,
              `${soma.produtos_atualizados ?? 0} produto(s) atualizado(s)`,
              `${soma.marcas_novas ?? 0} marca(s) nova(s)`,
              `${soma.vinculos_novos ?? 0} nova(s) ligação(ões) produto × marca`,
            ]
          : [`${soma.novos ?? 0} cliente(s) novo(s)`, `${soma.atualizados ?? 0} cliente(s) atualizado(s)`]
      setResultado({ linhas: linhasResultado })
      avisar('Importação concluída com sucesso.')
    } catch (e) {
      setErro(
        `${mensagemErro(e)} ${
          feitos > 0
            ? `Os primeiros ${feitos} itens já foram importados; você pode corrigir o arquivo e importar de novo (itens repetidos são apenas atualizados).`
            : 'Nada foi importado.'
        }`,
      )
    } finally {
      setProgresso(null)
    }
  }

  if (!ehAdmin) return <MensagemErro texto="Acesso restrito a administradores." />

  const camposMapa = tipo === 'produtos' ? CAMPOS_PRODUTO : CAMPOS_CLIENTE
  const colunasAtuais = (tipo === 'produtos' ? colunasProduto : colunasCliente) as Record<string, number | null> | null
  const analise = tipo === 'produtos' ? analiseProdutos : analiseClientes
  const quantidade = analise?.itens.length ?? 0

  return (
    <div className="pagina">
      <div className="pagina-cabecalho">
        <div>
          <h2 className="titulo-secao">Importar planilhas</h2>
          <p className="texto-suave">
            Envie a planilha de produtos ou de clientes (Excel .xlsx ou .csv). Itens que já existem são atualizados — nada
            é duplicado.
          </p>
        </div>
      </div>

      <div className="abas" role="tablist">
        {(['produtos', 'clientes'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tipo === t}
            className={tipo === t ? 'aba ativa' : 'aba'}
            onClick={() => {
              setTipo(t)
              setResultado(null)
              if (abas.length) prepararAba(abas, abaIndice, t)
            }}
          >
            {t === 'produtos' ? 'Produtos e marcas' : 'Clientes'}
          </button>
        ))}
      </div>

      <section className="painel-bloco">
        <h2>1. Escolha o arquivo</h2>
        {tipo === 'produtos' ? (
          <p className="texto-suave">
            Colunas esperadas: <strong>Código</strong> (opcional), <strong>Descrição</strong>, <strong>Marcas</strong> (várias
            separadas por vírgula, ponto e vírgula ou barra), <strong>Origem</strong> (Nacional/Importado, opcional) e{' '}
            <strong>Referência do fabricante</strong> (opcional). O mesmo produto pode aparecer em várias linhas, uma por marca.
          </p>
        ) : (
          <p className="texto-suave">
            Colunas esperadas: <strong>Código</strong>, <strong>Nome</strong> e, opcionalmente, CPF/CNPJ, Cidade, UF e
            Telefone.
          </p>
        )}
        <div className="acoes">
          <input
            id="arquivo-importacao"
            type="file"
            className="sr-only"
            accept=".xlsx,.xlsm,.csv,.txt"
            onClick={(e) => {
              // Permite escolher o mesmo arquivo de novo depois de corrigi-lo.
              e.currentTarget.value = ''
            }}
            onChange={(e) => void escolherArquivo(e.target.files?.[0])}
            disabled={lendo || progresso !== null}
          />
          <label htmlFor="arquivo-importacao" className={lendo || progresso !== null ? 'botao desabilitado' : 'botao'}>
            Escolher arquivo…
          </label>
          {arquivo && <span className="texto-suave">{arquivo}</span>}
          <button
            type="button"
            className="botao botao-secundario botao-pequeno"
            onClick={() => void (tipo === 'produtos' ? baixarModeloProdutos() : baixarModeloClientes())}
          >
            Baixar planilha-modelo
          </button>
        </div>
        {lendo && <p>Lendo arquivo…</p>}
        {erro && <MensagemErro texto={erro} />}
      </section>

      {arquivo && colunasAtuais && (
        <section className="painel-bloco">
          <h2>2. Confira as colunas</h2>
          <p className="texto-suave">
            Arquivo: <strong>{arquivo}</strong>. O sistema reconheceu as colunas abaixo — corrija se necessário.
          </p>
          <div className="grade-campos">
            {abas.length > 1 && (
              <div className="campo">
                <label htmlFor="aba">Aba da planilha</label>
                <select
                  id="aba"
                  value={abaIndice}
                  onChange={(e) => {
                    const i = Number(e.target.value)
                    setAbaIndice(i)
                    prepararAba(abas, i, tipo)
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
              <label htmlFor="linha-cabecalho">Linha dos títulos</label>
              <select
                id="linha-cabecalho"
                value={linhaCabecalho}
                onChange={(e) => {
                  const i = Number(e.target.value)
                  setLinhaCabecalho(i)
                  const titulos = (linhas[i] ?? []).map(textoCelula)
                  setColunasProduto(detectarColunasProduto(titulos))
                  setColunasCliente(detectarColunasCliente(titulos))
                }}
              >
                {linhas.slice(0, 15).map((l, i) => (
                  <option key={i} value={i}>
                    Linha {i + 1}: {l.map(textoCelula).filter(Boolean).slice(0, 4).join(' | ').slice(0, 60)}
                  </option>
                ))}
              </select>
            </div>
            {camposMapa.map((c) => (
              <div className="campo" key={c.campo}>
                <label htmlFor={`col-${c.campo}`}>
                  {c.rotulo}
                  {c.obrigatorio && <span className="obrigatorio"> *</span>}
                </label>
                <select
                  id={`col-${c.campo}`}
                  value={colunasAtuais[c.campo] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value === '' ? null : Number(e.target.value)
                    if (tipo === 'produtos') setColunasProduto((atual) => (atual ? { ...atual, [c.campo]: v } : atual))
                    else setColunasCliente((atual) => (atual ? { ...atual, [c.campo]: v } : atual))
                  }}
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
          <h2>3. Prévia e importação</h2>
          <ul className="resumo-importacao">
            <li>
              <strong>{analise.linhasLidas}</strong> linha(s) lida(s)
            </li>
            <li>
              <strong>{quantidade}</strong> {tipo === 'produtos' ? 'produto(s) distinto(s)' : 'cliente(s) distinto(s)'}
            </li>
            {analiseProdutos && (
              <>
                <li>
                  <strong>{analiseProdutos.totalMarcas}</strong> marca(s) diferente(s)
                </li>
                {analiseProdutos.produtosSemMarca > 0 && (
                  <li className="texto-alerta">
                    <strong>{analiseProdutos.produtosSemMarca}</strong> produto(s) sem marca (adicione depois para usar em
                    garantias)
                  </li>
                )}
              </>
            )}
            <li className={analise.erros.length ? 'texto-perigo' : undefined}>
              <strong>{analise.erros.length}</strong> linha(s) com erro (serão ignoradas)
            </li>
          </ul>

          <ListaProblemas titulo="Erros" itens={analise.erros} classe="problemas-erro" />
          <ListaProblemas titulo="Avisos" itens={analise.avisos} classe="problemas-aviso" />

          {quantidade > 0 && (
            <div className="tabela-container">
              <table className="tabela tabela-simples">
                <caption className="texto-suave">Primeiros {Math.min(15, quantidade)} de {quantidade}</caption>
                {analiseProdutos ? (
                  <>
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Descrição</th>
                        <th>Marcas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analiseProdutos.itens.slice(0, 15).map((p, i) => (
                        <tr key={i}>
                          <td>{p.codigo ?? '—'}</td>
                          <td>{p.descricao}</td>
                          <td>
                            {p.marcas.length === 0
                              ? '—'
                              : p.marcas.map((m) => (m.origem ? `${m.nome} (${rotuloOrigem(m.origem)})` : m.nome)).join(', ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                ) : (
                  <>
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Nome</th>
                        <th>CPF/CNPJ</th>
                        <th>Cidade/UF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analiseClientes?.itens.slice(0, 15).map((c, i) => (
                        <tr key={i}>
                          <td>{c.codigo}</td>
                          <td>{c.nome}</td>
                          <td>{c.documento ?? '—'}</td>
                          <td>{[c.cidade, c.uf].filter(Boolean).join(' / ') || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
              </table>
            </div>
          )}

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
                {resultado.linhas.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="acoes-formulario">
            <button type="button" className="botao botao-secundario" onClick={limpar} disabled={progresso !== null}>
              Escolher outro arquivo
            </button>
            <button type="button" className="botao" onClick={() => void importar()} disabled={quantidade === 0 || progresso !== null}>
              Importar {quantidade} {tipo === 'produtos' ? 'produto(s)' : 'cliente(s)'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
