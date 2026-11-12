// Traduz erros técnicos (banco, autenticação, rede, arquivos) para mensagens claras em português.

interface ErroGenerico {
  message?: string
  code?: string
  status?: number
  statusCode?: string | number
  details?: string | null
  name?: string
}

const MENSAGENS_RESTRICAO: Record<string, string> = {
  garantias_defeito_check: 'Descreva o defeito com pelo menos 3 caracteres.',
  garantia_itens_quantidade_check: 'A quantidade deve ser maior que zero.',
  garantia_itens_valor_unitario_check: 'Valor unitário inválido.',
  garantia_itens_origem_check: 'Informe se o produto é nacional ou importado.',
  garantia_eventos_comentario_preenchido: 'Escreva o comentário antes de enviar.',
  clientes_uf_check: 'UF inválida. Use a sigla com 2 letras (ex.: GO).',
  clientes_codigo_check: 'Informe o código do cliente (até 60 caracteres).',
  clientes_nome_check: 'Informe o nome do cliente (até 200 caracteres).',
  produtos_descricao_check: 'Informe a descrição do produto (até 300 caracteres).',
  produtos_codigo_check: 'Código do produto com no máximo 60 caracteres.',
  marcas_nome_check: 'Informe o nome da marca (até 120 caracteres).',
}

const MENSAGENS_UNICIDADE: Record<string, string> = {
  clientes_chave_codigo_key: 'Já existe um cliente com este código.',
  produtos_codigo_unico: 'Já existe um produto com este código.',
  produtos_descricao_sem_codigo_unica: 'Já existe um produto sem código com esta descrição.',
  marcas_chave_key: 'Já existe uma marca com este nome.',
  produto_marcas_pkey: 'Esta marca já está vinculada ao produto.',
  empresas_nome_key: 'Já existe uma empresa com este nome.',
}

function comoErro(e: unknown): ErroGenerico {
  if (e && typeof e === 'object') return e as ErroGenerico
  if (typeof e === 'string') return { message: e }
  return {}
}

/** Mensagens que nós mesmos escrevemos no banco (raise exception) já estão em português. */
function mensagemPropriaDoBanco(msg: string): boolean {
  return /[áéíóúãõçÁÉÍÓÚÃÕÇ]|^(Item|Envie|Informe|Somente|Garantia|Você|Faça|Acesso|Não)/.test(msg)
}

export function mensagemErro(e: unknown): string {
  const erro = comoErro(e)
  const msg = erro.message ?? ''
  const codigo = erro.code ?? ''

  // Rede / servidor fora do ar
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(msg)) {
    return 'Sem conexão com o servidor. Verifique a internet e tente novamente.'
  }

  // Autenticação
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (/email not confirmed/i.test(msg)) return 'E-mail ainda não confirmado. Fale com o administrador.'
  if (erro.status === 429 || /rate limit|too many requests/i.test(msg)) {
    return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.'
  }
  if (/should be different from the old password|same_password/i.test(msg + codigo)) {
    return 'A nova senha deve ser diferente da senha atual.'
  }
  if (codigo === 'weak_password' || /password.*(weak|at least|characters|should contain)/i.test(msg)) {
    return 'Senha fraca. Use pelo menos 10 caracteres, com letra maiúscula, minúscula e número.'
  }
  if (/invalid totp|mfa_verification_failed|invalid.*code/i.test(msg + codigo)) {
    return 'Código inválido ou expirado. Confira o aplicativo autenticador e tente novamente.'
  }
  if (/jwt expired|refresh token|session.*(missing|not found)|PGRST301|PGRST303/i.test(msg + codigo)) {
    return 'Sua sessão expirou. Entre novamente.'
  }
  if (/aal2|AAL2 required|insufficient_aal/i.test(msg + codigo)) {
    return 'Confirme o código de verificação em duas etapas para continuar.'
  }

  // Arquivos (Storage)
  if (/exceeded the maximum allowed size|payload too large|entity too large/i.test(msg) || erro.statusCode === '413') {
    return 'Arquivo grande demais (máximo 10 MB).'
  }
  if (/mime type .* is not supported|InvalidMimeType/i.test(msg + codigo)) {
    return 'Tipo de arquivo não permitido. Envie fotos (JPG, PNG, WEBP) ou PDF.'
  }

  // Banco ainda no formato antigo (script de atualização não foi rodado no Supabase)
  if (
    codigo === 'PGRST202' || codigo === 'PGRST204' || codigo === '42703' || codigo === '42883' || codigo === 'PGRST200' ||
    /could not find the function|schema cache|garantia_itens|does not exist/i.test(msg)
  ) {
    return 'O banco de dados precisa ser atualizado para esta versão. Cole o script atualizado no SQL Editor do Supabase (guia, passo A2) e tente de novo.'
  }

  // Banco de dados (PostgreSQL / PostgREST)
  switch (codigo) {
    case '23505': {
      const chave = Object.keys(MENSAGENS_UNICIDADE).find((k) => msg.includes(k))
      return chave ? MENSAGENS_UNICIDADE[chave] : 'Já existe um registro igual cadastrado.'
    }
    case '23503':
      if (/update or delete on table/i.test(msg)) {
        return 'Este registro está em uso (por exemplo, em garantias) e não pode ser excluído. Desative-o em vez de excluir.'
      }
      return 'Um dos itens selecionados não existe mais ou não combina (ex.: marca não vinculada ao produto). Atualize a página e tente de novo.'
    case '23514': {
      const chave = Object.keys(MENSAGENS_RESTRICAO).find((k) => msg.includes(k))
      return chave ? MENSAGENS_RESTRICAO[chave] : 'Algum campo tem um valor inválido. Revise os dados.'
    }
    case '23502':
      return 'Preencha todos os campos obrigatórios.'
    case '22P02':
    case '22003':
    case '22007':
    case '22008':
      return 'Algum número ou data está em formato inválido.'
    case '57014':
      return 'A operação demorou demais. Tente novamente (se for importação, use um arquivo menor).'
    case '42501':
    case 'P0001':
    case 'P0002':
    case '22023':
      if (msg && mensagemPropriaDoBanco(msg)) return msg
      return 'Você não tem permissão para esta ação.'
  }

  if (/row-level security|permission denied|not authorized|unauthorized/i.test(msg)) {
    return 'Você não tem permissão para esta ação.'
  }

  if (msg && mensagemPropriaDoBanco(msg)) return msg
  return 'Ocorreu um erro inesperado. Tente novamente. Se continuar, avise o administrador.'
}
