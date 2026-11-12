import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { rotuloPapel } from '../lib/constantes'

export function Layout() {
  const { perfil, ehAdmin, podeEditar, sair } = useAuth()
  const [menuAberto, setMenuAberto] = useState(false)
  const local = useLocation()

  useEffect(() => {
    setMenuAberto(false)
  }, [local.pathname])

  const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-link ativo' : 'nav-link')

  return (
    <div className={menuAberto ? 'layout menu-aberto' : 'layout'}>
      <header className="barra-topo">
        <button
          type="button"
          className="botao-icone botao-menu"
          aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuAberto}
          aria-controls="menu-lateral"
          onClick={() => setMenuAberto((v) => !v)}
        >
          <span aria-hidden="true">☰</span>
        </button>
        <span className="marca-app">Garantias</span>
      </header>

      <aside className="menu-lateral" id="menu-lateral">
        <div className="menu-marca">
          <strong>Garantias</strong>
          <small>Lojão dos Tratores · LL Tratores</small>
        </div>
        <nav aria-label="Menu principal">
          <NavLink to="/" end className={link}>
            Painel
          </NavLink>
          <NavLink to="/garantias" end className={link}>
            Garantias
          </NavLink>
          {podeEditar && (
            <NavLink to="/garantias/nova" className={link}>
              + Nova garantia
            </NavLink>
          )}
          <span className="nav-secao">Cadastros</span>
          <NavLink to="/clientes" className={link}>
            Clientes
          </NavLink>
          <NavLink to="/produtos" className={link}>
            Produtos
          </NavLink>
          <NavLink to="/marcas" className={link}>
            Marcas
          </NavLink>
          {ehAdmin && (
            <>
              <span className="nav-secao">Administração</span>
              <NavLink to="/importar" className={link}>
                Importar listas
              </NavLink>
              <NavLink to="/usuarios" className={link}>
                Usuários
              </NavLink>
              <NavLink to="/auditoria" className={link}>
                Auditoria
              </NavLink>
            </>
          )}
        </nav>
        <div className="menu-usuario">
          <NavLink to="/minha-conta" className={link}>
            <span className="usuario-nome">{perfil?.nome || perfil?.email}</span>
            <small>{rotuloPapel(perfil?.papel)} · Minha conta</small>
          </NavLink>
          <button type="button" className="botao botao-secundario botao-bloco" onClick={() => void sair()}>
            Sair
          </button>
        </div>
      </aside>
      <div className="fundo-menu" aria-hidden="true" onClick={() => setMenuAberto(false)} />

      <main className="conteudo" id="conteudo">
        <Outlet />
      </main>
    </div>
  )
}
