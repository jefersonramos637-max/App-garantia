-- =============================================================================
--  APP DE GARANTIAS — Lojão dos Tratores (Matriz) / LL Tratores (Filial)
--  Migração inicial: tabelas, segurança (RLS), auditoria, anexos e funções.
--
--  COMO APLICAR NO SUPABASE (produção):
--    Painel do Supabase > SQL Editor > New query > cole TODO este arquivo > Run.
--    Execute apenas UMA vez, em um projeto novo.
--
--  PRINCÍPIOS DE SEGURANÇA
--    * Nenhum dado é acessível sem login (o papel "anon" não tem permissão).
--    * Usuário logado só acessa se o perfil estiver ATIVO (liberado pelo admin).
--    * Quem ativou a verificação em duas etapas (2FA) só acessa com o código.
--    * Papéis: admin (tudo), operador (registra/edita), consulta (somente leitura).
--    * Garantias e histórico NÃO podem ser apagados pelo aplicativo.
--    * Toda alteração fica registrada na tabela de auditoria (imutável).
-- =============================================================================

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Esquema interno: funções auxiliares que NÃO ficam expostas na API.
create schema if not exists privado;
revoke all on schema privado from public;
-- service_role: integrações no servidor (ex.: ERP) usando a chave secreta, que nunca vai ao app.
grant usage on schema privado to authenticated, service_role;

-- Remove acentos e coloca em minúsculas (usado para busca e para evitar duplicidade).
create or replace function privado.normalizar(texto text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(texto, '')))
$$;

-- Hoje no fuso de Brasília (o servidor trabalha em UTC).
create or replace function privado.hoje()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- Limpa espaços extras de um texto; devolve NULL se ficar vazio.
create or replace function privado.limpar(texto text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(coalesce(texto, ''), '\s+', ' ', 'g')), '')
$$;

-- =============================================================================
--  PERFIS DE USUÁRIO
-- =============================================================================
create table public.perfis (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text not null default '',
  nome              text not null default '' check (char_length(nome) <= 120),
  papel             text not null default 'operador' check (papel in ('admin', 'operador', 'consulta')),
  ativo             boolean not null default false,
  deve_trocar_senha boolean not null default true,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
comment on table public.perfis is 'Usuários do sistema. Novos usuários entram INATIVOS até o administrador liberar.';

-- Papel do usuário logado — NULL se não tiver acesso (inativo, ou 2FA pendente).
create or replace function privado.meu_papel()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.papel
  from public.perfis p
  where p.id = auth.uid()
    and p.ativo
    and (
      coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1
        from auth.mfa_factors f
        where f.user_id = p.id
          and f.status = 'verified'
      )
    )
$$;

create or replace function privado.tem_acesso()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select privado.meu_papel() is not null
$$;

create or replace function privado.pode_editar()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(privado.meu_papel() in ('admin', 'operador'), false)
$$;

create or replace function privado.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(privado.meu_papel() = 'admin', false)
$$;

-- Cria o perfil automaticamente quando um usuário é criado no Supabase Auth.
create or replace function privado.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, email, nome)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(
      privado.limpar(new.raw_user_meta_data ->> 'nome'),
      privado.limpar(new.raw_user_meta_data ->> 'name'),
      split_part(coalesce(new.email, ''), '@', 1)
    ), 120)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function privado.criar_perfil();

-- Mantém o e-mail do perfil igual ao do Auth.
create or replace function privado.sincronizar_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.perfis set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger ao_alterar_email_usuario
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function privado.sincronizar_email();

-- Usuários que já existiam antes desta migração também ganham perfil (inativo).
insert into public.perfis (id, email, nome)
select u.id, coalesce(u.email, ''), left(split_part(coalesce(u.email, ''), '@', 1), 120)
from auth.users u
on conflict (id) do nothing;

-- Impede remover/desativar o último administrador ativo (evita ficar trancado fora).
create or replace function privado.garantir_um_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.papel = 'admin' and old.ativo and (
       tg_op = 'DELETE'
       or new.papel <> 'admin'
       or not new.ativo
     ) then
    if not exists (
      select 1 from public.perfis
      where papel = 'admin' and ativo and id <> old.id
    ) then
      raise exception 'Não é possível remover ou desativar o último administrador ativo.'
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  new.atualizado_em := now();
  new.nome := coalesce(privado.limpar(new.nome), '');
  return new;
end;
$$;

create trigger perfis_garantir_admin
  before update or delete on public.perfis
  for each row execute function privado.garantir_um_admin();

-- Ao desativar um usuário, encerra todas as sessões abertas dele imediatamente.
create or replace function privado.encerrar_sessoes_ao_desativar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.ativo and not new.ativo then
    delete from auth.sessions where user_id = new.id;
  end if;
  return null;
end;
$$;

create trigger perfis_encerrar_sessoes
  after update of ativo on public.perfis
  for each row execute function privado.encerrar_sessoes_ao_desativar();

