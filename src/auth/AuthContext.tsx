import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { CHAVE_SESSAO, supabase } from '../lib/supabase'
import type { Perfil } from '../lib/supabase'
import { configuracao } from '../lib/config'
import { mensagemErro } from '../lib/erros'

const CHAVE_ATIVIDADE = 'garantias-ultima-atividade'

interface ValorAuth {
  sessao: Session | null
  perfil: Perfil | null
  iniciando: boolean
  carregandoPerfil: boolean
  /** O perfil do usuário logado já foi consultado ao menos uma vez. */
  perfilPronto: boolean
  erroPerfil: string | null
  /** Usuário tem 2FA ativo e ainda não digitou o código nesta sessão. */
  precisaCodigo: boolean
  /** Entrou por link de "redefinir senha". */
  recuperacao: boolean
  aviso: string | null
  ehAdmin: boolean
  podeEditar: boolean
  sair: (opcoes?: { todosDispositivos?: boolean; aviso?: string }) => Promise<void>
  recarregarPerfil: () => void
  concluirRecuperacao: () => void
  limparAviso: () => void
}

const AuthContext = createContext<ValorAuth | null>(null)

function lerAal(token: string | undefined): string | null {
  if (!token) return null
  try {
    const parte = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(parte.padEnd(parte.length + ((4 - (parte.length % 4)) % 4), '='))).aal ?? null
  } catch {
    return null
  }
}

function registrarAtividade() {
  try {
    localStorage.setItem(CHAVE_ATIVIDADE, String(Date.now()))
  } catch {
    /* navegador sem armazenamento: ignora */
  }
}

function esquecerAtividade() {
  try {
    localStorage.removeItem(CHAVE_ATIVIDADE)
  } catch {
    /* ignora */
  }
}

/**
 * Chamar imediatamente ANTES de fazer login com senha.
 * (O evento SIGNED_IN do Supabase também dispara ao reabrir a aba, por isso
 * não pode ser usado para marcar atividade.)
 */
export const marcarInicioDeSessao = registrarAtividade

