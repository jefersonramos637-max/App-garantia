import { createClient } from '@supabase/supabase-js'
import type { Database, Tables } from './database.types'
import { configuracao } from './config'

export const CHAVE_SESSAO = 'garantias-auth'

export const supabase = createClient<Database>(configuracao.supabaseUrl, configuracao.supabaseChave, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: CHAVE_SESSAO,
  },
  realtime: {
    params: { eventsPerSecond: 5 },
  },
})

export type Perfil = Tables<'perfis'>
export type Empresa = Tables<'empresas'>
export type Cliente = Tables<'clientes'>
export type Produto = Tables<'produtos'>
export type Marca = Tables<'marcas'>
export type ProdutoMarca = Tables<'produto_marcas'>
export type Garantia = Tables<'garantias'>
export type GarantiaVisao = Tables<'vw_garantias'>
export type Evento = Tables<'garantia_eventos'>
export type Anexo = Tables<'anexos'>
export type RegistroAuditoria = Tables<'auditoria'>
