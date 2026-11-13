import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { AvisoAtualizacao } from './AvisoAtualizacao'
import { useAtualizacao } from '../lib/atualizacao'
import { rotuloPapel } from '../lib/constantes'
import {
  IconeClientes,
  IconeCompras,
  IconeConfiguracoes,
  IconeGarantias,
  IconeMenuLateral,
  IconeNotas,
  IconePainel,
  IconeProdutos,
  IconeSair,
} from './Icones'

const CHAVE_MENU = 'garantias:menu-recolhido'

function lerRecolhido(): boolean {
  try {
    return localStorage.getItem(CHAVE_MENU) === '1'
  } catch {
    return false
  }
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  return ((partes[0][0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

export function Layout() {
  const { perfil, podeEditar, ehAdmin, sair } = useAuth()
  const [menuAberto, setMenuAberto] = useState(false)
  // Menu lateral recolhido (computador): lembra a escolha neste aparelho.
  const [recolhido, setRecolhido] = useState(lerRecolhido)
  function alternarRecolhido() {
    setRecolhido((v) => {
      try {
        localStorage.setItem(CHAVE_MENU, v ? '0' : '1')
      } catch {
        /* sem armazenamento: vale só nesta sessão */
      }
      return !v
    })
  }
  const local = useLocation()
  // Cada seção (garantias, compras, configurações…) entra com animação; abas internas animam por conta própria.
  const partes = local.pathname.split('/')
  const chaveTela = partes[1] === 'compras' || partes[1] === 'configuracoes' ? `/${partes[1]}` : local.pathname
  const { estado: atualizacao } = useAtualizacao()
  const temAtualizacao = atualizacao?.fase === 'disponivel' || atualizacao?.fase === 'baixando'

  useEffect(() => {
    function atalho(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        alternarRecolhido()
      }
    }
    window.addEventListener('keydown', atalho)
    return () => window.removeEventListener('keydown', atalho)
  }, [])

  useEffect(() => {
    setMenuAberto(false)
  }, [local.pathname])

  const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-link ativo' : 'nav-link')
  const nome = perfil?.nome || perfil?.email || ''

  return (
    <div className={`layout${menuAberto ? ' menu-aberto' : ''}${recolhido ? ' menu-recolhido' : ''}`}>
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

      <button
        type="button"
        className="botao-icone botao-mostrar-menu"
        aria-label="Mostrar menu lateral"
        title="Mostrar menu (Ctrl+B)"
        onClick={alternarRecolhido}
      >
        <IconeMenuLateral />
      </button>

      <aside className="menu-lateral" id="menu-lateral" inert={recolhido && !menuAberto ? true : undefined}>
        <div className="menu-marca">
          <img src="/icone-192.png" alt="" width="34" height="34" />
          <div>
            <strong>Garantias</strong>
            <small>Lojão dos Tratores</small>
            <small>LL Tratores</small>
          </div>
          <button
            type="button"
            className="botao-icone botao-ocultar-menu"
            aria-label="Ocultar menu lateral"
            title="Ocultar menu (Ctrl+B)"
            onClick={alternarRecolhido}
          >
            <IconeMenuLateral />
          </button>
        </div>

        {podeEditar && (
          <Link to="/garantias/nova" className="botao botao-bloco botao-nova">
            + Nova garantia
          </Link>
        )}

        <nav aria-label="Menu principal" className="menu-nav">
          <span className="nav-secao">Garantias</span>
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
          {ehAdmin && (
            <>
              <span className="nav-secao">Compras</span>
              <NavLink to="/compras" end className={link}>
                <IconeCompras />
                Desempenho
              </NavLink>
              <NavLink to="/compras/notas" className={link}>
                <IconeNotas />
                Notas de entrada
              </NavLink>
            </>
          )}
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
        <div key={chaveTela} className="transicao-pagina">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
