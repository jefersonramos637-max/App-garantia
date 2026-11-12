import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

/** Valor que só muda depois de X ms sem alterações (para buscas enquanto digita). */
export function useAtrasado<T>(valor: T, ms = 300): T {
  const [atrasado, setAtrasado] = useState(valor)
  useEffect(() => {
    const t = window.setTimeout(() => setAtrasado(valor), ms)
    return () => window.clearTimeout(t)
  }, [valor, ms])
  return atrasado
}

type TabelaTempoReal = 'garantias' | 'garantia_eventos' | 'anexos'

/**
 * Chama `aoMudar` sempre que alguém (em qualquer aparelho) altera as tabelas
 * indicadas. É o que faz as informações aparecerem na hora para todos.
 */
export function useTempoReal(tabelas: TabelaTempoReal[], aoMudar: () => void, filtroGarantiaId?: number) {
  const callback = useRef(aoMudar)
  useEffect(() => {
    callback.current = aoMudar
  })
  const chave = tabelas.join(',')

  useEffect(() => {
    let timer: number | undefined
    const disparar = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => callback.current(), 400)
    }
    const canal = supabase.channel(`tempo-real-${chave}-${filtroGarantiaId ?? 'todos'}-${Math.random().toString(36).slice(2)}`)
    for (const tabela of chave.split(',') as TabelaTempoReal[]) {
      const filtro =
        filtroGarantiaId === undefined
          ? undefined
          : tabela === 'garantias'
            ? `id=eq.${filtroGarantiaId}`
            : `garantia_id=eq.${filtroGarantiaId}`
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabela, filter: filtro }, disparar)
    }
    canal.subscribe()
    return () => {
      window.clearTimeout(timer)
      void supabase.removeChannel(canal)
    }
  }, [chave, filtroGarantiaId])
}

/** Avisa antes de sair da página com alterações não salvas (fechar aba/recarregar). */
export function useAvisoSaida(ativo: boolean) {
  useEffect(() => {
    if (!ativo) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [ativo])
}
