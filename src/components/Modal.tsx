import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

interface Props {
  aberto: boolean
  titulo: string
  aoFechar: () => void
  children: ReactNode
  rodape?: ReactNode
  largo?: boolean
}

/** Janela sobreposta usando o <dialog> nativo (acessível, fecha com Esc). */
export function Modal({ aberto, titulo, aoFechar, children, rodape, largo }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (aberto && !dialog.open) dialog.showModal()
    if (!aberto && dialog.open) dialog.close()
  }, [aberto])

  return (
    <dialog
      ref={ref}
      className={largo ? 'modal modal-largo' : 'modal'}
      aria-label={titulo}
      onCancel={(e) => {
        e.preventDefault()
        aoFechar()
      }}
    >
      {aberto && (
        <div className="modal-conteudo">
          <header className="modal-cabecalho">
            <h2>{titulo}</h2>
            <button type="button" className="botao-icone" aria-label="Fechar" onClick={aoFechar}>
              ×
            </button>
          </header>
          <div className="modal-corpo">{children}</div>
          {rodape && <footer className="modal-rodape">{rodape}</footer>}
        </div>
      )}
    </dialog>
  )
}

interface ConfirmarProps {
  aberto: boolean
  titulo: string
  mensagem: ReactNode
  textoConfirmar?: string
  perigoso?: boolean
  ocupado?: boolean
  aoConfirmar: () => void
  aoCancelar: () => void
}

export function Confirmar({
  aberto,
  titulo,
  mensagem,
  textoConfirmar = 'Confirmar',
  perigoso,
  ocupado,
  aoConfirmar,
  aoCancelar,
}: ConfirmarProps) {
  return (
    <Modal
      aberto={aberto}
      titulo={titulo}
      aoFechar={aoCancelar}
      rodape={
        <>
          <button type="button" className="botao botao-secundario" onClick={aoCancelar} disabled={ocupado}>
            Cancelar
          </button>
          <button
            type="button"
            className={perigoso ? 'botao botao-perigo' : 'botao'}
            onClick={aoConfirmar}
            disabled={ocupado}
          >
            {ocupado ? 'Aguarde…' : textoConfirmar}
          </button>
        </>
      }
    >
      <div>{mensagem}</div>
    </Modal>
  )
}
