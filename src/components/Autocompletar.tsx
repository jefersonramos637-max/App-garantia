import { useEffect, useId, useRef, useState } from 'react'
import { useAtrasado } from '../lib/hooks'
import { mensagemErro } from '../lib/erros'

interface Props<T> {
  id?: string
  valor: T | null
  aoSelecionar: (item: T | null) => void
  buscar: (termo: string) => Promise<T[]>
  rotulo: (item: T) => string
  detalhe?: (item: T) => string | null
  chave: (item: T) => string | number
  placeholder?: string
  desabilitado?: boolean
  invalido?: boolean
  acaoExtra?: { texto: string; aoClicar: (termoDigitado: string) => void }
}

/** Campo de busca com lista de sugestões (clientes, produtos, marcas). */
export function Autocompletar<T>({
  id,
  valor,
  aoSelecionar,
  buscar,
  rotulo,
  detalhe,
  chave,
  placeholder,
  desabilitado,
  invalido,
  acaoExtra,
}: Props<T>) {
  const idAuto = useId()
  const idCampo = id ?? `auto-${idAuto}`
  const idLista = `${idCampo}-lista`
  const [texto, setTexto] = useState('')
  const [editando, setEditando] = useState(false)
  const [aberto, setAberto] = useState(false)
  const [opcoes, setOpcoes] = useState<T[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ativo, setAtivo] = useState(-1)
  const requisicao = useRef(0)
  const refBuscar = useRef(buscar)
  const refInput = useRef<HTMLInputElement>(null)
  const termo = useAtrasado(texto, 250)

  useEffect(() => {
    refBuscar.current = buscar
  })

  useEffect(() => {
    if (!aberto) return
    const n = ++requisicao.current
    setCarregando(true)
    setErro(null)
    refBuscar
      .current(termo)
      .then((r) => {
        if (n !== requisicao.current) return
        setOpcoes(r)
        setAtivo(r.length ? 0 : -1)
      })
      .catch((e: unknown) => {
        if (n === requisicao.current) setErro(mensagemErro(e))
      })
      .finally(() => {
        if (n === requisicao.current) setCarregando(false)
      })
  }, [termo, aberto])

  function selecionar(item: T) {
    aoSelecionar(item)
    setTexto('')
    setEditando(false)
    setAberto(false)
  }

  const exibido = editando || !valor ? texto : rotulo(valor)

  return (
    <div className="autocompletar">
      <div className="autocompletar-entrada">
        <input
          ref={refInput}
          id={idCampo}
          type="text"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-invalid={invalido || undefined}
          aria-activedescendant={aberto && ativo >= 0 ? `${idLista}-${ativo}` : undefined}
          autoComplete="off"
          placeholder={placeholder}
          disabled={desabilitado}
          value={exibido}
          onFocus={() => setAberto(true)}
          onBlur={() => {
            window.setTimeout(() => {
              setAberto(false)
              setEditando(false)
              setTexto('')
            }, 150)
          }}
          onChange={(e) => {
            setTexto(e.target.value)
            setEditando(true)
            setAberto(true)
            if (valor) aoSelecionar(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setAberto(true)
              setAtivo((a) => Math.min(opcoes.length - 1, a + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setAtivo((a) => Math.max(0, a - 1))
            } else if (e.key === 'Enter') {
              if (aberto && ativo >= 0 && opcoes[ativo]) {
                e.preventDefault()
                selecionar(opcoes[ativo])
              }
            } else if (e.key === 'Escape') {
              setAberto(false)
            }
          }}
        />
        {valor && !desabilitado && (
          <button
            type="button"
            className="autocompletar-limpar"
            aria-label="Limpar seleção"
            onClick={() => {
              aoSelecionar(null)
              setTexto('')
              refInput.current?.focus()
            }}
          >
            ×
          </button>
        )}
      </div>
      {aberto && !desabilitado && (
        <ul className="autocompletar-lista" id={idLista} role="listbox">
          {carregando && opcoes.length === 0 && <li className="autocompletar-info">Buscando…</li>}
          {erro && <li className="autocompletar-info erro-campo">{erro}</li>}
          {!carregando && !erro && opcoes.length === 0 && (
            <li className="autocompletar-info">{termo ? 'Nenhum resultado.' : 'Digite para buscar.'}</li>
          )}
          {opcoes.map((item, i) => (
            <li
              key={chave(item)}
              id={`${idLista}-${i}`}
              role="option"
              aria-selected={i === ativo}
              className={i === ativo ? 'ativo' : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setAtivo(i)}
              onClick={() => selecionar(item)}
            >
              <span>{rotulo(item)}</span>
              {detalhe && detalhe(item) && <small>{detalhe(item)}</small>}
            </li>
          ))}
          {acaoExtra && (
            <li className="autocompletar-acao" onMouseDown={(e) => e.preventDefault()}>
              <button
                type="button"
                className="botao-link"
                onClick={() => {
                  const t = texto
                  setAberto(false)
                  acaoExtra.aoClicar(t)
                }}
              >
                {acaoExtra.texto}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
