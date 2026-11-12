import { Link, RouterProvider, createBrowserRouter, useParams, useRouteError } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { AvisosProvider } from './components/Avisos'
import { Layout } from './components/Layout'
import { TelaCarregando } from './components/Comuns'
import { AcessoPendente, ErroPerfil, Login, TrocarSenha, VerificarCodigo } from './pages/Entrada'
import { Painel } from './pages/Painel'
import { Garantias } from './pages/Garantias'
import { GarantiaForm } from './pages/GarantiaForm'
import { GarantiaDetalhe } from './pages/GarantiaDetalhe'
import { Clientes, Marcas, Produtos } from './pages/Cadastros'
import { Importar } from './pages/Importar'
import { Auditoria, Usuarios } from './pages/Administracao'
import { MinhaConta } from './pages/MinhaConta'

function NaoEncontrado() {
  return (
    <div className="pagina">
      <h1>Página não encontrada</h1>
      <p>
        <Link to="/">Voltar ao painel</Link>
      </p>
    </div>
  )
}

function ErroDeTela() {
  const erro = useRouteError()
  console.error(erro)
  return (
    <div className="tela-cheia">
      <div className="caixa-entrada">
        <h1>Algo deu errado nesta tela</h1>
        <p>Recarregue a página. Se o problema continuar, avise o administrador.</p>
        <button type="button" className="botao" onClick={() => window.location.assign('/')}>
          Recarregar
        </button>
      </div>
    </div>
  )
}

/** Recria a tela quando o número da garantia muda (evita mostrar dados da anterior). */
function DetalheGarantia() {
  const { id } = useParams()
  return <GarantiaDetalhe key={id} />
}

function EditarGarantia() {
  const { id } = useParams()
  return <GarantiaForm key={`editar-${id}`} />
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <ErroDeTela />,
    children: [
      { index: true, element: <Painel /> },
      { path: 'garantias', element: <Garantias /> },
      { path: 'garantias/nova', element: <GarantiaForm key="nova" /> },
      { path: 'garantias/:id', element: <DetalheGarantia /> },
      { path: 'garantias/:id/editar', element: <EditarGarantia /> },
      { path: 'clientes', element: <Clientes /> },
      { path: 'produtos', element: <Produtos /> },
      { path: 'marcas', element: <Marcas /> },
      { path: 'importar', element: <Importar /> },
      { path: 'usuarios', element: <Usuarios /> },
      { path: 'auditoria', element: <Auditoria /> },
      { path: 'minha-conta', element: <MinhaConta /> },
      { path: '*', element: <NaoEncontrado /> },
    ],
  },
])

/** Decide o que mostrar conforme a situação do login. */
function Portao() {
  const { iniciando, sessao, perfilPronto, precisaCodigo, perfil, erroPerfil, recuperacao } = useAuth()
  if (iniciando) return <TelaCarregando />
  if (!sessao) return <Login />
  if (!perfilPronto) return <TelaCarregando />
  if (precisaCodigo) return <VerificarCodigo />
  if (erroPerfil && !perfil) return <ErroPerfil mensagem={erroPerfil} />
  if (recuperacao) return <TrocarSenha />
  if (!perfil || !perfil.ativo) return <AcessoPendente />
  if (perfil.deve_trocar_senha) return <TrocarSenha />
  return <RouterProvider router={router} />
}

export default function App() {
  return (
    <AuthProvider>
      <AvisosProvider>
        <Portao />
      </AvisosProvider>
    </AuthProvider>
  )
}
