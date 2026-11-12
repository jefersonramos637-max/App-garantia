import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Anexo, Evento, GarantiaVisao } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAvisos } from '../components/Avisos'
import { useTempoReal } from '../lib/hooks'
import { mensagemErro } from '../lib/erros'
import {
  DIAS_ALERTA,
  RESOLUCOES,
  STATUS,
  STATUS_FINAIS,
  TAMANHO_MAXIMO_ANEXO,
  TIPOS_ANEXO,
  rotuloResolucao,
  rotuloStatus,
} from '../lib/constantes'
import type { Status } from '../lib/constantes'
import {
  diasDesde,
  formatarData,
  formatarDataHora,
  formatarMoeda,
  formatarQuantidade,
  numeroGarantia,
  tamanhoArquivo,
  textoDias,
} from '../lib/formato'
import { prepararImagem } from '../lib/imagem'
import { nomeArquivoSeguro } from '../lib/exportar'
import { Carregando, MensagemErro, SeloOrigem, SeloStatus } from '../components/Comuns'
import { Confirmar, Modal } from '../components/Modal'

function Info({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="info">
      <dt>{rotulo}</dt>
      <dd>{children || '—'}</dd>
    </div>
  )
}

function textoEvento(e: Evento): string {
  switch (e.tipo) {
    case 'CRIACAO':
      return 'Garantia registrada'
    case 'STATUS':
      return `Status: ${rotuloStatus(e.status_anterior)} → ${rotuloStatus(e.status_novo)}`
    case 'EDICAO':
      return 'Dados editados'
    case 'COMENTARIO':
      return 'Comentário'
    case 'ANEXO':
      return 'Anexo'
    default:
      return e.tipo
  }
}

