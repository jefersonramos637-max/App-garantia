import { useState } from 'react'
import { useAtualizacao } from '../lib/atualizacao'

const CHAVE = 'garantias-atualizacao-adiada'

function versaoAdiada(): string | null {
  try {
    return sessionStorage.getItem(CHAVE)
  } catch {
    return null
  }
}

/** Faixa discreta no topo do programa quando há versão nova. */
export function AvisoAtualizacao() {
  const { estado, atualizar } = useAtualizacao()
  const [adiada, setAdiada] = useState(versaoAdiada)

  if (!estado) return null
  const { fase, versaoNova, percentual } = estado
  const emAndamento = fase === 'baixando' || fase === 'pronto'
  const mostrarDisponivel = fase === 'disponivel' && adiada !== versaoNova
  if (!emAndamento && !mostrarDisponivel) return null

  return (
    <div className="aviso-atualizacao" role="status" aria-live="polite">
      <span className="aviso-atualizacao-ponto" aria-hidden="true" />
      {fase === 'disponivel' && (
        <>
          <div className="aviso-atualizacao-texto">
            <strong>Nova versão disponível</strong>
            <span>
              Garantias {versaoNova} · você usa a {estado.versaoAtual}
            </span>
          </div>
          <div className="aviso-atualizacao-acoes">
            <button type="button" className="aviso-atualizacao-secundario" onClick={() => {
              try {
                sessionStorage.setItem(CHAVE, versaoNova ?? '')
              } catch {
                /* ignora */
              }
              setAdiada(versaoNova)
            }}>
              Depois
            </button>
            <button type="button" className="aviso-atualizacao-principal" onClick={() => void atualizar()}>
              Atualizar agora
            </button>
          </div>
        </>
      )}
      {fase === 'baixando' && (
        <div className="aviso-atualizacao-texto aviso-atualizacao-largo">
          <strong>Baixando atualização… {percentual}%</strong>
          <span className="aviso-atualizacao-trilho" aria-hidden="true">
            <span className="aviso-atualizacao-barra" style={{ width: `${percentual}%` }} />
          </span>
        </div>
      )}
      {fase === 'pronto' && (
        <div className="aviso-atualizacao-texto">
          <strong>Atualização instalada</strong>
          <span>O programa vai reiniciar em instantes…</span>
        </div>
      )}
    </div>
  )
}
