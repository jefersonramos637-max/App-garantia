import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

type Tipo = 'sucesso' | 'erro' | 'info'
interface Aviso {
  id: number
  tipo: Tipo
  texto: string
}

interface ValorAvisos {
  avisar: (texto: string, tipo?: Tipo) => void
}

const AvisosContext = createContext<ValorAvisos | null>(null)

let proximoId = 1

export function AvisosProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])

  const fechar = useCallback((id: number) => setAvisos((lista) => lista.filter((a) => a.id !== id)), [])

  const avisar = useCallback(
    (texto: string, tipo: Tipo = 'sucesso') => {
      const id = proximoId++
      setAvisos((lista) => [...lista.slice(-3), { id, tipo, texto }])
      window.setTimeout(() => fechar(id), tipo === 'erro' ? 8000 : 4500)
    },
    [fechar],
  )

  const valor = useMemo(() => ({ avisar }), [avisar])

  return (
    <AvisosContext.Provider value={valor}>
      {children}
      <div className="avisos" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso aviso-${a.tipo}`}>
            <span>{a.texto}</span>
            <button type="button" className="aviso-fechar" aria-label="Fechar aviso" onClick={() => fechar(a.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </AvisosContext.Provider>
  )
}

export function useAvisos(): ValorAvisos {
  const v = useContext(AvisosContext)
  if (!v) throw new Error('useAvisos deve ser usado dentro de AvisosProvider')
  return v
}
