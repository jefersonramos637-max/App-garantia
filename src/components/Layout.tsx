import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { AvisoAtualizacao } from './AvisoAtualizacao'
import { useAtualizacao } from '../lib/atualizacao'
import { rotuloPapel } from '../lib/constantes'
import {
  IconeClientes,
  IconeConfiguracoes,
  IconeGarantias,
  IconePainel,
  IconeProdutos,
  IconeSair,
} from './Icones'

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  return ((partes[0][0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

export function Layout() {
  const { perfil, podeEditar, sair } = useAuth()
  const [menuAberto, setMenuAberto] = useState(false)
  const local = useLocation()
  const { estado: atualizacao } = useAtualizacao()
  const temAtualizacao = atualizacao?.fase === 'disponivel' || atualizacao?.fase === 'baixando'

  useEffect(() => {
    setMenuAberto(false)
  }, [local.pathname])

  const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-link ativo' : 'nav-link')
  const nome = perfil?.nome || perfil?.email || ''

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
        <img src="/icone-192.png" alt="" width="26" height="26" />
        <span className="marca-app">Garantias</span>
      </header>

      <aside className="menu-lateral" id="menu-lateral">
        <div className="menu-marca">
          <img src="/icone-192.png" alt="" width="34" height="34" />
          <div>
            <strong>Garantias</strong>
            <small>Lojão dos Tratores</small>
            <small>LL Tratores</small>
          </div>
        </div>

        {podeEditar && (
          <Link to="/garantias/nova" className="botao botao-bloco botao-nova">
            + Nova garantia
          </Link>
        )}

        <nav aria-label="Menu principal" className="menu-nav">
          <NavLink to="/" end className={link}>
            <IconePainel />
            Painel
          </NavLink>
          <NavLink to="/garantias" end className={link}>
            <IconeGarantias />
            Garantias
          </NavLink>
          <NavLink to="/clientes" className={link}>
            <IconeClientes />
            Clientes
          </NavLink>
          <NavLink to="/produtos" className={link}>
            <IconeProdutos />
            Produtos
          </NavLink>
        </nav>

        <div className="menu-rodape">
          <NavLink to="/configuracoes" className={link}>
            <IconeConfiguracoes />
            Configurações
            {temAtualizacao && <span className="ponto-novo" title="Atualização disponível" />}
          </NavLink>
          <div className="menu-usuario">
            <span className="avatar" aria-hidden="true">
              {iniciais(nome)}
            </span>
            <div className="menu-usuario-texto">
              <span className="usuario-nome">{nome}</span>
              <small>{rotuloPapel(perfil?.papel)}</small>
            </div>
            <button type="button" className="botao-icone botao-sair" onClick={() => void sair()} aria-label="Sair" title="Sair">
              <IconeSair />
            </button>
          </div>
        </div>
      </aside>
      <div className="fundo-menu" aria-hidden="true" onClick={() => setMenuAberto(false)} />

      <main className="conteudo" id="conteudo">
        <AvisoAtualizacao />
        <Outlet />
      </main>
    </div>
  )
}
