import { useAtualizacao } from '../lib/atualizacao'

export function Atualizacao() {
  const { ponte: desktop, estado, verificar, atualizar } = useAtualizacao()

  if (!desktop) {
    return (
      <div className="painel-bloco">
        <h2 className="titulo-secao">Atualização</h2>
        <p>
          Você está usando o sistema pelo <strong>navegador</strong>, que sempre abre a versão mais recente. Para
          atualizar, basta recarregar a página (<strong>Ctrl + F5</strong>).
        </p>
        <p className="texto-suave">
          A checagem de versão com botão existe no programa instalado no Windows (Garantias.exe).
        </p>
      </div>
    )
  }

  const fase = estado?.fase ?? 'ocioso'
  const ocupado = fase === 'verificando' || fase === 'baixando' || fase === 'pronto'

  return (
    <div className="painel-bloco">
      <h2 className="titulo-secao">Atualização do programa</h2>
      <p>
        Versão instalada: <strong>{estado?.versaoAtual ?? '…'}</strong>
      </p>

      {estado && !estado.suportado && (
        <div className="alerta alerta-info">A atualização automática funciona no programa instalado no Windows.</div>
      )}
      {fase === 'verificando' && <div className="alerta alerta-info">Procurando atualização…</div>}
      {fase === 'atualizado' && <div className="alerta alerta-sucesso">Você já está na versão mais recente.</div>}
      {fase === 'disponivel' && (
        <div className="alerta alerta-info">
          Nova versão disponível: <strong>{estado?.versaoNova}</strong>
        </div>
      )}
      {fase === 'baixando' && (
        <div className="progresso" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={estado?.percentual ?? 0}>
          <div className="progresso-barra" style={{ width: `${estado?.percentual ?? 0}%` }} />
          <span>Baixando… {estado?.percentual ?? 0}%</span>
        </div>
      )}
      {fase === 'pronto' && <div className="alerta alerta-sucesso">Atualização baixada. O programa vai reiniciar…</div>}
      {fase === 'erro' && <div className="alerta alerta-erro">{estado?.mensagem}</div>}

      <div className="acoes">
        <button
          type="button"
          className="botao botao-secundario"
          disabled={ocupado || estado?.suportado === false}
          onClick={() => void verificar()}
        >
          Verificar atualização
        </button>
        {fase === 'disponivel' && (
          <button type="button" className="botao" onClick={() => void atualizar()}>
            Atualizar agora
          </button>
        )}
      </div>
      <p className="texto-suave texto-pequeno">
        O programa também procura sozinho ao abrir e a cada hora. Ao atualizar, ele reinicia em poucos segundos.
      </p>
    </div>
  )
}
