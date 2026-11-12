
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "anexos": {
                  Row: {
                    "caminho": string,"criado_em": string,"enviado_por": string | null,"garantia_id": number,"id": number,"nome_arquivo": string,"tamanho_bytes": number | null,"tipo_mime": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "caminho": string,"criado_em"?: string,"enviado_por"?: string | null,"garantia_id": number,"id"?: never,"nome_arquivo": string,"tamanho_bytes"?: number | null,"tipo_mime"?: string | null
                  }
                  Update: {
                    "caminho"?: string,"criado_em"?: string,"enviado_por"?: string | null,"garantia_id"?: number,"id"?: never,"nome_arquivo"?: string,"tamanho_bytes"?: number | null,"tipo_mime"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "anexos_enviado_por_fkey"
      columns: ["enviado_por"]
isOneToOne: false
      referencedRelation: "perfis"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "anexos_garantia_id_fkey"
      columns: ["garantia_id"]
isOneToOne: false
      referencedRelation: "garantias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "anexos_garantia_id_fkey"
      columns: ["garantia_id"]
isOneToOne: false
      referencedRelation: "vw_garantias"
      referencedColumns: ["id"]
    }
                  ]
                },"auditoria": {
                  Row: {
                    "criado_em": string,"dados_antigos": Json | null,"dados_novos": Json | null,"id": number,"operacao": string,"registro_id": string | null,"tabela": string,"usuario_email": string | null,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"dados_antigos"?: Json | null,"dados_novos"?: Json | null,"id"?: never,"operacao": string,"registro_id"?: string | null,"tabela": string,"usuario_email"?: string | null,"usuario_id"?: string | null
                  }
                  Update: {
                    "criado_em"?: string,"dados_antigos"?: Json | null,"dados_novos"?: Json | null,"id"?: never,"operacao"?: string,"registro_id"?: string | null,"tabela"?: string,"usuario_email"?: string | null,"usuario_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"clientes": {
                  Row: {
                    "ativo": boolean,"atualizado_em": string,"busca": string,"chave_codigo": string,"cidade": string | null,"codigo": string,"criado_em": string,"documento": string | null,"id": number,"nome": string,"telefone": string | null,"uf": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"atualizado_em"?: string,"busca"?: string,"chave_codigo"?: string,"cidade"?: string | null,"codigo": string,"criado_em"?: string,"documento"?: string | null,"id"?: never,"nome": string,"telefone"?: string | null,"uf"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean,"atualizado_em"?: string,"busca"?: string,"chave_codigo"?: string,"cidade"?: string | null,"codigo"?: string,"criado_em"?: string,"documento"?: string | null,"id"?: never,"nome"?: string,"telefone"?: string | null,"uf"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"empresas": {
                  Row: {
                    "ativo": boolean,"criado_em": string,"id": number,"nome": string,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"criado_em"?: string,"id"?: number,"nome": string,"tipo": string
                  }
                  Update: {
                    "ativo"?: boolean,"criado_em"?: string,"id"?: number,"nome"?: string,"tipo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"garantia_eventos": {
                  Row: {
                    "criado_em": string,"descricao": string | null,"garantia_id": number,"id": number,"status_anterior": string | null,"status_novo": string | null,"tipo": string,"usuario_id": string | null,"usuario_nome": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"descricao"?: string | null,"garantia_id": number,"id"?: never,"status_anterior"?: string | null,"status_novo"?: string | null,"tipo": string,"usuario_id"?: string | null,"usuario_nome"?: string | null
                  }
                  Update: {
                    "criado_em"?: string,"descricao"?: string | null,"garantia_id"?: number,"id"?: never,"status_anterior"?: string | null,"status_novo"?: string | null,"tipo"?: string,"usuario_id"?: string | null,"usuario_nome"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "garantia_eventos_garantia_id_fkey"
      columns: ["garantia_id"]
isOneToOne: false
      referencedRelation: "garantias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantia_eventos_garantia_id_fkey"
      columns: ["garantia_id"]
isOneToOne: false
      referencedRelation: "vw_garantias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantia_eventos_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfis"
      referencedColumns: ["id"]
    }
                  ]
                },"garantias": {
                  Row: {
                    "atualizado_em": string,"atualizado_por": string | null,"cliente_id": number,"criado_em": string,"criado_por": string | null,"data_abertura": string,"data_conclusao": string | null,"data_venda": string | null,"defeito": string,"empresa_id": number,"fornecedor": string | null,"id": number,"marca_id": number,"nota_fiscal_compra": string | null,"nota_fiscal_venda": string | null,"observacoes": string | null,"origem": string,"produto_id": number,"protocolo_fornecedor": string | null,"quantidade": number,"resolucao": string | null,"status": string,"valor_unitario": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"atualizado_por"?: string | null,"cliente_id": number,"criado_em"?: string,"criado_por"?: string | null,"data_abertura"?: string,"data_conclusao"?: string | null,"data_venda"?: string | null,"defeito": string,"empresa_id": number,"fornecedor"?: string | null,"id"?: never,"marca_id": number,"nota_fiscal_compra"?: string | null,"nota_fiscal_venda"?: string | null,"observacoes"?: string | null,"origem": string,"produto_id": number,"protocolo_fornecedor"?: string | null,"quantidade": number,"resolucao"?: string | null,"status"?: string,"valor_unitario"?: number | null
                  }
                  Update: {
                    "atualizado_em"?: string,"atualizado_por"?: string | null,"cliente_id"?: number,"criado_em"?: string,"criado_por"?: string | null,"data_abertura"?: string,"data_conclusao"?: string | null,"data_venda"?: string | null,"defeito"?: string,"empresa_id"?: number,"fornecedor"?: string | null,"id"?: never,"marca_id"?: number,"nota_fiscal_compra"?: string | null,"nota_fiscal_venda"?: string | null,"observacoes"?: string | null,"origem"?: string,"produto_id"?: number,"protocolo_fornecedor"?: string | null,"quantidade"?: number,"resolucao"?: string | null,"status"?: string,"valor_unitario"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "garantias_atualizado_por_fkey"
      columns: ["atualizado_por"]
isOneToOne: false
      referencedRelation: "perfis"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_criado_por_fkey"
      columns: ["criado_por"]
isOneToOne: false
      referencedRelation: "perfis"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_produto_marca_fk"
      columns: ["produto_id","marca_id"]
isOneToOne: false
      referencedRelation: "produto_marcas"
      referencedColumns: ["produto_id","marca_id"]
    }
                  ]
                },"marcas": {
                  Row: {
                    "ativo": boolean,"atualizado_em": string,"chave": string,"criado_em": string,"id": number,"nome": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"atualizado_em"?: string,"chave"?: string,"criado_em"?: string,"id"?: never,"nome": string
                  }
                  Update: {
                    "ativo"?: boolean,"atualizado_em"?: string,"chave"?: string,"criado_em"?: string,"id"?: never,"nome"?: string
                  }
                  Relationships: [
                    
                  ]
                },"perfis": {
                  Row: {
                    "ativo": boolean,"atualizado_em": string,"criado_em": string,"deve_trocar_senha": boolean,"email": string,"id": string,"nome": string,"papel": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"atualizado_em"?: string,"criado_em"?: string,"deve_trocar_senha"?: boolean,"email"?: string,"id": string,"nome"?: string,"papel"?: string
                  }
                  Update: {
                    "ativo"?: boolean,"atualizado_em"?: string,"criado_em"?: string,"deve_trocar_senha"?: boolean,"email"?: string,"id"?: string,"nome"?: string,"papel"?: string
                  }
                  Relationships: [
                    
                  ]
                },"produto_marcas": {
                  Row: {
                    "ativo": boolean,"criado_em": string,"marca_id": number,"origem_padrao": string | null,"produto_id": number,"referencia": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"criado_em"?: string,"marca_id": number,"origem_padrao"?: string | null,"produto_id": number,"referencia"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean,"criado_em"?: string,"marca_id"?: number,"origem_padrao"?: string | null,"produto_id"?: number,"referencia"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "produto_marcas_marca_id_fkey"
      columns: ["marca_id"]
isOneToOne: false
      referencedRelation: "marcas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "produto_marcas_produto_id_fkey"
      columns: ["produto_id"]
isOneToOne: false
      referencedRelation: "produtos"
      referencedColumns: ["id"]
    }
                  ]
                },"produtos": {
                  Row: {
                    "ativo": boolean,"atualizado_em": string,"busca": string,"chave_codigo": string | null,"chave_descricao": string,"codigo": string | null,"criado_em": string,"descricao": string,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"atualizado_em"?: string,"busca"?: string,"chave_codigo"?: string | null,"chave_descricao"?: string,"codigo"?: string | null,"criado_em"?: string,"descricao": string,"id"?: never
                  }
                  Update: {
                    "ativo"?: boolean,"atualizado_em"?: string,"busca"?: string,"chave_codigo"?: string | null,"chave_descricao"?: string,"codigo"?: string | null,"criado_em"?: string,"descricao"?: string,"id"?: never
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "vw_garantias": {
                  Row: {
                    "atualizado_em": string,"atualizado_por": string | null,"atualizado_por_nome": string | null,"busca": string | null,"cliente_codigo": string,"cliente_id": number,"cliente_nome": string,"criado_em": string,"criado_por": string | null,"criado_por_nome": string | null,"data_abertura": string,"data_conclusao": string | null,"data_venda": string | null,"defeito": string,"empresa_id": number,"empresa_nome": string,"empresa_tipo": string,"fornecedor": string | null,"id": number,"marca_id": number,"marca_nome": string,"nota_fiscal_compra": string | null,"nota_fiscal_venda": string | null,"observacoes": string | null,"origem": string,"produto_codigo": string | null,"produto_descricao": string,"produto_id": number,"protocolo_fornecedor": string | null,"quantidade": number,"referencia": string | null,"resolucao": string | null,"status": string,"valor_total": number | null,"valor_unitario": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "garantias_atualizado_por_fkey"
      columns: ["atualizado_por"]
isOneToOne: false
      referencedRelation: "perfis"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_criado_por_fkey"
      columns: ["criado_por"]
isOneToOne: false
      referencedRelation: "perfis"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_empresa_id_fkey"
      columns: ["empresa_id"]
isOneToOne: false
      referencedRelation: "empresas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "garantias_produto_marca_fk"
      columns: ["produto_id","marca_id"]
isOneToOne: false
      referencedRelation: "produto_marcas"
      referencedColumns: ["produto_id","marca_id"]
    }
                  ]
                }
          }
          Functions: {
            "admin_definir_senha":
{ Args: { "p_senha": string,"p_usuario": string }; Returns: undefined
                           },
"admin_remover_2fa":
{ Args: { "p_usuario": string }; Returns: undefined
                           },
"alterar_status":
{ Args: { "p_comentario"?: string,"p_garantia_id": number,"p_resolucao"?: string,"p_status": string }; Returns: undefined
                           },
"atualizar_meu_nome":
{ Args: { "p_nome": string }; Returns: undefined
                           },
"confirmar_troca_senha":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"importar_clientes":
{ Args: { "p_itens": Json }; Returns: Json
                           },
"importar_produtos":
{ Args: { "p_itens": Json }; Returns: Json
                           },
"listar_usuarios":
{ Args: Record<PropertyKey, never>; Returns: {
              "ativo": boolean,"criado_em": string,"deve_trocar_senha": boolean,"dois_fatores": boolean,"email": string,"id": string,"nome": string,"papel": string,"ultimo_acesso": string
            }[]
                           },
"obter_ou_criar_marca":
{ Args: { "p_nome": string }; Returns: number
                           },
"ping":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"resumo_garantias":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"salvar_produto":
{ Args: { "p_ativo": boolean,"p_codigo": string,"p_descricao": string,"p_id"?: number,"p_marcas": Json }; Returns: number
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