-- =============================================================================
--  EMPRESAS (Matriz / Filial)
-- =============================================================================
create table public.empresas (
  id        smallint generated by default as identity primary key,
  nome      text not null unique check (char_length(btrim(nome)) between 1 and 120),
  tipo      text not null check (tipo in ('MATRIZ', 'FILIAL')),
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

insert into public.empresas (nome, tipo) values
  ('Lojão dos Tratores', 'MATRIZ'),
  ('LL Tratores', 'FILIAL');

-- =============================================================================
--  MARCAS
-- =============================================================================
create table public.marcas (
  id            bigint generated always as identity primary key,
  nome          text not null check (char_length(nome) between 1 and 120),
  chave         text not null default '' unique,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create or replace function privado.marcas_preparar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome := coalesce(privado.limpar(new.nome), '');
  new.chave := privado.normalizar(new.nome);
  if tg_op = 'UPDATE' then
    new.atualizado_em := now();
    new.criado_em := old.criado_em;
  end if;
  return new;
end;
$$;

create trigger marcas_preparar
  before insert or update on public.marcas
  for each row execute function privado.marcas_preparar();

-- =============================================================================
--  PRODUTOS (peças) e as MARCAS em que cada produto é vendido
-- =============================================================================
create table public.produtos (
  id              bigint generated always as identity primary key,
  codigo          text check (codigo is null or char_length(codigo) <= 60),
  descricao       text not null check (char_length(descricao) between 1 and 300),
  chave_codigo    text,
  chave_descricao text not null default '',
  busca           text not null default '',
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- Código é único. Produtos sem código não podem repetir a descrição.
create unique index produtos_codigo_unico
  on public.produtos (chave_codigo) where chave_codigo is not null;
create unique index produtos_descricao_sem_codigo_unica
  on public.produtos (chave_descricao) where chave_codigo is null;
create index produtos_busca_trgm
  on public.produtos using gin (busca extensions.gin_trgm_ops);

create or replace function privado.produtos_preparar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.codigo := privado.limpar(new.codigo);
  new.descricao := coalesce(privado.limpar(new.descricao), '');
  new.chave_codigo := case when new.codigo is null then null else privado.normalizar(new.codigo) end;
  new.chave_descricao := privado.normalizar(new.descricao);
  new.busca := privado.normalizar(concat_ws(' ', new.codigo, new.descricao));
  if tg_op = 'UPDATE' then
    new.atualizado_em := now();
    new.criado_em := old.criado_em;
  end if;
  return new;
end;
$$;

create trigger produtos_preparar
  before insert or update on public.produtos
  for each row execute function privado.produtos_preparar();

create table public.produto_marcas (
  produto_id    bigint not null references public.produtos (id) on delete cascade,
  marca_id      bigint not null references public.marcas (id) on delete restrict,
  origem_padrao text check (origem_padrao in ('NACIONAL', 'IMPORTADO')),
  referencia    text check (referencia is null or char_length(referencia) <= 80),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  primary key (produto_id, marca_id)
);
comment on column public.produto_marcas.origem_padrao is 'Origem sugerida ao registrar garantia (NACIONAL/IMPORTADO).';
comment on column public.produto_marcas.referencia is 'Código/referência da peça no fabricante (opcional).';

create index produto_marcas_marca on public.produto_marcas (marca_id);

create or replace function privado.produto_marcas_preparar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.referencia := privado.limpar(new.referencia);
  if tg_op = 'UPDATE' then
    new.criado_em := old.criado_em;
  end if;
  return new;
end;
$$;

create trigger produto_marcas_preparar
  before insert or update on public.produto_marcas
  for each row execute function privado.produto_marcas_preparar();

-- =============================================================================
--  CLIENTES
-- =============================================================================
create table public.clientes (
  id            bigint generated always as identity primary key,
  codigo        text not null check (char_length(codigo) between 1 and 60),
  nome          text not null check (char_length(nome) between 1 and 200),
  documento     text check (documento is null or char_length(documento) <= 30),
  cidade        text check (cidade is null or char_length(cidade) <= 100),
  uf            text check (uf is null or uf ~ '^[A-Z]{2}$'),
  telefone      text check (telefone is null or char_length(telefone) <= 40),
  chave_codigo  text not null default '' unique,
  busca         text not null default '',
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index clientes_busca_trgm
  on public.clientes using gin (busca extensions.gin_trgm_ops);

create or replace function privado.clientes_preparar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.codigo := coalesce(privado.limpar(new.codigo), '');
  new.nome := coalesce(privado.limpar(new.nome), '');
  new.documento := privado.limpar(new.documento);
  new.cidade := privado.limpar(new.cidade);
  new.uf := upper(privado.limpar(new.uf));
  new.telefone := privado.limpar(new.telefone);
  new.chave_codigo := privado.normalizar(new.codigo);
  new.busca := privado.normalizar(concat_ws(' ', new.codigo, new.nome, new.documento, new.cidade));
  if tg_op = 'UPDATE' then
    new.atualizado_em := now();
    new.criado_em := old.criado_em;
  end if;
  return new;
end;
$$;

create trigger clientes_preparar
  before insert or update on public.clientes
  for each row execute function privado.clientes_preparar();

-- =============================================================================
--  GARANTIAS
-- =============================================================================
create table public.garantias (
  id                   bigint generated always as identity primary key,
  empresa_id           smallint not null references public.empresas (id),
  cliente_id           bigint not null references public.clientes (id),
  produto_id           bigint not null,
  marca_id             bigint not null,
  origem               text not null check (origem in ('NACIONAL', 'IMPORTADO')),
  quantidade           numeric(12, 3) not null check (quantidade > 0 and quantidade <= 1000000),
  valor_unitario       numeric(14, 2) check (valor_unitario is null or (valor_unitario >= 0 and valor_unitario <= 100000000)),
  status               text not null default 'ABERTA' check (status in (
                         'ABERTA', 'EM_ANALISE', 'ENVIADA_FORNECEDOR', 'APROVADA',
                         'REPROVADA', 'CONCLUIDA', 'CANCELADA')),
  resolucao            text check (resolucao is null or resolucao in (
                         'TROCA', 'CREDITO', 'REPARO', 'REEMBOLSO', 'SEM_COBERTURA')),
  data_abertura        date not null default privado.hoje(),
  data_conclusao       date,
  nota_fiscal_venda    text check (nota_fiscal_venda is null or char_length(nota_fiscal_venda) <= 60),
  data_venda           date,
  fornecedor           text check (fornecedor is null or char_length(fornecedor) <= 200),
  nota_fiscal_compra   text check (nota_fiscal_compra is null or char_length(nota_fiscal_compra) <= 60),
  protocolo_fornecedor text check (protocolo_fornecedor is null or char_length(protocolo_fornecedor) <= 60),
  defeito              text not null check (char_length(defeito) between 3 and 4000),
  observacoes          text check (observacoes is null or char_length(observacoes) <= 4000),
  criado_por           uuid references public.perfis (id) on delete set null,
  atualizado_por       uuid references public.perfis (id) on delete set null,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  constraint garantias_produto_marca_fk
    foreign key (produto_id, marca_id)
    references public.produto_marcas (produto_id, marca_id)
    on delete restrict
);

create index garantias_status on public.garantias (status);
create index garantias_empresa on public.garantias (empresa_id);
create index garantias_cliente on public.garantias (cliente_id);
create index garantias_produto_marca on public.garantias (produto_id, marca_id);
create index garantias_marca on public.garantias (marca_id);
create index garantias_data_abertura on public.garantias (data_abertura desc, id desc);
create index garantias_criado_por on public.garantias (criado_por);
create index garantias_atualizado_por on public.garantias (atualizado_por);

create or replace function privado.garantias_preparar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Atualização em cascata (ex.: um usuário foi excluído e o autor fica em branco):
  -- não altera mais nada na garantia.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    return new;
  end if;

  new.nota_fiscal_venda := privado.limpar(new.nota_fiscal_venda);
  new.fornecedor := privado.limpar(new.fornecedor);
  new.nota_fiscal_compra := privado.limpar(new.nota_fiscal_compra);
  new.protocolo_fornecedor := privado.limpar(new.protocolo_fornecedor);
  new.defeito := coalesce(btrim(new.defeito), '');
  new.observacoes := nullif(btrim(coalesce(new.observacoes, '')), '');

  -- "criado_por" não pode ser alterado pelo app (sem permissão de coluna);
  -- não é forçado aqui para permitir o ON DELETE SET NULL ao excluir um usuário.
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(auth.uid(), new.criado_por);
    new.criado_em := now();
  else
    new.criado_em := old.criado_em;
  end if;
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  new.atualizado_em := now();

  -- Data de conclusão automática para status finais.
  if new.status in ('CONCLUIDA', 'REPROVADA', 'CANCELADA') then
    if tg_op = 'INSERT' then
      new.data_conclusao := coalesce(new.data_conclusao, privado.hoje());
    elsif old.status is distinct from new.status then
      new.data_conclusao := privado.hoje();
    else
      new.data_conclusao := coalesce(new.data_conclusao, old.data_conclusao, privado.hoje());
    end if;
  else
    new.data_conclusao := null;
  end if;

  return new;
end;
$$;

create trigger garantias_preparar
  before insert or update on public.garantias
  for each row execute function privado.garantias_preparar();

-- =============================================================================
--  HISTÓRICO / ANDAMENTO DE CADA GARANTIA (imutável)
-- =============================================================================
create table public.garantia_eventos (
  id              bigint generated always as identity primary key,
  garantia_id     bigint not null references public.garantias (id) on delete cascade,
  tipo            text not null check (tipo in ('CRIACAO', 'STATUS', 'EDICAO', 'COMENTARIO', 'ANEXO')),
  status_anterior text,
  status_novo     text,
  descricao       text check (descricao is null or char_length(descricao) <= 4000),
  usuario_id      uuid references public.perfis (id) on delete set null,
  usuario_nome    text,
  criado_em       timestamptz not null default now(),
  constraint garantia_eventos_comentario_preenchido
    check (tipo <> 'COMENTARIO' or char_length(btrim(coalesce(descricao, ''))) > 0)
);

create index garantia_eventos_garantia on public.garantia_eventos (garantia_id, criado_em);
create index garantia_eventos_recentes on public.garantia_eventos (criado_em desc);
create index garantia_eventos_usuario on public.garantia_eventos (usuario_id);

create or replace function privado.eventos_preparar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.usuario_id := coalesce(auth.uid(), new.usuario_id);
  new.usuario_nome := null;
  if new.usuario_id is not null then
    select coalesce(nullif(p.nome, ''), p.email)
      into new.usuario_nome
      from public.perfis p
     where p.id = new.usuario_id;
  end if;
  new.descricao := nullif(btrim(coalesce(new.descricao, '')), '');
  new.criado_em := now();
  return new;
end;
$$;

create trigger eventos_preparar
  before insert on public.garantia_eventos
  for each row execute function privado.eventos_preparar();

create or replace function privado.nome_status(s text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case s
    when 'ABERTA' then 'Aberta'
    when 'EM_ANALISE' then 'Em análise'
    when 'ENVIADA_FORNECEDOR' then 'Enviada ao fornecedor'
    when 'APROVADA' then 'Aprovada'
    when 'REPROVADA' then 'Reprovada'
    when 'CONCLUIDA' then 'Concluída'
    when 'CANCELADA' then 'Cancelada'
    else s
  end
$$;

create or replace function privado.nome_resolucao(r text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case r
    when 'TROCA' then 'Troca da peça'
    when 'CREDITO' then 'Crédito'
    when 'REPARO' then 'Reparo'
    when 'REEMBOLSO' then 'Reembolso'
    when 'SEM_COBERTURA' then 'Sem cobertura'
    else r
  end
$$;

-- Registra automaticamente criação, mudança de status e edições.
create or replace function privado.garantias_registrar_evento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campos text[] := '{}';
  v_comentario text := nullif(btrim(coalesce(current_setting('app.comentario_status', true), '')), '');
  v_status_mudou boolean;
  v_descricao text;
begin
  if tg_op = 'INSERT' then
    insert into public.garantia_eventos (garantia_id, tipo, status_novo, descricao)
    values (new.id, 'CRIACAO', new.status, 'Garantia registrada');
    return null;
  end if;

  v_status_mudou := new.status is distinct from old.status;

  if v_status_mudou then
    v_descricao := v_comentario;
    if new.resolucao is distinct from old.resolucao and new.resolucao is not null then
      v_descricao := concat_ws(E'\n', v_descricao, 'Resolução: ' || privado.nome_resolucao(new.resolucao));
    end if;
    insert into public.garantia_eventos (garantia_id, tipo, status_anterior, status_novo, descricao)
    values (new.id, 'STATUS', old.status, new.status, v_descricao);
  end if;

  if new.empresa_id is distinct from old.empresa_id then v_campos := v_campos || 'empresa'::text; end if;
  if new.cliente_id is distinct from old.cliente_id then v_campos := v_campos || 'cliente'::text; end if;
  if new.produto_id is distinct from old.produto_id then v_campos := v_campos || 'peça'::text; end if;
  if new.marca_id is distinct from old.marca_id then v_campos := v_campos || 'marca'::text; end if;
  if new.origem is distinct from old.origem then v_campos := v_campos || 'origem'::text; end if;
  if new.quantidade is distinct from old.quantidade then v_campos := v_campos || 'quantidade'::text; end if;
  if new.valor_unitario is distinct from old.valor_unitario then v_campos := v_campos || 'valor unitário'::text; end if;
  if new.resolucao is distinct from old.resolucao and not v_status_mudou then v_campos := v_campos || 'resolução'::text; end if;
  if new.data_abertura is distinct from old.data_abertura then v_campos := v_campos || 'data de abertura'::text; end if;
  if new.nota_fiscal_venda is distinct from old.nota_fiscal_venda then v_campos := v_campos || 'NF de venda'::text; end if;
  if new.data_venda is distinct from old.data_venda then v_campos := v_campos || 'data da venda'::text; end if;
  if new.fornecedor is distinct from old.fornecedor then v_campos := v_campos || 'fornecedor'::text; end if;
  if new.nota_fiscal_compra is distinct from old.nota_fiscal_compra then v_campos := v_campos || 'NF de compra'::text; end if;
  if new.protocolo_fornecedor is distinct from old.protocolo_fornecedor then v_campos := v_campos || 'protocolo do fornecedor'::text; end if;
  if new.defeito is distinct from old.defeito then v_campos := v_campos || 'defeito'::text; end if;
  if new.observacoes is distinct from old.observacoes then v_campos := v_campos || 'observações'::text; end if;

  if cardinality(v_campos) > 0 then
    insert into public.garantia_eventos (garantia_id, tipo, descricao)
    values (new.id, 'EDICAO', 'Campos alterados: ' || array_to_string(v_campos, ', '));
  end if;

  return null;
end;
$$;

create trigger garantias_registrar_evento
  after insert or update on public.garantias
  for each row execute function privado.garantias_registrar_evento();

-- =============================================================================
--  ANEXOS (fotos da peça, notas fiscais em PDF) — arquivos no Storage privado
-- =============================================================================
create table public.anexos (
  id            bigint generated always as identity primary key,
  garantia_id   bigint not null references public.garantias (id) on delete cascade,
  caminho       text not null unique check (caminho ~ '^[0-9]+/[A-Za-z0-9._-]+$'),
  nome_arquivo  text not null check (char_length(nome_arquivo) between 1 and 200),
  tipo_mime     text check (tipo_mime is null or char_length(tipo_mime) <= 100),
  tamanho_bytes bigint check (tamanho_bytes is null or tamanho_bytes >= 0),
  enviado_por   uuid references public.perfis (id) on delete set null,
  criado_em     timestamptz not null default now(),
  constraint anexos_caminho_da_garantia check (split_part(caminho, '/', 1) = garantia_id::text)
);

create index anexos_garantia on public.anexos (garantia_id);
create index anexos_enviado_por on public.anexos (enviado_por);

create or replace function privado.anexos_preparar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.enviado_por := coalesce(auth.uid(), new.enviado_por);
  new.criado_em := now();
  return new;
end;
$$;

create trigger anexos_preparar
  before insert on public.anexos
  for each row execute function privado.anexos_preparar();

create or replace function privado.anexos_registrar_evento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.garantia_eventos (garantia_id, tipo, descricao)
    values (new.garantia_id, 'ANEXO', 'Anexo adicionado: ' || new.nome_arquivo);
    return null;
  end if;
  -- Ao excluir a garantia inteira (somente via painel do Supabase) não registra.
  if exists (select 1 from public.garantias where id = old.garantia_id) then
    insert into public.garantia_eventos (garantia_id, tipo, descricao)
    values (old.garantia_id, 'ANEXO', 'Anexo removido: ' || old.nome_arquivo);
  end if;
  return null;
end;
$$;

create trigger anexos_registrar_evento
  after insert or delete on public.anexos
  for each row execute function privado.anexos_registrar_evento();

-- =============================================================================
--  AUDITORIA (quem mudou o quê e quando) — somente leitura para administradores
-- =============================================================================
create table public.auditoria (
  id            bigint generated always as identity primary key,
  tabela        text not null,
  operacao      text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  registro_id   text,
  dados_antigos jsonb,
  dados_novos   jsonb,
  usuario_id    uuid,
  usuario_email text,
  criado_em     timestamptz not null default now()
);

create index auditoria_recentes on public.auditoria (criado_em desc);
create index auditoria_registro on public.auditoria (tabela, registro_id);

create or replace function privado.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antigo jsonb;
  v_novo jsonb;
  v_registro jsonb;
  v_id text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_antigo := to_jsonb(old) - 'busca' - 'chave' - 'chave_codigo' - 'chave_descricao';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_novo := to_jsonb(new) - 'busca' - 'chave' - 'chave_codigo' - 'chave_descricao';
  end if;

  -- Atualização que não mudou nada de fato: não registra.
  if tg_op = 'UPDATE'
     and (v_antigo - 'atualizado_em' - 'atualizado_por') = (v_novo - 'atualizado_em' - 'atualizado_por') then
    return null;
  end if;

  v_registro := coalesce(v_novo, v_antigo);
  v_id := coalesce(
    v_registro ->> 'id',
    concat_ws(':', v_registro ->> 'produto_id', v_registro ->> 'marca_id')
  );

  insert into public.auditoria (tabela, operacao, registro_id, dados_antigos, dados_novos, usuario_id, usuario_email)
  values (tg_table_name, tg_op, v_id, v_antigo, v_novo, auth.uid(), auth.jwt() ->> 'email');

  return null;
end;
$$;

create trigger auditoria after insert or update or delete on public.perfis
  for each row execute function privado.registrar_auditoria();
create trigger auditoria after insert or update or delete on public.empresas
  for each row execute function privado.registrar_auditoria();
create trigger auditoria after insert or update or delete on public.marcas
  for each row execute function privado.registrar_auditoria();
create trigger auditoria after insert or update or delete on public.produtos
  for each row execute function privado.registrar_auditoria();
create trigger auditoria after insert or update or delete on public.produto_marcas
  for each row execute function privado.registrar_auditoria();
create trigger auditoria after insert or update or delete on public.clientes
  for each row execute function privado.registrar_auditoria();
create trigger auditoria after insert or update or delete on public.garantias
  for each row execute function privado.registrar_auditoria();
create trigger auditoria after insert or update or delete on public.anexos
  for each row execute function privado.registrar_auditoria();

-- =============================================================================
--  VISÃO CONSOLIDADA DAS GARANTIAS (respeita as mesmas regras de acesso)
-- =============================================================================
create view public.vw_garantias
with (security_invoker = true)
as
select
  g.id,
  g.empresa_id,
  e.nome  as empresa_nome,
  e.tipo  as empresa_tipo,
  g.cliente_id,
  c.codigo as cliente_codigo,
  c.nome   as cliente_nome,
  g.produto_id,
  p.codigo    as produto_codigo,
  p.descricao as produto_descricao,
  g.marca_id,
  m.nome as marca_nome,
  pm.referencia,
  g.origem,
  g.quantidade,
  g.valor_unitario,
  round(g.quantidade * g.valor_unitario, 2) as valor_total,
  g.status,
  g.resolucao,
  g.data_abertura,
  g.data_conclusao,
  g.nota_fiscal_venda,
  g.data_venda,
  g.fornecedor,
  g.nota_fiscal_compra,
  g.protocolo_fornecedor,
  g.defeito,
  g.observacoes,
  g.criado_por,
  coalesce(nullif(cp.nome, ''), cp.email) as criado_por_nome,
  g.atualizado_por,
  coalesce(nullif(ap.nome, ''), ap.email) as atualizado_por_nome,
  g.criado_em,
  g.atualizado_em,
  privado.normalizar(concat_ws(' ',
    lpad(g.id::text, 5, '0'), g.id::text,
    c.codigo, c.nome, p.codigo, p.descricao, m.nome, pm.referencia,
    g.fornecedor, g.nota_fiscal_venda, g.nota_fiscal_compra, g.protocolo_fornecedor
  )) as busca
from public.garantias g
join public.empresas e on e.id = g.empresa_id
join public.clientes c on c.id = g.cliente_id
join public.produtos p on p.id = g.produto_id
join public.marcas m on m.id = g.marca_id
left join public.produto_marcas pm on pm.produto_id = g.produto_id and pm.marca_id = g.marca_id
left join public.perfis cp on cp.id = g.criado_por
left join public.perfis ap on ap.id = g.atualizado_por;

-- =============================================================================
--  SEGURANÇA EM NÍVEL DE LINHA (RLS)
-- =============================================================================
alter table public.perfis           enable row level security;
alter table public.empresas         enable row level security;
alter table public.marcas           enable row level security;
alter table public.produtos         enable row level security;
alter table public.produto_marcas   enable row level security;
alter table public.clientes         enable row level security;
alter table public.garantias        enable row level security;
alter table public.garantia_eventos enable row level security;
alter table public.anexos           enable row level security;
alter table public.auditoria        enable row level security;

-- Perfis: cada um vê o próprio; usuários com acesso veem todos; só admin altera.
create policy perfis_ler on public.perfis for select to authenticated
  using (id = (select auth.uid()) or (select privado.tem_acesso()));
create policy perfis_admin_alterar on public.perfis for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

-- Empresas
create policy empresas_ler on public.empresas for select to authenticated
  using ((select privado.tem_acesso()));
create policy empresas_admin_inserir on public.empresas for insert to authenticated
  with check ((select privado.eh_admin()));
create policy empresas_admin_alterar on public.empresas for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

-- Cadastros (marcas, produtos, vínculos, clientes): ler = com acesso;
-- incluir/alterar = admin e operador; excluir = somente admin.
create policy marcas_ler on public.marcas for select to authenticated
  using ((select privado.tem_acesso()));
create policy marcas_inserir on public.marcas for insert to authenticated
  with check ((select privado.pode_editar()));
create policy marcas_alterar on public.marcas for update to authenticated
  using ((select privado.pode_editar())) with check ((select privado.pode_editar()));
create policy marcas_excluir on public.marcas for delete to authenticated
  using ((select privado.eh_admin()));

create policy produtos_ler on public.produtos for select to authenticated
  using ((select privado.tem_acesso()));
create policy produtos_inserir on public.produtos for insert to authenticated
  with check ((select privado.pode_editar()));
create policy produtos_alterar on public.produtos for update to authenticated
  using ((select privado.pode_editar())) with check ((select privado.pode_editar()));
create policy produtos_excluir on public.produtos for delete to authenticated
  using ((select privado.eh_admin()));

create policy produto_marcas_ler on public.produto_marcas for select to authenticated
  using ((select privado.tem_acesso()));
create policy produto_marcas_inserir on public.produto_marcas for insert to authenticated
  with check ((select privado.pode_editar()));
create policy produto_marcas_alterar on public.produto_marcas for update to authenticated
  using ((select privado.pode_editar())) with check ((select privado.pode_editar()));
create policy produto_marcas_excluir on public.produto_marcas for delete to authenticated
  using ((select privado.pode_editar()));

create policy clientes_ler on public.clientes for select to authenticated
  using ((select privado.tem_acesso()));
create policy clientes_inserir on public.clientes for insert to authenticated
  with check ((select privado.pode_editar()));
create policy clientes_alterar on public.clientes for update to authenticated
  using ((select privado.pode_editar())) with check ((select privado.pode_editar()));
create policy clientes_excluir on public.clientes for delete to authenticated
  using ((select privado.eh_admin()));

-- Garantias: NÃO existe política de exclusão (use o status "Cancelada").
create policy garantias_ler on public.garantias for select to authenticated
  using ((select privado.tem_acesso()));
create policy garantias_inserir on public.garantias for insert to authenticated
  with check ((select privado.pode_editar()));
create policy garantias_alterar on public.garantias for update to authenticated
  using ((select privado.pode_editar())) with check ((select privado.pode_editar()));

-- Histórico: leitura para quem tem acesso; pelo app só é possível incluir COMENTÁRIOS.
create policy eventos_ler on public.garantia_eventos for select to authenticated
  using ((select privado.tem_acesso()));
create policy eventos_comentar on public.garantia_eventos for insert to authenticated
  with check (tipo = 'COMENTARIO' and (select privado.pode_editar()));

-- Anexos: excluir somente o próprio anexo (ou admin).
create policy anexos_ler on public.anexos for select to authenticated
  using ((select privado.tem_acesso()));
create policy anexos_inserir on public.anexos for insert to authenticated
  with check ((select privado.pode_editar()));
create policy anexos_excluir on public.anexos for delete to authenticated
  using (
    (select privado.eh_admin())
    or ((select privado.pode_editar()) and enviado_por = (select auth.uid()))
  );

-- Auditoria: somente administradores leem; ninguém altera pelo app.
create policy auditoria_admin_ler on public.auditoria for select to authenticated
  using ((select privado.eh_admin()));

-- =============================================================================
--  PERMISSÕES (defesa em profundidade, além do RLS)
--  O papel "anon" (visitante sem login) não tem acesso a NADA.
-- =============================================================================
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.perfis to authenticated;
grant update (nome, papel, ativo, deve_trocar_senha) on public.perfis to authenticated;

grant select on public.empresas to authenticated;
grant insert (nome, tipo, ativo), update (nome, tipo, ativo) on public.empresas to authenticated;

grant select, delete on public.marcas to authenticated;
grant insert (nome, ativo), update (nome, ativo) on public.marcas to authenticated;

grant select, delete on public.produtos to authenticated;
grant insert (codigo, descricao, ativo), update (codigo, descricao, ativo) on public.produtos to authenticated;

grant select, delete on public.produto_marcas to authenticated;
grant insert (produto_id, marca_id, origem_padrao, referencia, ativo),
      update (origem_padrao, referencia, ativo) on public.produto_marcas to authenticated;

grant select, delete on public.clientes to authenticated;
grant insert (codigo, nome, documento, cidade, uf, telefone, ativo),
      update (codigo, nome, documento, cidade, uf, telefone, ativo) on public.clientes to authenticated;

grant select on public.garantias to authenticated;
grant insert (empresa_id, cliente_id, produto_id, marca_id, origem, quantidade, valor_unitario,
              status, resolucao, data_abertura, data_conclusao, nota_fiscal_venda, data_venda,
              fornecedor, nota_fiscal_compra, protocolo_fornecedor, defeito, observacoes)
  on public.garantias to authenticated;
grant update (empresa_id, cliente_id, produto_id, marca_id, origem, quantidade, valor_unitario,
              status, resolucao, data_abertura, nota_fiscal_venda, data_venda,
              fornecedor, nota_fiscal_compra, protocolo_fornecedor, defeito, observacoes)
  on public.garantias to authenticated;

grant select on public.garantia_eventos to authenticated;
grant insert (garantia_id, tipo, descricao) on public.garantia_eventos to authenticated;

grant select, delete on public.anexos to authenticated;
grant insert (garantia_id, caminho, nome_arquivo, tipo_mime, tamanho_bytes) on public.anexos to authenticated;

grant select on public.auditoria to authenticated;

grant select on public.vw_garantias to authenticated;

-- Objetos criados no futuro também não ficam acessíveis ao visitante sem login.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;

-- Funções internas: somente usuários logados (e nunca pela API, pois o esquema não é exposto).
revoke all on all functions in schema privado from public, anon, authenticated;
grant execute on function privado.normalizar(text) to authenticated, service_role;
grant execute on function privado.limpar(text) to authenticated, service_role;
grant execute on function privado.hoje() to authenticated, service_role;
grant execute on function privado.meu_papel() to authenticated;
grant execute on function privado.tem_acesso() to authenticated;
grant execute on function privado.pode_editar() to authenticated;
grant execute on function privado.eh_admin() to authenticated;

-- =============================================================================
--  FUNÇÕES CHAMADAS PELO APLICATIVO (RPC)
-- =============================================================================

-- Usado apenas para manter o projeto gratuito do Supabase "acordado". Não expõe dados.
create or replace function public.ping()
returns text
language sql
stable
set search_path = ''
as $$
  select 'ok'::text
$$;

-- Altera o status de uma garantia, com comentário opcional no histórico.
create or replace function public.alterar_status(
  p_garantia_id bigint,
  p_status text,
  p_comentario text default null,
  p_resolucao text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status_atual text;
  v_comentario text := nullif(btrim(coalesce(p_comentario, '')), '');
begin
  if not privado.pode_editar() then
    raise exception 'Você não tem permissão para alterar garantias.' using errcode = '42501';
  end if;

  select g.status into v_status_atual
    from public.garantias g
   where g.id = p_garantia_id
     for update;

  if not found then
    raise exception 'Garantia não encontrada.' using errcode = 'P0002';
  end if;

  if v_status_atual = p_status then
    if p_resolucao is not null then
      update public.garantias set resolucao = p_resolucao where id = p_garantia_id;
    end if;
    if v_comentario is not null then
      insert into public.garantia_eventos (garantia_id, tipo, descricao)
      values (p_garantia_id, 'COMENTARIO', v_comentario);
    end if;
    return;
  end if;

  perform set_config('app.comentario_status', coalesce(v_comentario, ''), true);
  update public.garantias
     set status = p_status,
         resolucao = coalesce(p_resolucao, resolucao)
   where id = p_garantia_id;
  perform set_config('app.comentario_status', '', true);
end;
$$;

-- Indicadores do painel inicial.
create or replace function public.resumo_garantias()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with g as (
    select
      gg.*,
      gg.status in ('CONCLUIDA', 'REPROVADA', 'CANCELADA') as finalizada
    from public.garantias gg
  )
  select jsonb_build_object(
    'total', (select count(*) from g),
    'em_andamento', (select count(*) from g where not finalizada),
    'atrasadas_30_dias', (select count(*) from g where not finalizada and data_abertura < privado.hoje() - 30),
    'valor_em_andamento', (select coalesce(sum(quantidade * valor_unitario), 0) from g where not finalizada),
    'por_status', coalesce((
      select jsonb_object_agg(status, n)
      from (select status, count(*) as n from g group by status) s
    ), '{}'::jsonb),
    'por_empresa', coalesce((
      select jsonb_agg(jsonb_build_object(
        'empresa_id', e.id, 'nome', e.nome, 'tipo', e.tipo,
        'total', (select count(*) from g where g.empresa_id = e.id),
        'em_andamento', (select count(*) from g where g.empresa_id = e.id and not g.finalizada)
      ) order by e.id)
      from public.empresas e
    ), '[]'::jsonb),
    'por_origem', jsonb_build_object(
      'NACIONAL', (select count(*) from g where origem = 'NACIONAL'),
      'IMPORTADO', (select count(*) from g where origem = 'IMPORTADO'),
      'NACIONAL_em_andamento', (select count(*) from g where origem = 'NACIONAL' and not finalizada),
      'IMPORTADO_em_andamento', (select count(*) from g where origem = 'IMPORTADO' and not finalizada)
    )
  )
$$;

-- Lista de usuários com último acesso e 2FA (somente administradores).
create or replace function public.listar_usuarios()
returns table (
  id uuid,
  email text,
  nome text,
  papel text,
  ativo boolean,
  deve_trocar_senha boolean,
  criado_em timestamptz,
  ultimo_acesso timestamptz,
  dois_fatores boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.eh_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;

  return query
    select
      p.id, p.email, p.nome, p.papel, p.ativo, p.deve_trocar_senha, p.criado_em,
      u.last_sign_in_at,
      exists (
        select 1 from auth.mfa_factors f
        where f.user_id = p.id and f.status = 'verified'
      )
    from public.perfis p
    left join auth.users u on u.id = p.id
    order by p.ativo desc, lower(p.nome), lower(p.email);
end;
$$;

-- O próprio usuário atualiza o nome de exibição.
create or replace function public.atualizar_meu_nome(p_nome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text := privado.limpar(p_nome);
begin
  if auth.uid() is null then
    raise exception 'Faça login novamente.' using errcode = '42501';
  end if;
  if v_nome is null or char_length(v_nome) > 120 then
    raise exception 'Informe um nome com até 120 caracteres.' using errcode = '22023';
  end if;
  update public.perfis set nome = v_nome where id = auth.uid();
end;
$$;

-- Marca que o usuário já trocou a senha provisória.
create or replace function public.confirmar_troca_senha()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Faça login novamente.' using errcode = '42501';
  end if;
  update public.perfis set deve_trocar_senha = false where id = auth.uid();
end;
$$;

-- Importação de produtos e marcas (somente administradores).
-- Formato: [{"codigo": "...", "descricao": "...", "marcas": [{"nome": "...", "origem": "NACIONAL|IMPORTADO", "referencia": "..."}]}]
create or replace function public.importar_produtos(p_itens jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_marca jsonb;
  v_linha integer := 0;
  v_codigo text;
  v_descricao text;
  v_produto_id bigint;
  v_marca_nome text;
  v_marca_id bigint;
  v_origem text;
  v_referencia text;
  v_produtos_novos integer := 0;
  v_produtos_atualizados integer := 0;
  v_marcas_novas integer := 0;
  v_vinculos_novos integer := 0;
begin
  if not privado.eh_admin() then
    raise exception 'Somente administradores podem importar listas.' using errcode = '42501';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'Formato de importação inválido.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_itens) > 2000 then
    raise exception 'Envie no máximo 2000 produtos por vez.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_linha := v_linha + 1;
    v_codigo := privado.limpar(v_item ->> 'codigo');
    v_descricao := privado.limpar(v_item ->> 'descricao');

    if v_descricao is null then
      raise exception 'Item %: a descrição do produto está vazia.', v_linha using errcode = '22023';
    end if;
    if char_length(v_descricao) > 300 then
      raise exception 'Item %: descrição com mais de 300 caracteres.', v_linha using errcode = '22023';
    end if;
    if v_codigo is not null and char_length(v_codigo) > 60 then
      raise exception 'Item %: código com mais de 60 caracteres.', v_linha using errcode = '22023';
    end if;

    if v_codigo is not null then
      select p.id into v_produto_id from public.produtos p
       where p.chave_codigo = privado.normalizar(v_codigo);
    else
      select p.id into v_produto_id from public.produtos p
       where p.chave_codigo is null and p.chave_descricao = privado.normalizar(v_descricao);
    end if;

    if v_produto_id is null then
      insert into public.produtos (codigo, descricao)
      values (v_codigo, v_descricao)
      returning id into v_produto_id;
      v_produtos_novos := v_produtos_novos + 1;
    else
      update public.produtos
         set descricao = v_descricao, ativo = true
       where id = v_produto_id
         and (descricao is distinct from v_descricao or not ativo);
      if found then
        v_produtos_atualizados := v_produtos_atualizados + 1;
      end if;
    end if;

    for v_marca in select value from jsonb_array_elements(coalesce(v_item -> 'marcas', '[]'::jsonb)) loop
      v_marca_nome := privado.limpar(v_marca ->> 'nome');
      continue when v_marca_nome is null;
      if char_length(v_marca_nome) > 120 then
        raise exception 'Item %: nome de marca com mais de 120 caracteres.', v_linha using errcode = '22023';
      end if;

      v_origem := upper(privado.limpar(v_marca ->> 'origem'));
      if v_origem is not null and v_origem not in ('NACIONAL', 'IMPORTADO') then
        raise exception 'Item %: origem "%" inválida (use NACIONAL ou IMPORTADO).', v_linha, v_origem
          using errcode = '22023';
      end if;
      v_referencia := left(privado.limpar(v_marca ->> 'referencia'), 80);

      select m.id into v_marca_id from public.marcas m
       where m.chave = privado.normalizar(v_marca_nome);
      if v_marca_id is null then
        insert into public.marcas (nome) values (v_marca_nome) returning id into v_marca_id;
        v_marcas_novas := v_marcas_novas + 1;
      end if;

      if exists (
        select 1 from public.produto_marcas pm
        where pm.produto_id = v_produto_id and pm.marca_id = v_marca_id
      ) then
        update public.produto_marcas pm
           set origem_padrao = coalesce(v_origem, pm.origem_padrao),
               referencia = coalesce(v_referencia, pm.referencia),
               ativo = true
         where pm.produto_id = v_produto_id and pm.marca_id = v_marca_id;
      else
        insert into public.produto_marcas (produto_id, marca_id, origem_padrao, referencia)
        values (v_produto_id, v_marca_id, v_origem, v_referencia);
        v_vinculos_novos := v_vinculos_novos + 1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'itens', v_linha,
    'produtos_novos', v_produtos_novos,
    'produtos_atualizados', v_produtos_atualizados,
    'marcas_novas', v_marcas_novas,
    'vinculos_novos', v_vinculos_novos
  );
end;
$$;

-- Importação de clientes (somente administradores).
-- Formato: [{"codigo": "...", "nome": "...", "documento": "...", "cidade": "...", "uf": "..", "telefone": "..."}]
create or replace function public.importar_clientes(p_itens jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_linha integer := 0;
  v_codigo text;
  v_nome text;
  v_uf text;
  v_id bigint;
  v_novos integer := 0;
  v_atualizados integer := 0;
begin
  if not privado.eh_admin() then
    raise exception 'Somente administradores podem importar listas.' using errcode = '42501';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'Formato de importação inválido.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_itens) > 2000 then
    raise exception 'Envie no máximo 2000 clientes por vez.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_linha := v_linha + 1;
    v_codigo := privado.limpar(v_item ->> 'codigo');
    v_nome := privado.limpar(v_item ->> 'nome');
    v_uf := upper(privado.limpar(v_item ->> 'uf'));

    if v_codigo is null then
      raise exception 'Item %: o código do cliente está vazio.', v_linha using errcode = '22023';
    end if;
    if v_nome is null then
      raise exception 'Item % (código %): o nome do cliente está vazio.', v_linha, v_codigo using errcode = '22023';
    end if;
    if char_length(v_codigo) > 60 or char_length(v_nome) > 200 then
      raise exception 'Item % (código %): código ou nome grande demais.', v_linha, v_codigo using errcode = '22023';
    end if;
    if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then
      v_uf := null; -- UF inválida é ignorada para não travar a importação
    end if;

    select c.id into v_id from public.clientes c where c.chave_codigo = privado.normalizar(v_codigo);

    if v_id is null then
      insert into public.clientes (codigo, nome, documento, cidade, uf, telefone)
      values (
        v_codigo, v_nome,
        left(privado.limpar(v_item ->> 'documento'), 30),
        left(privado.limpar(v_item ->> 'cidade'), 100),
        v_uf,
        left(privado.limpar(v_item ->> 'telefone'), 40)
      );
      v_novos := v_novos + 1;
    else
      update public.clientes c
         set nome = v_nome,
             documento = coalesce(left(privado.limpar(v_item ->> 'documento'), 30), c.documento),
             cidade = coalesce(left(privado.limpar(v_item ->> 'cidade'), 100), c.cidade),
             uf = coalesce(v_uf, c.uf),
             telefone = coalesce(left(privado.limpar(v_item ->> 'telefone'), 40), c.telefone),
             ativo = true
       where c.id = v_id
         and (
           c.nome is distinct from v_nome
           or not c.ativo
           or (privado.limpar(v_item ->> 'documento') is not null and c.documento is distinct from left(privado.limpar(v_item ->> 'documento'), 30))
           or (privado.limpar(v_item ->> 'cidade') is not null and c.cidade is distinct from left(privado.limpar(v_item ->> 'cidade'), 100))
           or (v_uf is not null and c.uf is distinct from v_uf)
           or (privado.limpar(v_item ->> 'telefone') is not null and c.telefone is distinct from left(privado.limpar(v_item ->> 'telefone'), 40))
         );
      if found then
        v_atualizados := v_atualizados + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('itens', v_linha, 'novos', v_novos, 'atualizados', v_atualizados);
end;
$$;

-- Retorna o id da marca com este nome (sem diferenciar maiúsculas/acentos), criando se não existir.
create or replace function public.obter_ou_criar_marca(p_nome text)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_nome text := privado.limpar(p_nome);
  v_id bigint;
begin
  if not privado.pode_editar() then
    raise exception 'Você não tem permissão para cadastrar marcas.' using errcode = '42501';
  end if;
  if v_nome is null or char_length(v_nome) > 120 then
    raise exception 'Informe o nome da marca (até 120 caracteres).' using errcode = '22023';
  end if;

  select m.id into v_id from public.marcas m where m.chave = privado.normalizar(v_nome);
  if v_id is null then
    insert into public.marcas (nome) values (v_nome) returning id into v_id;
  else
    update public.marcas set ativo = true where id = v_id and not ativo;
  end if;
  return v_id;
end;
$$;

-- Salva um produto e TODAS as suas marcas de uma vez (tudo ou nada).
-- p_marcas: [{"nome": "...", "origem": "NACIONAL|IMPORTADO|null", "referencia": "...", "ativo": true}]
-- Marcas retiradas da lista são apagadas do produto; se já tiverem garantias, ficam apenas inativas.
create or replace function public.salvar_produto(
  p_codigo text,
  p_descricao text,
  p_ativo boolean,
  p_marcas jsonb,
  p_id bigint default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint := p_id;
  v_marca jsonb;
  v_marca_id bigint;
  v_origem text;
  v_ids bigint[] := '{}';
begin
  if not privado.pode_editar() then
    raise exception 'Você não tem permissão para cadastrar produtos.' using errcode = '42501';
  end if;
  if p_marcas is null or jsonb_typeof(p_marcas) <> 'array' then
    raise exception 'Lista de marcas inválida.' using errcode = '22023';
  end if;
  if privado.limpar(p_descricao) is null then
    raise exception 'Informe a descrição do produto.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.produtos (codigo, descricao, ativo)
    values (p_codigo, p_descricao, coalesce(p_ativo, true))
    returning id into v_id;
  else
    update public.produtos
       set codigo = p_codigo, descricao = p_descricao, ativo = coalesce(p_ativo, ativo)
     where id = v_id;
    if not found then
      raise exception 'Produto não encontrado.' using errcode = 'P0002';
    end if;
  end if;

  for v_marca in select value from jsonb_array_elements(p_marcas) loop
    v_marca_id := public.obter_ou_criar_marca(v_marca ->> 'nome');
    continue when v_marca_id = any (v_ids);
    v_ids := v_ids || v_marca_id;

    v_origem := upper(privado.limpar(v_marca ->> 'origem'));
    if v_origem is not null and v_origem not in ('NACIONAL', 'IMPORTADO') then
      raise exception 'Origem "%" inválida (use NACIONAL ou IMPORTADO).', v_origem using errcode = '22023';
    end if;

    insert into public.produto_marcas (produto_id, marca_id, origem_padrao, referencia, ativo)
    values (
      v_id, v_marca_id, v_origem,
      left(privado.limpar(v_marca ->> 'referencia'), 80),
      coalesce((v_marca ->> 'ativo')::boolean, true)
    )
    on conflict (produto_id, marca_id) do update
      set origem_padrao = excluded.origem_padrao,
          referencia = excluded.referencia,
          ativo = excluded.ativo;
  end loop;

  delete from public.produto_marcas pm
   where pm.produto_id = v_id
     and not (pm.marca_id = any (v_ids))
     and not exists (
       select 1 from public.garantias g
       where g.produto_id = pm.produto_id and g.marca_id = pm.marca_id
     );

  update public.produto_marcas pm
     set ativo = false
   where pm.produto_id = v_id
     and not (pm.marca_id = any (v_ids))
     and pm.ativo;

  return v_id;
end;
$$;

-- Administrador define uma senha provisória (o usuário troca no próximo login).
create or replace function public.admin_definir_senha(p_usuario uuid, p_senha text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privado.eh_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;
  if p_senha is null
     or char_length(p_senha) < 10 or char_length(p_senha) > 72
     or p_senha !~ '[A-Z]' or p_senha !~ '[a-z]' or p_senha !~ '[0-9]' then
    raise exception 'A senha provisória precisa ter de 10 a 72 caracteres, com letra maiúscula, minúscula e número.'
      using errcode = '22023';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = p_usuario;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;

  delete from auth.sessions where user_id = p_usuario;
  update public.perfis set deve_trocar_senha = true where id = p_usuario;

  insert into public.auditoria (tabela, operacao, registro_id, dados_novos, usuario_id, usuario_email)
  values ('auth.users', 'UPDATE', p_usuario::text,
          jsonb_build_object('acao', 'Senha redefinida pelo administrador'),
          auth.uid(), auth.jwt() ->> 'email');
end;
$$;

-- Administrador remove a verificação em duas etapas (ex.: usuário perdeu o celular).
create or replace function public.admin_remover_2fa(p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privado.eh_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.perfis where id = p_usuario) then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;

  delete from auth.mfa_factors where user_id = p_usuario;
  delete from auth.sessions where user_id = p_usuario;

  insert into public.auditoria (tabela, operacao, registro_id, dados_novos, usuario_id, usuario_email)
  values ('auth.mfa_factors', 'DELETE', p_usuario::text,
          jsonb_build_object('acao', 'Verificação em duas etapas removida pelo administrador'),
          auth.uid(), auth.jwt() ->> 'email');
end;
$$;

-- Permissões das funções públicas: somente usuários logados (exceto ping).
revoke all on function public.ping() from public;
revoke all on function public.alterar_status(bigint, text, text, text) from public, anon;
revoke all on function public.resumo_garantias() from public, anon;
revoke all on function public.listar_usuarios() from public, anon;
revoke all on function public.atualizar_meu_nome(text) from public, anon;
revoke all on function public.confirmar_troca_senha() from public, anon;
revoke all on function public.importar_produtos(jsonb) from public, anon;
revoke all on function public.importar_clientes(jsonb) from public, anon;
revoke all on function public.obter_ou_criar_marca(text) from public, anon;
revoke all on function public.salvar_produto(text, text, boolean, jsonb, bigint) from public, anon;
revoke all on function public.admin_definir_senha(uuid, text) from public, anon;
revoke all on function public.admin_remover_2fa(uuid) from public, anon;

grant execute on function public.ping() to anon, authenticated;
grant execute on function public.alterar_status(bigint, text, text, text) to authenticated;
grant execute on function public.resumo_garantias() to authenticated;
grant execute on function public.listar_usuarios() to authenticated;
grant execute on function public.atualizar_meu_nome(text) to authenticated;
grant execute on function public.confirmar_troca_senha() to authenticated;
grant execute on function public.importar_produtos(jsonb) to authenticated;
grant execute on function public.importar_clientes(jsonb) to authenticated;
grant execute on function public.obter_ou_criar_marca(text) to authenticated;
grant execute on function public.salvar_produto(text, text, boolean, jsonb, bigint) to authenticated;
grant execute on function public.admin_definir_senha(uuid, text) to authenticated;
grant execute on function public.admin_remover_2fa(uuid) to authenticated;

-- =============================================================================
--  ARMAZENAMENTO DE ARQUIVOS (bucket privado "anexos")
--  Máx. 10 MB por arquivo; somente imagens e PDF.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anexos', 'anexos', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "anexos: ler" on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and (select privado.tem_acesso()));

create policy "anexos: enviar" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'anexos'
    and (select privado.pode_editar())
    and exists (
      select 1 from public.garantias g
      where g.id::text = (storage.foldername(name))[1]
    )
  );

create policy "anexos: excluir" on storage.objects for delete to authenticated
  using (
    bucket_id = 'anexos'
    and (
      (select privado.eh_admin())
      or ((select privado.pode_editar()) and owner_id = (select auth.uid())::text)
    )
  );

-- =============================================================================
--  TEMPO REAL: todos os usuários veem as mudanças na hora
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.garantias, public.garantia_eventos, public.anexos;
  end if;
end;
$$;
