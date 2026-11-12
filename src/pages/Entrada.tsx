// Telas de acesso: login, código de 2 etapas, troca de senha e acesso pendente.
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { marcarInicioDeSessao, useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { mensagemErro } from '../lib/erros'
import { regrasSenha, senhaValida } from '../lib/senha'
import { Carregando } from '../components/Comuns'

function CaixaEntrada({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <div className="tela-entrada">
      <div className="caixa-entrada">
        <img src="/logo.png" alt="Lojão dos Tratores" className="entrada-logo-faixa" width="1280" height="315" />
        <h1>{titulo}</h1>
        {subtitulo && <p className="texto-suave">{subtitulo}</p>}
        {children}
      </div>
      <p className="entrada-rodape">Acesso restrito a pessoas autorizadas. Todas as ações ficam registradas.</p>
    </div>
  )
}

export function CampoSenha({
  id,
  valor,
  aoMudar,
  autoComplete,
  rotulo,
}: {
  id: string
  valor: string
  aoMudar: (v: string) => void
  autoComplete: string
  rotulo: string
}) {
  const [visivel, setVisivel] = useState(false)
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <div className="campo-senha">
        <input
          id={id}
          type={visivel ? 'text' : 'password'}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          autoComplete={autoComplete}
          required
          maxLength={72}
        />
        <button
          type="button"
          className="botao-link"
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {visivel ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
    </div>
  )
}

export function Login() {
  const { aviso, limparAviso } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    limparAviso()
    setEnviando(true)
    try {
      marcarInicioDeSessao()
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: senha })
      if (error) throw error
    } catch (er) {
      setErro(mensagemErro(er))
      setEnviando(false)
    }
  }

  return (
    <CaixaEntrada titulo="Entrar">
      {aviso && <div className="alerta alerta-info">{aviso}</div>}
      <form onSubmit={entrar} className="formulario" noValidate={false}>
        <div className="campo">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            inputMode="email"
            required
            autoFocus
          />
        </div>
        <CampoSenha id="senha" rotulo="Senha" valor={senha} aoMudar={setSenha} autoComplete="current-password" />
        {erro && (
          <div className="alerta alerta-erro" role="alert">
            {erro}
          </div>
        )}
        <button type="submit" className="botao botao-bloco" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p className="texto-suave texto-pequeno">Esqueceu a senha? Peça ao administrador para redefinir.</p>
    </CaixaEntrada>
  )
}

export function VerificarCodigo() {
  const { sair, recarregarPerfil } = useAuth()
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function verificar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      const { data: fatores, error: erroFatores } = await supabase.auth.mfa.listFactors()
      if (erroFatores) throw erroFatores
      const fator = fatores.totp.find((f) => f.status === 'verified')
      if (!fator) throw new Error('Nenhum aplicativo autenticador encontrado. Fale com o administrador.')
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo.replace(/\D/g, '') })
      if (error) throw error
      recarregarPerfil()
    } catch (er) {
      setErro(er instanceof Error && er.message.startsWith('Nenhum') ? er.message : mensagemErro(er))
      setCodigo('')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <CaixaEntrada
      titulo="Verificação em duas etapas"
      subtitulo="Abra o aplicativo autenticador no seu celular e digite o código de 6 dígitos."
    >
      <form onSubmit={verificar} className="formulario">
        <div className="campo">
          <label htmlFor="codigo">Código</label>
          <input
            id="codigo"
            className="campo-codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            required
            autoFocus
          />
        </div>
        {erro && (
          <div className="alerta alerta-erro" role="alert">
            {erro}
          </div>
        )}
        <button type="submit" className="botao botao-bloco" disabled={enviando || codigo.replace(/\D/g, '').length !== 6}>
          {enviando ? 'Verificando…' : 'Confirmar'}
        </button>
        <button type="button" className="botao botao-secundario botao-bloco" onClick={() => void sair()}>
          Voltar / sair
        </button>
      </form>
      <p className="texto-suave texto-pequeno">Perdeu o celular? Peça ao administrador para remover a verificação.</p>
    </CaixaEntrada>
  )
}

