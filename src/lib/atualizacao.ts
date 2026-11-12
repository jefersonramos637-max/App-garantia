import { useCallback, useEffect, useState } from 'react'

export interface EstadoAtualizacao {
  suportado: boolean
  fase: 'ocioso' | 'verificando' | 'disponivel' | 'atualizado' | 'baixando' | 'pronto' | 'erro'
  versaoAtual: string
  versaoNova: string | null
  percentual: number
  mensagem: string | null
}

export interface PonteDesktop {
  estadoAtualizacao: () => Promise<EstadoAtualizacao | null>
  verificarAtualizacao: () => Promise<EstadoAtualizacao | null>
  instalarAtualizacao: () => Promise<EstadoAtualizacao | null>
  aoMudarAtualizacao: (retorno: (estado: EstadoAtualizacao) => void) => () => void
}

/** Ponte com o programa do Windows; null no navegador. */
export function ponteDesktop(): PonteDesktop | null {
  return (window as unknown as { garantiasDesktop?: PonteDesktop }).garantiasDesktop ?? null
}

/** Estado da atualização e ações (somente no programa do Windows). */
export function useAtualizacao() {
  const [estado, setEstado] = useState<EstadoAtualizacao | null>(null)
  const ponte = ponteDesktop()

  useEffect(() => {
    const p = ponteDesktop()
    if (!p) return
    let ativo = true
    void p.estadoAtualizacao().then((e) => ativo && setEstado(e))
    const parar = p.aoMudarAtualizacao((e) => ativo && setEstado(e))
    return () => {
      ativo = false
      parar()
    }
  }, [])

  const verificar = useCallback(() => ponteDesktop()?.verificarAtualizacao().then(setEstado), [])
  const atualizar = useCallback(() => ponteDesktop()?.instalarAtualizacao().then(setEstado), [])
  return { ponte, estado, verificar, atualizar }
}
