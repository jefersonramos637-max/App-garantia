import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

interface Aba {
  caminho: string
  rotulo: string
  somenteAdmin: boolean
}

const ABAS: Aba[] = [
  { caminho: 'importar', rotulo: 'Importar planilhas', somenteAdmin: true },
  { caminho: 'usuarios', rotulo: 'Usuários', somenteAdmin: true },
  { caminho: 'marcas', rotulo: 'Marcas', somenteAdmin: false },
  { caminho: 'auditoria', rotulo: 'Auditoria', somenteAdmin: true },
  { caminho: 'atualizacao', rotulo: 'Atualização', somenteAdmin: false },
  { caminho: 'conta', rotulo: 'Minha conta', somenteAdmin: false },
]

/** Tela "Configurações": agrupa importação, usuários, marcas, auditoria e conta. */
export function Configuracoes() {
  const { ehAdmin } = useAuth()
  const local = useLocation()
  const abas = ABAS.filter((a) => ehAdmin || !a.somenteAdmin)
  return (
    <div className="pagina">
      <div className="pagina-cabecalho">
        <div>
          <h1>Configurações</h1>
          <p className="texto-suave">
            {ehAdmin ? 'Planilhas, usuários, marcas, auditoria e sua conta.' : 'Marcas e sua conta.'}
          </p>
        </div>
      </div>
      <nav className="subnav" aria-label="Seções das configurações">
        {abas.map((a) => (
          <NavLink key={a.caminho} to={a.caminho} className={({ isActive }) => (isActive ? 'subnav-item ativo' : 'subnav-item')}>
            {a.rotulo}
          </NavLink>
        ))}
      </nav>
      <div key={local.pathname} className="transicao-pagina">
        <Outlet />
      </div>
    </div>
  )
}

/** /configuracoes abre a primeira seção disponível para o usuário. */
export function ConfiguracoesInicio() {
  const { ehAdmin } = useAuth()
  return <Navigate replace to={ehAdmin ? 'importar' : 'conta'} />
}