export function TrocarSenha() {
  const { recuperacao, concluirRecuperacao, recarregarPerfil, sair, perfil } = useAuth()
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const regras = regrasSenha(senha)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!senhaValida(senha)) {
      setErro('A senha não atende aos requisitos abaixo.')
      return
    }
    if (senha !== confirmacao) {
      setErro('A confirmação não é igual à nova senha.')
      return
    }
    setEnviando(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) throw error
      const { error: erroPerfil } = await supabase.rpc('confirmar_troca_senha')
      if (erroPerfil) throw erroPerfil
      concluirRecuperacao()
      recarregarPerfil()
    } catch (er) {
      setErro(mensagemErro(er))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <CaixaEntrada
      titulo={recuperacao ? 'Redefinir senha' : 'Crie sua senha'}
      subtitulo={
        recuperacao
          ? 'Digite a nova senha.'
          : `Olá${perfil?.nome ? `, ${perfil.nome}` : ''}! Por segurança, troque a senha provisória por uma senha só sua.`
      }
    >
      <form onSubmit={salvar} className="formulario">
        <CampoSenha id="nova-senha" rotulo="Nova senha" valor={senha} aoMudar={setSenha} autoComplete="new-password" />
        <ul className="regras-senha" aria-label="Requisitos da senha">
          {regras.map((r) => (
            <li key={r.texto} className={r.ok ? 'ok' : undefined}>
              {r.ok ? '✓' : '•'} {r.texto}
            </li>
          ))}
        </ul>
        <CampoSenha
          id="confirmar-senha"
          rotulo="Confirme a nova senha"
          valor={confirmacao}
          aoMudar={setConfirmacao}
          autoComplete="new-password"
        />
        {erro && (
          <div className="alerta alerta-erro" role="alert">
            {erro}
          </div>
        )}
        <button type="submit" className="botao botao-bloco" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Salvar nova senha'}
        </button>
        <button type="button" className="botao botao-secundario botao-bloco" onClick={() => void sair()}>
          Sair
        </button>
      </form>
    </CaixaEntrada>
  )
}

export function AcessoPendente() {
  const { perfil, sair, recarregarPerfil, carregandoPerfil } = useAuth()

  return (
    <CaixaEntrada titulo="Acesso aguardando liberação">
      <p>
        Seu usuário <strong>{perfil?.email}</strong> existe, mas ainda não foi liberado (ou foi desativado) pelo
        administrador.
      </p>
      <p className="texto-suave">Peça ao administrador para ativar seu acesso e depois clique em “Verificar novamente”.</p>
      <div className="formulario">
        <button
          type="button"
          className="botao botao-bloco"
          disabled={carregandoPerfil}
          onClick={recarregarPerfil}
        >
          {carregandoPerfil ? 'Verificando…' : 'Verificar novamente'}
        </button>
        <button type="button" className="botao botao-secundario botao-bloco" onClick={() => void sair()}>
          Sair
        </button>
      </div>
    </CaixaEntrada>
  )
}

export function ErroPerfil({ mensagem }: { mensagem: string }) {
  const { recarregarPerfil, sair, carregandoPerfil } = useAuth()
  return (
    <CaixaEntrada titulo="Não foi possível carregar seus dados">
      <div className="alerta alerta-erro" role="alert">
        {mensagem}
      </div>
      {carregandoPerfil ? (
        <Carregando />
      ) : (
        <div className="formulario">
          <button type="button" className="botao botao-bloco" onClick={recarregarPerfil}>
            Tentar de novo
          </button>
          <button type="button" className="botao botao-secundario botao-bloco" onClick={() => void sair()}>
            Sair
          </button>
        </div>
      )}
    </CaixaEntrada>
  )
}