export function GarantiaDetalhe() {
  const { id: idParam } = useParams()
  const id = Number(idParam)
  const idValido = Number.isSafeInteger(id) && id > 0
  const { podeEditar, ehAdmin, sessao } = useAuth()
  const { avisar } = useAvisos()

  const [garantia, setGarantia] = useState<GarantiaVisao | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [naoEncontrada, setNaoEncontrada] = useState(false)

  const [comentario, setComentario] = useState('')
  const [enviandoComentario, setEnviandoComentario] = useState(false)

  const [modalStatus, setModalStatus] = useState(false)
  const [novoStatus, setNovoStatus] = useState<Status | ''>('')
  const [comentarioStatus, setComentarioStatus] = useState('')
  const [resolucaoStatus, setResolucaoStatus] = useState('')
  const [salvandoStatus, setSalvandoStatus] = useState(false)
  const [erroStatus, setErroStatus] = useState<string | null>(null)

  const [enviandoArquivos, setEnviandoArquivos] = useState<string | null>(null)
  const [anexoExcluir, setAnexoExcluir] = useState<Anexo | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const inputArquivo = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    if (!idValido) {
      setNaoEncontrada(true)
      return
    }
    try {
      const [g, ev, an] = await Promise.all([
        supabase.from('vw_garantias').select('*').eq('id', id).maybeSingle(),
        supabase.from('garantia_eventos').select('*').eq('garantia_id', id).order('criado_em', { ascending: false }),
        supabase.from('anexos').select('*').eq('garantia_id', id).order('criado_em'),
      ])
      if (g.error) throw g.error
      if (ev.error) throw ev.error
      if (an.error) throw an.error
      if (!g.data) {
        setNaoEncontrada(true)
        return
      }
      setGarantia(g.data)
      setEventos(ev.data)
      setAnexos(an.data)
      setErro(null)
      if (an.data.length > 0) {
        const { data: assinadas, error } = await supabase.storage
          .from('anexos')
          .createSignedUrls(
            an.data.map((a) => a.caminho),
            60 * 60,
          )
        if (error) throw error
        const mapa: Record<string, string> = {}
        for (const s of assinadas) if (s.path && s.signedUrl) mapa[s.path] = s.signedUrl
        setUrls(mapa)
      } else {
        setUrls({})
      }
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }, [id, idValido])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useTempoReal(['garantias', 'garantia_eventos', 'anexos'], carregar, idValido ? id : undefined)

  async function comentar(e: FormEvent) {
    e.preventDefault()
    const texto = comentario.trim()
    if (!texto) return
    setEnviandoComentario(true)
    try {
      const { error } = await supabase.from('garantia_eventos').insert({ garantia_id: id, tipo: 'COMENTARIO', descricao: texto })
      if (error) throw error
      setComentario('')
      avisar('Comentário adicionado.')
      void carregar()
    } catch (er) {
      avisar(mensagemErro(er), 'erro')
    } finally {
      setEnviandoComentario(false)
    }
  }

  function abrirStatus() {
    setNovoStatus('')
    setComentarioStatus('')
    setResolucaoStatus(garantia?.resolucao ?? '')
    setErroStatus(null)
    setModalStatus(true)
  }

  async function salvarStatus() {
    if (!novoStatus) {
      setErroStatus('Escolha o novo status.')
      return
    }
    setSalvandoStatus(true)
    setErroStatus(null)
    try {
      const { error } = await supabase.rpc('alterar_status', {
        p_garantia_id: id,
        p_status: novoStatus,
        p_comentario: comentarioStatus.trim() || undefined,
        p_resolucao: resolucaoStatus || undefined,
      })
      if (error) throw error
      setModalStatus(false)
      avisar(`Status alterado para “${rotuloStatus(novoStatus)}”.`)
      void carregar()
    } catch (e) {
      setErroStatus(mensagemErro(e))
    } finally {
      setSalvandoStatus(false)
    }
  }

  async function enviarArquivos(lista: FileList | null) {
    if (!lista || lista.length === 0) return
    const arquivos = Array.from(lista)
    let enviados = 0
    for (const [i, original] of arquivos.entries()) {
      setEnviandoArquivos(`Enviando ${i + 1} de ${arquivos.length}: ${original.name}`)
      try {
        if (!TIPOS_ANEXO.includes(original.type)) {
          throw new Error(`"${original.name}": tipo não permitido. Envie fotos (JPG, PNG, WEBP) ou PDF.`)
        }
        const arquivo = await prepararImagem(original)
        if (arquivo.size > TAMANHO_MAXIMO_ANEXO) {
          throw new Error(`"${original.name}": arquivo maior que 10 MB.`)
        }
        const sufixo = crypto.getRandomValues(new Uint32Array(1))[0].toString(36)
        const caminho = `${id}/${Date.now()}-${sufixo}-${nomeArquivoSeguro(arquivo.name)}`
        const { error: erroEnvio } = await supabase.storage
          .from('anexos')
          .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false, cacheControl: '3600' })
        if (erroEnvio) throw erroEnvio
        const { error: erroRegistro } = await supabase.from('anexos').insert({
          garantia_id: id,
          caminho,
          nome_arquivo: original.name.slice(0, 200),
          tipo_mime: arquivo.type,
          tamanho_bytes: arquivo.size,
        })
        if (erroRegistro) {
          await supabase.storage.from('anexos').remove([caminho])
          throw erroRegistro
        }
        enviados++
      } catch (e) {
        avisar(e instanceof Error && e.message.startsWith('"') ? e.message : mensagemErro(e), 'erro')
      }
    }
    setEnviandoArquivos(null)
    if (inputArquivo.current) inputArquivo.current.value = ''
    if (enviados > 0) avisar(`${enviados} arquivo(s) anexado(s).`)
    void carregar()
  }

  async function excluirAnexo() {
    if (!anexoExcluir) return
    setExcluindo(true)
    try {
      const { data, error } = await supabase.from('anexos').delete().eq('id', anexoExcluir.id).select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Você só pode excluir anexos que você mesmo enviou.')
      const { error: erroArquivo } = await supabase.storage.from('anexos').remove([anexoExcluir.caminho])
      if (erroArquivo) console.warn('Arquivo não removido do armazenamento:', erroArquivo.message)
      avisar('Anexo excluído.')
      setAnexoExcluir(null)
      void carregar()
    } catch (e) {
      avisar(e instanceof Error && e.message.startsWith('Você só') ? e.message : mensagemErro(e), 'erro')
    } finally {
      setExcluindo(false)
    }
  }

  if (naoEncontrada) {
    return (
      <div className="pagina">
        <MensagemErro texto="Garantia não encontrada." />
        <Link to="/garantias">Voltar para a lista</Link>
      </div>
    )
  }
  if (erro && !garantia) return <MensagemErro texto={erro} aoTentarDeNovo={() => void carregar()} />
  if (!garantia) return <Carregando />

  const finalizada = STATUS_FINAIS.includes(garantia.status as Status)
  const dias = diasDesde(garantia.data_abertura)
  const meuId = sessao?.user.id

  return (
    <div className="pagina pagina-detalhe">
      <div className="pagina-cabecalho">
        <div>
          <p className="texto-suave nao-imprimir">
            <Link to="/garantias">← Garantias</Link>
          </p>
          <h1>
            Garantia Nº {numeroGarantia(garantia.id)} <SeloStatus status={garantia.status} />
          </h1>
          <p className="texto-suave">
            {garantia.empresa_nome} · aberta em {formatarData(garantia.data_abertura)}
            {!finalizada && dias !== null && (
              <span className={dias > DIAS_ALERTA ? 'texto-alerta' : undefined}> · {textoDias(dias)}</span>
            )}
            {finalizada && garantia.data_conclusao && <> · finalizada em {formatarData(garantia.data_conclusao)}</>}
          </p>
        </div>
        <div className="acoes nao-imprimir">
          <button type="button" className="botao botao-secundario" onClick={() => window.print()}>
            Imprimir
          </button>
          {podeEditar && (
            <>
              <Link to={`/garantias/${garantia.id}/editar`} className="botao botao-secundario">
                Editar
              </Link>
              <button type="button" className="botao" onClick={abrirStatus}>
                Alterar status
              </button>
            </>
          )}
        </div>
      </div>

      {erro && <MensagemErro texto={erro} aoTentarDeNovo={() => void carregar()} />}

      <section className="painel-bloco">
        <dl className="grade-info">
          <Info rotulo="Cliente">
            <strong>{garantia.cliente_codigo}</strong> — {garantia.cliente_nome}
          </Info>
          <Info rotulo="Peça">
            {garantia.produto_codigo && <strong>{garantia.produto_codigo} — </strong>}
            {garantia.produto_descricao}
          </Info>
          <Info rotulo="Marca">
            {garantia.marca_nome}
            {garantia.referencia && <span className="texto-suave"> (ref. {garantia.referencia})</span>}
          </Info>
          <Info rotulo="Origem">
            <SeloOrigem origem={garantia.origem} />
          </Info>
          <Info rotulo="Empresa">{garantia.empresa_nome}</Info>
          <Info rotulo="Quantidade">{formatarQuantidade(garantia.quantidade)}</Info>
          <Info rotulo="Valor unitário">{garantia.valor_unitario !== null ? formatarMoeda(garantia.valor_unitario) : null}</Info>
          <Info rotulo="Valor total">{garantia.valor_total !== null ? formatarMoeda(garantia.valor_total) : null}</Info>
          <Info rotulo="Resolução">{garantia.resolucao ? rotuloResolucao(garantia.resolucao) : null}</Info>
          <Info rotulo="NF de venda">{garantia.nota_fiscal_venda}</Info>
          <Info rotulo="Data da venda">{garantia.data_venda ? formatarData(garantia.data_venda) : null}</Info>
          <Info rotulo="Fornecedor">{garantia.fornecedor}</Info>
          <Info rotulo="NF de compra">{garantia.nota_fiscal_compra}</Info>
          <Info rotulo="Protocolo no fornecedor">{garantia.protocolo_fornecedor}</Info>
          <Info rotulo="Registrada por">
            {garantia.criado_por_nome ?? '—'} em {formatarDataHora(garantia.criado_em)}
          </Info>
          <Info rotulo="Última alteração">
            {garantia.atualizado_por_nome ?? '—'} em {formatarDataHora(garantia.atualizado_em)}
          </Info>
        </dl>
        <div className="bloco-texto">
          <h3>Defeito / reclamação</h3>
          <p className="texto-preformatado">{garantia.defeito}</p>
        </div>
        {garantia.observacoes && (
          <div className="bloco-texto">
            <h3>Observações</h3>
            <p className="texto-preformatado">{garantia.observacoes}</p>
          </div>
        )}
      </section>

      <section className="painel-bloco">
        <div className="bloco-cabecalho">
          <h2>Fotos e documentos ({anexos.length})</h2>
          {podeEditar && (
            <div className="nao-imprimir">
              <input
                ref={inputArquivo}
                id="arquivo-anexo"
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                multiple
                onChange={(e) => void enviarArquivos(e.target.files)}
                disabled={enviandoArquivos !== null}
              />
              <label htmlFor="arquivo-anexo" className={enviandoArquivos ? 'botao botao-secundario desabilitado' : 'botao botao-secundario'}>
                + Adicionar foto ou PDF
              </label>
            </div>
          )}
        </div>
        {enviandoArquivos && <Carregando texto={enviandoArquivos} />}
        {anexos.length === 0 ? (
          <p className="texto-suave">Nenhum arquivo anexado. Fotos da peça e notas fiscais ajudam no processo com o fornecedor.</p>
        ) : (
          <ul className="anexos">
            {anexos.map((a) => {
              const url = urls[a.caminho]
              const ehImagem = a.tipo_mime?.startsWith('image/')
              return (
                <li key={a.id} className="anexo">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="anexo-previa">
                    {ehImagem && url ? <img src={url} alt={a.nome_arquivo} loading="lazy" /> : <span className="anexo-icone">PDF</span>}
                  </a>
                  <div className="anexo-info">
                    <a href={url} target="_blank" rel="noopener noreferrer" title={a.nome_arquivo}>
                      {a.nome_arquivo}
                    </a>
                    <small className="texto-suave">
                      {tamanhoArquivo(a.tamanho_bytes)} · {formatarDataHora(a.criado_em)}
                    </small>
                    {(ehAdmin || (podeEditar && a.enviado_por === meuId)) && (
                      <button type="button" className="botao-link texto-perigo nao-imprimir" onClick={() => setAnexoExcluir(a)}>
                        Excluir
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="painel-bloco">
        <h2>Andamento</h2>
        {podeEditar && (
          <form onSubmit={comentar} className="formulario-comentario nao-imprimir">
            <label htmlFor="comentario" className="sr-only">
              Novo comentário
            </label>
            <textarea
              id="comentario"
              rows={2}
              maxLength={4000}
              placeholder="Escreva um comentário sobre o andamento (ex.: contato com fornecedor)…"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
            />
            <button type="submit" className="botao" disabled={enviandoComentario || !comentario.trim()}>
              {enviandoComentario ? 'Enviando…' : 'Comentar'}
            </button>
          </form>
        )}
        <ol className="linha-tempo">
          {eventos.map((e) => (
            <li key={e.id} className={`evento evento-${e.tipo.toLowerCase()}`}>
              <div className="evento-cabecalho">
                <strong>{textoEvento(e)}</strong>
                <small className="texto-suave">
                  {e.usuario_nome ?? 'Sistema'} · {formatarDataHora(e.criado_em)}
                </small>
              </div>
              {e.descricao && e.tipo !== 'CRIACAO' && <p className="texto-preformatado">{e.descricao}</p>}
            </li>
          ))}
        </ol>
      </section>

      <Modal
        aberto={modalStatus}
        titulo="Alterar status"
        aoFechar={() => setModalStatus(false)}
        rodape={
          <>
            <button type="button" className="botao botao-secundario" onClick={() => setModalStatus(false)} disabled={salvandoStatus}>
              Cancelar
            </button>
            <button type="button" className="botao" onClick={() => void salvarStatus()} disabled={salvandoStatus}>
              {salvandoStatus ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="formulario">
          <p>
            Status atual: <SeloStatus status={garantia.status} />
          </p>
          <div className="campo">
            <label htmlFor="novo-status">Novo status</label>
            <select id="novo-status" value={novoStatus} onChange={(e) => setNovoStatus(e.target.value as Status | '')}>
              <option value="">Selecione…</option>
              {STATUS.filter((s) => s.valor !== garantia.status).map((s) => (
                <option key={s.valor} value={s.valor}>
                  {s.rotulo}
                </option>
              ))}
            </select>
          </div>
          {(novoStatus === 'APROVADA' || STATUS_FINAIS.includes(novoStatus as Status)) && (
            <div className="campo">
              <label htmlFor="resolucao-status">Resolução</label>
              <select id="resolucao-status" value={resolucaoStatus} onChange={(e) => setResolucaoStatus(e.target.value)}>
                <option value="">—</option>
                {RESOLUCOES.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {r.rotulo}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="campo">
            <label htmlFor="comentario-status">Comentário (opcional)</label>
            <textarea
              id="comentario-status"
              rows={3}
              maxLength={4000}
              value={comentarioStatus}
              onChange={(e) => setComentarioStatus(e.target.value)}
              placeholder="Ex.: enviada pela transportadora X, NF 1234"
            />
          </div>
          {erroStatus && <MensagemErro texto={erroStatus} />}
        </div>
      </Modal>

      <Confirmar
        aberto={anexoExcluir !== null}
        titulo="Excluir anexo"
        mensagem={<>Excluir o arquivo “{anexoExcluir?.nome_arquivo}”? Esta ação não pode ser desfeita.</>}
        textoConfirmar="Excluir"
        perigoso
        ocupado={excluindo}
        aoConfirmar={() => void excluirAnexo()}
        aoCancelar={() => setAnexoExcluir(null)}
      />
    </div>
  )
}
