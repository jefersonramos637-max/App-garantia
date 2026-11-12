import type { ReactNode } from 'react'
import { classeStatus, rotuloOrigem, rotuloStatus } from '../lib/constantes'

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="carregando" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  )
}

export function TelaCarregando() {
  return (
    <div className="tela-cheia">
      <Carregando />
    </div>
  )
}

export function MensagemErro({ texto, aoTentarDeNovo }: { texto: string; aoTentarDeNovo?: () => void }) {
  return (
    <div className="alerta alerta-erro" role="alert">
      <span>{texto}</span>
      {aoTentarDeNovo && (
        <button type="button" className="botao botao-pequeno botao-secundario" onClick={aoTentarDeNovo}>
          Tentar de novo
        </button>
      )}
    </div>
  )
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="vazio">{children}</div>
}

export function SeloStatus({ status }: { status: string | null | undefined }) {
  return <span className={`selo ${classeStatus(status)}`}>{rotuloStatus(status)}</span>
}

export function SeloOrigem({ origem }: { origem: string | null | undefined }) {
  if (!origem) return <span className="selo">—</span>
  return <span className={`selo ${origem === 'IMPORTADO' ? 'or-importado' : 'or-nacional'}`}>{rotuloOrigem(origem)}</span>
}

interface PaginacaoProps {
  pagina: number
  porPagina: number
  total: number
  aoMudar: (pagina: number) => void
}

export function Paginacao({ pagina, porPagina, total, aoMudar }: PaginacaoProps) {
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  if (total === 0) return null
  const inicio = (pagina - 1) * porPagina + 1
  const fim = Math.min(total, pagina * porPagina)
  return (
    <nav className="paginacao" aria-label="Paginação">
      <span>
        {inicio}–{fim} de {total.toLocaleString('pt-BR')}
      </span>
      <div className="paginacao-botoes">
        <button
          type="button"
          className="botao botao-secundario botao-pequeno"
          disabled={pagina <= 1}
          onClick={() => aoMudar(pagina - 1)}
        >
          ‹ Anterior
        </button>
        <span>
          Página {pagina} de {paginas}
        </span>
        <button
          type="button"
          className="botao botao-secundario botao-pequeno"
          disabled={pagina >= paginas}
          onClick={() => aoMudar(pagina + 1)}
        >
          Próxima ›
        </button>
      </div>
    </nav>
  )
}

export function Campo({
  rotulo,
  htmlFor,
  obrigatorio,
  ajuda,
  erro,
  children,
}: {
  rotulo: string
  htmlFor?: string
  obrigatorio?: boolean
  ajuda?: ReactNode
  erro?: string | null
  children: ReactNode
}) {
  return (
    <div className={erro ? 'campo campo-com-erro' : 'campo'}>
      <label htmlFor={htmlFor}>
        {rotulo}
        {obrigatorio && <span className="obrigatorio" aria-hidden="true"> *</span>}
      </label>
      {children}
      {ajuda && !erro && <small className="ajuda">{ajuda}</small>}
      {erro && <small className="erro-campo">{erro}</small>}
    </div>
  )
}