function ultimaAtividade(): number | null {
  try {
    const v = Number(localStorage.getItem(CHAVE_ATIVIDADE))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [iniciando, setIniciando] = useState(true)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [carregandoPerfil, setCarregandoPerfil] = useState(false)
  const [perfilCarregadoPara, setPerfilCarregadoPara] = useState<string | null>(null)
  const [erroPerfil, setErroPerfil] = useState<string | null>(null)
  const [precisaCodigo, setPrecisaCodigo] = useState(false)
  const [recuperacao, setRecuperacao] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [versaoPerfil, setVersaoPerfil] = useState(0)
  const saindo = useRef(false)

  const sair = useCallback(async (opcoes?: { todosDispositivos?: boolean; aviso?: string }) => {
    if (saindo.current) return
    saindo.current = true
    try {
      const { error } = await supabase.auth.signOut({ scope: opcoes?.todosDispositivos ? 'global' : 'local' })
      if (error) throw error
    } catch {
      // Sem internet: apaga a sessão deste aparelho mesmo assim.
      try {
        localStorage.removeItem(CHAVE_SESSAO)
      } catch {
        /* ignora */
      }
      setSessao(null)
    } finally {
      saindo.current = false
      esquecerAtividade()
      setPerfil(null)
      setRecuperacao(false)
      setPrecisaCodigo(false)
      if (opcoes?.aviso) setAviso(opcoes.aviso)
    }
  }, [])

  // Acompanha login/logout/renovação de sessão.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evento, novaSessao) => {
      if (evento === 'PASSWORD_RECOVERY') {
        setRecuperacao(true)
        registrarAtividade()
      }
      if (evento === 'SIGNED_OUT') {
        setPerfil(null)
        setRecuperacao(false)
      }
      setSessao(novaSessao)
      setIniciando(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const idUsuario = sessao?.user.id ?? null
  const aal = lerAal(sessao?.access_token)

  // Carrega o perfil e verifica se falta o código de 2 etapas.
  useEffect(() => {
    if (!idUsuario) {
      setPerfil(null)
      setPrecisaCodigo(false)
      setErroPerfil(null)
      return
    }
    let cancelado = false
    setCarregandoPerfil(true)
    setErroPerfil(null)
    ;(async () => {
      try {
        const { data: nivel, error: erroNivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (erroNivel) throw erroNivel
        const falta = nivel.nextLevel === 'aal2' && nivel.currentLevel !== 'aal2'
        const { data, error } = await supabase.from('perfis').select('*').eq('id', idUsuario).maybeSingle()
        if (error) throw error
        if (!cancelado) {
          setPrecisaCodigo(falta)
          setPerfil(data)
          setPerfilCarregadoPara(idUsuario)
        }
      } catch (e) {
        if (!cancelado) {
          setErroPerfil(mensagemErro(e))
          setPerfilCarregadoPara(idUsuario)
        }
      } finally {
        if (!cancelado) setCarregandoPerfil(false)
      }
    })()
    return () => {
      cancelado = true
    }
  }, [idUsuario, aal, versaoPerfil])

  // Atualiza o perfil ao voltar para a aba e a cada 5 minutos
  // (se o admin desativar o usuário, o acesso é bloqueado na hora).
  useEffect(() => {
    if (!idUsuario) return
    const recarregar = () => {
      if (document.visibilityState === 'visible') setVersaoPerfil((v) => v + 1)
    }
    const intervalo = window.setInterval(recarregar, 5 * 60_000)
    document.addEventListener('visibilitychange', recarregar)
    return () => {
      window.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', recarregar)
    }
  }, [idUsuario])

  // Saída automática por inatividade (vale para todas as abas do aparelho).
  useEffect(() => {
    if (!idUsuario) return
    const limiteMs = configuracao.inatividadeMinutos * 60_000
    const verificar = () => {
      const ultima = ultimaAtividade()
      if (ultima !== null && Date.now() - ultima > limiteMs) {
        void sair({ aviso: `Sessão encerrada após ${configuracao.inatividadeMinutos} minutos sem uso. Entre novamente.` })
      }
    }
    verificar()
    if (ultimaAtividade() === null) registrarAtividade()

    let ultimoRegistro = 0
    const aoInteragir = () => {
      const agora = Date.now()
      if (agora - ultimoRegistro > 15_000) {
        ultimoRegistro = agora
        registrarAtividade()
      }
    }
    const eventos = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'] as const
    eventos.forEach((ev) => window.addEventListener(ev, aoInteragir, { passive: true }))
    const intervalo = window.setInterval(verificar, 30_000)
    document.addEventListener('visibilitychange', verificar)
    return () => {
      eventos.forEach((ev) => window.removeEventListener(ev, aoInteragir))
      window.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', verificar)
    }
  }, [idUsuario, sair])

  const valor = useMemo<ValorAuth>(
    () => ({
      sessao,
      perfil,
      iniciando,
      carregandoPerfil,
      perfilPronto: idUsuario !== null && perfilCarregadoPara === idUsuario,
      erroPerfil,
      precisaCodigo,
      recuperacao,
      aviso,
      ehAdmin: perfil?.ativo === true && perfil.papel === 'admin',
      podeEditar: perfil?.ativo === true && (perfil.papel === 'admin' || perfil.papel === 'operador'),
      sair,
      recarregarPerfil: () => setVersaoPerfil((v) => v + 1),
      concluirRecuperacao: () => setRecuperacao(false),
      limparAviso: () => setAviso(null),
    }),
    [sessao, perfil, iniciando, carregandoPerfil, perfilCarregadoPara, idUsuario, erroPerfil, precisaCodigo, recuperacao, aviso, sair],
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth(): ValorAuth {
  const v = useContext(AuthContext)
  if (!v) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return v
}
