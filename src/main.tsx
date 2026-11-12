import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { erroDeConfiguracao } from './lib/config'

const raiz = createRoot(document.getElementById('root')!)
const erro = erroDeConfiguracao()

if (erro) {
  raiz.render(
    <div className="tela-cheia">
      <div className="caixa-entrada">
        <h1>Configuração incompleta</h1>
        <div className="alerta alerta-erro" role="alert">
          {erro}
        </div>
        <p className="texto-suave">
          Confira as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY na hospedagem e publique novamente. Veja o
          guia no README do projeto.
        </p>
      </div>
    </div>,
  )
} else {
  import('./App')
    .then(({ default: App }) => {
      raiz.render(
        <StrictMode>
          <App />
        </StrictMode>,
      )
    })
    .catch((e: unknown) => {
      console.error(e)
      raiz.render(
        <div className="tela-cheia">
          <div className="caixa-entrada">
            <h1>Não foi possível abrir o aplicativo</h1>
            <p>Verifique sua conexão com a internet e recarregue a página.</p>
          </div>
        </div>,
      )
    })
}
