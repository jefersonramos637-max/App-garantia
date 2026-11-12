import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAvisos } from '../components/Avisos'
import { mensagemErro } from '../lib/erros'
import { regrasSenha, senhaValida } from '../lib/senha'
import { rotuloPapel } from '../lib/constantes'
import { configuracao } from '../lib/config'
import { CampoSenha } from './Entrada'
import { Carregando, MensagemErro } from '../components/Comuns'
import { Confirmar } from '../components/Modal'

interface Cadastro2fa {
  fatorId: string
  qr: string
  segredo: string
}

export function MinhaConta() {
  const { perfil, recarregarPerfil, sair } = useAuth()
  const { avisar } = useAvisos()

  const [nome, setNome] = useState(perfil?.nome ?? '')
  const [salvandoNome, setSalvandoNome] = useState(false)

  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erroSenha, setErroSenha] = useState<string | null>(null)
  const [salvandoSenha, setSalvandoSenha] = useState(false)

  const [fatorAtivo, setFatorAtivo] = useState<string | null | undefined>(undefined)
  const [cadastro, setCadastro] = useState<Cadastro2fa | null>(null)
  const [codigo, setCodigo] = useState('')
  const [erro2fa, setErro2fa] = useState<string | null>(null)
  const [ocupado2fa, setOcupado2fa] = useState(false)
  const [confirmarDesativar, setConfirmarDesativar] = useState(false)
  const [confirmarSairTodos, setConfirmarSairTodos] = useState(false)

  const carregarFatores = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) {
      setErro2fa(mensagemErro(error))
      setFatorAtivo(null)
      return
    }
    setFatorAtivo(data.totp.find((f) => f.status === 'verified')?.id ?? null)
  }, [])

  useEffect(() => {
    void carregarFatores()
  }, [carregarFatores])

  async function salvarNome(e: FormEvent) {
    e.preventDefault()
    setSalvandoNome(true)
    try {
      const { error } = await supabase.rpc('atualizar_meu_nome', { p_nome: nome })
      if (error) throw error
      avisar('Nome atualizado.')
      recarregarPerfil()
    } catch (er) {
      avisar(mensagemErro(er), 'erro')
    } finally {
      setSalvandoNome(false)
    }
  }

  async function trocarSenha(e: FormEvent) {
    e.preventDefault()
    setErroSenha(null)
    if (!senhaValida(senha)) {
      setErroSenha('A senha não atende aos requisitos.')
      return
    }
    if (senha !== confirmacao) {
      setErroSenha('A confirmação não é igual à nova senha.')
      return
    }
    setSalvandoSenha(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) throw error
      setSenha('')
      setConfirmacao('')
      avisar('Senha alterada com sucesso.')
    } catch (er) {
      setErroSenha(mensagemErro(er))
    } finally {
      setSalvandoSenha(false)
    }
  }

  async function iniciar2fa() {
    setErro2fa(null)
    setOcupado2fa(true)
    try {
      // Remove tentativas anteriores não concluídas.
      const { data: lista } = await supabase.auth.mfa.listFactors()
      for (const f of lista?.all ?? []) {
        if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Celular ${new Date().toLocaleString('pt-BR')}`,
        issuer: 'Garantias Lojão dos Tratores',
      })
      if (error) throw error
      setCadastro({ fatorId: data.id, qr: data.totp.qr_code, segredo: data.totp.secret })
      setCodigo('')
    } catch (er) {
      setErro2fa(mensagemErro(er))
    } finally {
      setOcupado2fa(false)
    }
  }

  async function confirmar2fa(e: FormEvent) {
    e.preventDefault()
    if (!cadastro) return
    setErro2fa(null)
    setOcupado2fa(true)
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: cadastro.fatorId, code: codigo.replace(/\D/g, '') })
      if (error) throw error
      setCadastro(null)
      avisar('Verificação em duas etapas ativada! A partir de agora, o código será pedido ao entrar.')
      await carregarFatores()
    } catch (er) {
      setErro2fa(mensagemErro(er))
    } finally {
      setOcupado2fa(false)
    }
  }

  async function desativar2fa() {
    if (!fatorAtivo) return
    setOcupado2fa(true)
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: fatorAtivo })
      if (error) throw error
      await supabase.auth.refreshSession()
      setConfirmarDesativar(false)
      avisar('Verificação em duas etapas desativada.')
      await carregarFatores()
    } catch (er) {
      avisar(mensagemErro(er), 'erro')
    } finally {
      setOcupado2fa(false)
    }
  }

  const regras = regrasSenha(senha)

  return (
    <div className="pagina pagina-formulario">
      <div className="pagina-cabecalho">
        <div>
          <h2 className="titulo-secao">Minha conta</h2>
          <p className="texto-suave">
            {perfil?.email} · {rotuloPapel(perfil?.papel)}
          </p>
        </div>
      </div>

      <section className="painel-bloco">
        <h2>Nome</h2>
        <form onSubmit={salvarNome} className="formulario linha-campo">
          <label htmlFor="meu-nome" className="sr-only">
            Nome
          </label>
          <input id="meu-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} required />
          <button type="submit" className="botao" disabled={salvandoNome || !nome.trim()}>
            {salvandoNome ? 'Salvando…' : 'Salvar'}
          </button>
        </form>
      </section>

      <section className="painel-bloco">
        <h2>Verificação em duas etapas</h2>
        <p className="texto-suave">
          Proteção extra: além da senha, será pedido um código do aplicativo autenticador do seu celular (Google
          Authenticator, Microsoft Authenticator, Authy…). Recomendado para administradores.
        </p>
        {fatorAtivo === undefined && <Carregando />}
        {fatorAtivo && (
          <div className="linha-campo">
            <span className="selo st-concluida">Ativada</span>
            <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => setConfirmarDesativar(true)}>
              Desativar
            </button>
          </div>
        )}
        {fatorAtivo === null && !cadastro && (
          <button type="button" className="botao" onClick={() => void iniciar2fa()} disabled={ocupado2fa}>
            {ocupado2fa ? 'Aguarde…' : 'Ativar verificação em duas etapas'}
          </button>
        )}
        {cadastro && (
          <form onSubmit={confirmar2fa} className="formulario cadastro-2fa">
            <ol>
              <li>Instale um aplicativo autenticador no celular (ex.: Google Authenticator).</li>
              <li>No aplicativo, toque em “+” e leia o código QR abaixo.</li>
              <li>Digite o código de 6 dígitos que aparecer no aplicativo.</li>
            </ol>
            <img src={cadastro.qr} alt="Código QR para o aplicativo autenticador" className="qr-2fa" width={200} height={200} />
            <p className="texto-pequeno">
              Não consegue ler o QR? Digite esta chave no aplicativo: <code className="quebra">{cadastro.segredo}</code>
            </p>
            <div className="campo">
              <label htmlFor="codigo-2fa">Código de 6 dígitos</label>
              <input
                id="codigo-2fa"
                className="campo-codigo"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
              />
            </div>
            <div className="acoes-formulario">
              <button type="button" className="botao botao-secundario" onClick={() => setCadastro(null)} disabled={ocupado2fa}>
                Cancelar
              </button>
              <button type="submit" className="botao" disabled={ocupado2fa || codigo.replace(/\D/g, '').length !== 6}>
                {ocupado2fa ? 'Verificando…' : 'Confirmar e ativar'}
              </button>
            </div>
          </form>
        )}
        {erro2fa && <MensagemErro texto={erro2fa} />}
      </section>

      <section className="painel-bloco">
        <h2>Trocar senha</h2>
        <form onSubmit={trocarSenha} className="formulario">
          <CampoSenha id="minha-nova-senha" rotulo="Nova senha" valor={senha} aoMudar={setSenha} autoComplete="new-password" />
          <ul className="regras-senha">
            {regras.map((r) => (
              <li key={r.texto} className={r.ok ? 'ok' : undefined}>
                {r.ok ? '✓' : '•'} {r.texto}
              </li>
            ))}
          </ul>
          <CampoSenha
            id="minha-confirmacao"
            rotulo="Confirme a nova senha"
            valor={confirmacao}
            aoMudar={setConfirmacao}
            autoComplete="new-password"
          />
          {erroSenha && <MensagemErro texto={erroSenha} />}
          <div>
            <button type="submit" className="botao" disabled={salvandoSenha}>
              {salvandoSenha ? 'Salvando…' : 'Trocar senha'}
            </button>
          </div>
        </form>
      </section>

      <section className="painel-bloco">
        <h2>Sessões</h2>
        <p className="texto-suave">
          Por segurança, você sai automaticamente após {configuracao.inatividadeMinutos} minutos sem usar o aplicativo.
          Se esqueceu o aplicativo aberto em outro computador ou celular, encerre todas as sessões:
        </p>
        <button type="button" className="botao botao-secundario" onClick={() => setConfirmarSairTodos(true)}>
          Sair de todos os dispositivos
        </button>
      </section>

      <Confirmar
        aberto={confirmarDesativar}
        titulo="Desativar verificação em duas etapas"
        mensagem="Sua conta ficará protegida apenas pela senha. Deseja continuar?"
        textoConfirmar="Desativar"
        perigoso
        ocupado={ocupado2fa}
        aoConfirmar={() => void desativar2fa()}
        aoCancelar={() => setConfirmarDesativar(false)}
      />
      <Confirmar
        aberto={confirmarSairTodos}
        titulo="Sair de todos os dispositivos"
        mensagem="Você será desconectado aqui e em todos os outros aparelhos."
        textoConfirmar="Sair de todos"
        aoConfirmar={() => void sair({ todosDispositivos: true, aviso: 'Você saiu de todos os dispositivos.' })}
        aoCancelar={() => setConfirmarSairTodos(false)}
      />
    </div>
  )
}
