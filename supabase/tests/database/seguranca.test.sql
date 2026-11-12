-- Testes de segurança do banco (pgTAP). Rodar com: npm run db:test
-- Tudo roda dentro de uma transação e é desfeito no final (rollback).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(85);

-- ---------------------------------------------------------------------------
-- Preparação: usuários de teste (o gatilho cria o perfil automaticamente)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@pgtap.local', 'authenticated', 'authenticated', '{"nome":"Admin Teste"}'),
  ('00000000-0000-0000-0000-00000000000b', 'operador@pgtap.local', 'authenticated', 'authenticated', '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'consulta@pgtap.local', 'authenticated', 'authenticated', '{}'),
  ('00000000-0000-0000-0000-00000000000d', 'inativo@pgtap.local', 'authenticated', 'authenticated', '{}');

select is(
  (select count(*)::int from perfis where email like '%@pgtap.local' and not ativo),
  4, 'Novos usuários são criados com perfil INATIVO'
);
select is(
  (select nome from perfis where id = '00000000-0000-0000-0000-00000000000a'),
  'Admin Teste', 'Nome do perfil vem dos metadados do usuário'
);
select is(
  (select nome from perfis where id = '00000000-0000-0000-0000-00000000000b'),
  'operador', 'Sem nome informado, usa a parte do e-mail antes do @'
);

update perfis set papel = 'admin', ativo = true where id = '00000000-0000-0000-0000-00000000000a';
update perfis set papel = 'operador', ativo = true where id = '00000000-0000-0000-0000-00000000000b';
update perfis set papel = 'consulta', ativo = true where id = '00000000-0000-0000-0000-00000000000c';
update perfis set papel = 'operador', ativo = false where id = '00000000-0000-0000-0000-00000000000d';
-- Garante que o admin de teste seja o ÚNICO admin ativo durante o teste.
update perfis set ativo = false where papel = 'admin' and id <> '00000000-0000-0000-0000-00000000000a';

-- Dados base (como postgres)
insert into marcas (nome) values ('Marca Teste');
insert into produtos (codigo, descricao) values ('T-1', 'Peça de teste');
insert into produto_marcas (produto_id, marca_id, origem_padrao)
  select p.id, m.id, 'IMPORTADO' from produtos p, marcas m where p.codigo = 'T-1' and m.nome = 'Marca Teste';
insert into clientes (codigo, nome) values ('C-1', 'Cliente Teste');

create temporary table ids on commit drop as
  select
    (select id from produtos where codigo = 'T-1') as produto_id,
    (select id from marcas where nome = 'Marca Teste') as marca_id,
    (select id from clientes where codigo = 'C-1') as cliente_id,
    (select id from empresas where tipo = 'MATRIZ') as empresa_id;
grant select on ids to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Visitante sem login (anon): nenhum acesso
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok('select * from public.perfis', '42501', null, 'anon: não lê perfis');
select throws_ok('select * from public.garantias', '42501', null, 'anon: não lê garantias');
select throws_ok('select * from public.clientes', '42501', null, 'anon: não lê clientes');
select throws_ok('select * from public.produtos', '42501', null, 'anon: não lê produtos');
select throws_ok('select * from public.vw_garantias', '42501', null, 'anon: não lê a visão de garantias');
select throws_ok('select * from public.auditoria', '42501', null, 'anon: não lê auditoria');
select throws_ok('select public.resumo_garantias()', '42501', null, 'anon: não executa resumo');
select throws_ok('select public.importar_clientes(''[]''::jsonb)', '42501', null, 'anon: não importa');
select throws_ok('select privado.tem_acesso()', '42501', null, 'anon: não acessa funções internas');
select is(public.ping(), 'ok', 'anon: ping (manter o projeto ativo) funciona');

reset role;

-- ---------------------------------------------------------------------------
-- Usuário INATIVO: vê só o próprio perfil, nenhum dado
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated","aal":"aal1"}', true);

select is((select count(*)::int from perfis), 1, 'inativo: enxerga apenas o próprio perfil');
select is((select count(*)::int from empresas), 0, 'inativo: não vê empresas');
select is((select count(*)::int from clientes), 0, 'inativo: não vê clientes');
select is((select count(*)::int from vw_garantias), 0, 'inativo: não vê garantias');
select throws_ok(
  $$insert into garantias (empresa_id, cliente_id, defeito)
    select empresa_id, cliente_id, 'Teste inativo' from ids$$,
  '42501', null, 'inativo: não registra garantia'
);
select throws_ok(
  $$select salvar_garantia('{"empresa_id":1,"cliente_id":1,"defeito":"xxx"}'::jsonb, '[]'::jsonb)$$,
  '42501', null, 'inativo: não usa salvar_garantia'
);
reset role;

-- ---------------------------------------------------------------------------
-- OPERADOR: registra e acompanha, mas não apaga nem administra
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","aal":"aal1","email":"operador@pgtap.local"}', true);

select lives_ok(
  $$select salvar_garantia(
      jsonb_build_object('empresa_id', empresa_id, 'cliente_id', cliente_id, 'defeito', 'Peça com trinca'),
      jsonb_build_array(
        jsonb_build_object('produto_id', produto_id, 'marca_id', marca_id, 'origem', 'IMPORTADO', 'quantidade', 2, 'valor_unitario', 10),
        jsonb_build_object('produto_id', produto_id, 'marca_id', marca_id, 'origem', 'NACIONAL', 'quantidade', 1, 'valor_unitario', 5.5)
      )) from ids$$,
  'operador: registra garantia com 2 produtos'
);
select is(
  (select count(*)::int from garantia_itens where garantia_id = (select max(id) from garantias)),
  2, 'garantia guarda os 2 itens'
);
select is(
  (select qtd_itens || '/' || origem || '/' || valor_total from vw_garantias where id = (select max(id) from garantias)),
  '2/MISTA/25.50', 'visão soma os itens e marca origem MISTA'
);
select throws_ok(
  $$select salvar_garantia(
      jsonb_build_object('empresa_id', empresa_id, 'cliente_id', cliente_id, 'defeito', 'Falha atômica'),
      jsonb_build_array(
        jsonb_build_object('produto_id', produto_id, 'marca_id', marca_id, 'origem', 'NACIONAL', 'quantidade', 1),
        jsonb_build_object('produto_id', produto_id, 'marca_id', 999999, 'origem', 'NACIONAL', 'quantidade', 1)
      )) from ids$$,
  '23503', null, 'operador: item com marca que não pertence ao produto é recusado'
);
select is(
  (select count(*)::int from garantias where defeito = 'Falha atômica'), 0,
  'operador: se um item falha, a garantia NÃO fica salva pela metade'
);
select throws_ok(
  $$select salvar_garantia(jsonb_build_object('empresa_id', empresa_id, 'cliente_id', cliente_id, 'defeito', 'Sem itens'), '[]'::jsonb) from ids$$,
  '22023', null, 'operador: garantia sem produtos é recusada'
);
select lives_ok(
  $$select salvar_garantia(
      jsonb_build_object('empresa_id', empresa_id, 'cliente_id', cliente_id, 'defeito', 'Peça com trinca (editada)'),
      jsonb_build_array(jsonb_build_object('produto_id', produto_id, 'marca_id', marca_id, 'origem', 'IMPORTADO', 'quantidade', 4)),
      (select max(id) from garantias)) from ids$$,
  'operador: edita a garantia trocando os produtos'
);
select is(
  (select count(*)::int from garantia_eventos where tipo = 'EDICAO' and descricao like '%produtos%' and garantia_id = (select max(id) from garantias)),
  1, 'edição dos produtos aparece no histórico'
);
select throws_ok(
  $$select salvar_garantia(
      jsonb_build_object('empresa_id', empresa_id, 'cliente_id', cliente_id, 'defeito', 'Conflito'),
      jsonb_build_array(jsonb_build_object('produto_id', produto_id, 'marca_id', marca_id, 'origem', 'NACIONAL', 'quantidade', 1)),
      (select max(id) from garantias), now() - interval '1 day') from ids$$,
  'P0001', null, 'operador: edição baseada em dados desatualizados é recusada'
);
select is(
  (select criado_por from garantias order by id desc limit 1),
  '00000000-0000-0000-0000-00000000000b'::uuid,
  'operador: "criado por" é preenchido automaticamente com o usuário logado'
);
select is(
  (select count(*)::int from garantia_eventos where tipo = 'CRIACAO' and garantia_id = (select max(id) from garantias)),
  1, 'operador: evento de criação registrado no histórico'
);
select throws_ok(
  $$update garantias set criado_por = '00000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'operador: não consegue falsificar "criado por"'
);
select lives_ok(
  $$select alterar_status((select max(id) from garantias), 'EM_ANALISE', 'Recebida no balcão')$$,
  'operador: altera status com comentário'
);
select is(
  (select descricao from garantia_eventos where tipo = 'STATUS' order by id desc limit 1),
  'Recebida no balcão', 'operador: comentário da mudança de status vai para o histórico'
);
select lives_ok(
  $$select alterar_status((select max(id) from garantias), 'CONCLUIDA', null, 'TROCA')$$,
  'operador: conclui garantia'
);
select isnt(
  (select data_conclusao from garantias order by id desc limit 1), null,
  'operador: data de conclusão preenchida automaticamente'
);
select lives_ok(
  $$select alterar_status((select max(id) from garantias), 'EM_ANALISE')$$,
  'operador: reabre garantia'
);
select is(
  (select data_conclusao from garantias order by id desc limit 1), null,
  'operador: ao reabrir, a data de conclusão é limpa'
);
select throws_ok(
  $$delete from garantias$$, '42501', null, 'operador: NÃO apaga garantias'
);
select throws_ok(
  $$insert into garantia_eventos (garantia_id, tipo, descricao) select max(id), 'STATUS', 'falso' from garantias$$,
  '42501', null, 'operador: não forja eventos de status no histórico'
);
select lives_ok(
  $$insert into garantia_eventos (garantia_id, tipo, descricao) select max(id), 'COMENTARIO', 'Cliente ligou' from garantias$$,
  'operador: adiciona comentário'
);
select throws_ok(
  $$update garantia_eventos set descricao = 'alterado'$$, '42501', null, 'operador: não altera histórico'
);
select throws_ok(
  $$delete from garantia_eventos$$, '42501', null, 'operador: não apaga histórico'
);
select is((select count(*)::int from auditoria), 0, 'operador: não lê auditoria');
select throws_ok(
  $$insert into auditoria (tabela, operacao) values ('x', 'INSERT')$$, '42501', null, 'operador: não escreve na auditoria'
);
select is_empty(
  $$update perfis set papel = 'admin' where id = '00000000-0000-0000-0000-00000000000b' returning 1$$,
  'operador: não se promove a administrador'
);
select throws_ok(
  $$select importar_produtos('[]'::jsonb)$$, '42501', null, 'operador: não importa listas'
);
select throws_ok(
  $$select * from listar_usuarios()$$, '42501', null, 'operador: não lista usuários'
);
select is_empty(
  $$delete from clientes returning 1$$, 'operador: não apaga clientes (nenhuma linha é removida)'
);
select lives_ok(
  $$select salvar_produto('T-2', 'Bomba hidráulica', true, '[{"nome":"Marca Teste","origem":"NACIONAL"},{"nome":"marca teste"},{"nome":"Nova Marca","origem":"IMPORTADO"}]'::jsonb)$$,
  'operador: cadastra produto com várias marcas de uma vez'
);
select is(
  (select count(*)::int from produto_marcas pm join produtos p on p.id = pm.produto_id where p.codigo = 'T-2'),
  2, 'operador: marcas repetidas (maiúsculas/minúsculas) não são duplicadas'
);
select throws_ok(
  $$select salvar_produto('T-3', 'X', true, '[{"nome":"Y","origem":"CHINA"}]'::jsonb)$$,
  '22023', null, 'operador: origem inválida é recusada (e nada é salvo)'
);
select is((select count(*)::int from produtos where codigo = 'T-3'), 0, 'operador: produto com erro não fica salvo pela metade');
select throws_ok(
  $$select admin_definir_senha('00000000-0000-0000-0000-00000000000c', 'SenhaForte123')$$,
  '42501', null, 'operador: não redefine senha de ninguém'
);
select throws_ok(
  $$select admin_remover_2fa('00000000-0000-0000-0000-00000000000c')$$,
  '42501', null, 'operador: não remove 2 etapas de ninguém'
);
reset role;

-- ---------------------------------------------------------------------------
-- CONSULTA: somente leitura
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal1"}', true);

select is((select count(*)::int from vw_garantias where cliente_id = (select cliente_id from ids)), 1, 'consulta: vê as garantias');
select throws_ok(
  $$insert into garantias (empresa_id, cliente_id, defeito)
    select empresa_id, cliente_id, 'Teste consulta' from ids$$,
  '42501', null, 'consulta: não registra garantia'
);
select is_empty(
  $$update garantias set defeito = 'alterado pela consulta' returning 1$$,
  'consulta: não altera garantia'
);
select throws_ok(
  $$select alterar_status((select max(id) from garantias), 'CANCELADA')$$, '42501', null, 'consulta: não altera status'
);
select throws_ok(
  $$select salvar_garantia('{"empresa_id":1,"cliente_id":1,"defeito":"xxx"}'::jsonb, '[{"produto_id":1,"marca_id":1,"origem":"NACIONAL","quantidade":1}]'::jsonb)$$,
  '42501', null, 'consulta: não usa salvar_garantia'
);
select throws_ok(
  $$insert into garantia_itens (garantia_id, produto_id, marca_id, origem, quantidade) values (1, 1, 1, 'NACIONAL', 1)$$,
  '42501', null, 'consulta: não insere itens diretamente'
);
select throws_ok(
  $$insert into clientes (codigo, nome) values ('X', 'Y')$$, '42501', null, 'consulta: não cadastra cliente'
);
reset role;

-- ---------------------------------------------------------------------------
-- ADMIN
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal1"}', true);

select cmp_ok((select count(*)::int from auditoria), '>', 0, 'admin: lê auditoria');
select cmp_ok((select count(*)::int from listar_usuarios()), '>=', 4, 'admin: lista usuários');
select throws_ok(
  $$update perfis set ativo = false where id = '00000000-0000-0000-0000-00000000000a'$$,
  'P0001', null, 'admin: não desativa o último administrador'
);
select throws_ok(
  $$delete from garantias$$, '42501', null, 'admin: também não apaga garantias (use "Cancelada")'
);
select throws_ok(
  $$delete from auditoria$$, '42501', null, 'admin: não apaga a auditoria'
);
select is(
  (select (importar_clientes('[{"codigo":"C-1","nome":"Cliente Renomeado"},{"codigo":"C-2","nome":"Novo"}]'::jsonb)) ->> 'novos'),
  '1', 'admin: importa clientes (atualiza existentes e cria novos)'
);
select throws_ok(
  $$update perfis set email = 'outro@x.com' where id = '00000000-0000-0000-0000-00000000000c'$$,
  '42501', null, 'admin: e-mail do perfil não é alterável pelo app'
);
select throws_ok(
  $$select admin_definir_senha('00000000-0000-0000-0000-00000000000c', 'fraca')$$,
  '22023', null, 'admin: senha provisória fraca é recusada'
);
reset role;

-- Bloquear um usuário encerra as sessões abertas dele na hora.
insert into auth.sessions (id, user_id, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000c', now(), now());
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal1"}', true);
update perfis set ativo = false where id = '00000000-0000-0000-0000-00000000000c';
reset role;
select is(
  (select count(*)::int from auth.sessions where user_id = '00000000-0000-0000-0000-00000000000c'),
  0, 'bloquear usuário encerra as sessões dele'
);

-- ---------------------------------------------------------------------------
-- COMPRAS: somente administradores
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal1"}', true);
select lives_ok(
  $$insert into compras_notas (empresa_id, numero, fornecedor, data_entrada, valor_total, valor_referencia)
    values (1, 'NF 100', 'Fornecedor  A', '2026-10-05', 900, 1000)$$,
  'compras: admin lança nota de entrada'
);
select throws_ok(
  $$insert into compras_notas (empresa_id, numero, fornecedor, data_entrada, valor_total) values (1, 'nf 100', 'FORNECEDOR A', '2026-10-06', 5)$$,
  '23505', null, 'compras: nota repetida (mesmo fornecedor e número) é recusada'
);
select is(
  (select (importar_compras_notas(1::smallint, '[{"numero":"NF 100","fornecedor":"Fornecedor A","data_entrada":"2026-10-05","valor_total":850,"valor_referencia":1000},{"numero":"NF 101","fornecedor":"Fornecedor B","data_entrada":"2026-11-02","valor_total":500}]'::jsonb)) ->> 'novas'),
  '1', 'compras: importação cria as novas e atualiza as existentes'
);
select is(
  (select saving::text from vw_compras_mensal where mes = '2026-10-01' and empresa_id = 1),
  '150.00', 'compras: saving = referência - valor pago (já com o valor atualizado)'
);
select is(
  (select notas_com_referencia from vw_compras_mensal where mes = '2026-11-01' and empresa_id = 1),
  0, 'compras: nota sem referência não entra no saving'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from compras_notas), 0, 'compras: operador não vê notas');
select throws_ok(
  $$insert into compras_notas (empresa_id, numero, fornecedor, data_entrada, valor_total) values (1, 'X', 'Y', '2026-10-01', 1)$$,
  '42501', null, 'compras: operador não lança notas'
);
select throws_ok(
  $$select importar_compras_notas(1::smallint, '[]'::jsonb)$$, '42501', null, 'compras: operador não importa notas'
);
reset role;
set local role anon;
select throws_ok('select * from public.compras_notas', '42501', null, 'compras: visitante sem login não lê nada');
reset role;

-- ---------------------------------------------------------------------------
-- Integrações no servidor (chave secreta / service_role) conseguem cadastrar
-- ---------------------------------------------------------------------------
set local role service_role;
select lives_ok(
  $$insert into clientes (codigo, nome) values ('SRV-1', '  Cliente   via integração ')$$,
  'service_role: integração cadastra cliente (gatilhos funcionam)'
);
select is((select nome from clientes where codigo = 'SRV-1'), 'Cliente via integração', 'service_role: texto limpo pelo gatilho');
reset role;

-- ---------------------------------------------------------------------------
-- Verificação em duas etapas (2FA): quem ativou precisa do código (aal2)
-- ---------------------------------------------------------------------------
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000b', 'celular', 'totp', 'verified', now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from vw_garantias), 0, '2FA: sessão sem código (aal1) não vê dados');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","aal":"aal2"}', true);
select cmp_ok((select count(*)::int from vw_garantias), '>=', 1, '2FA: sessão com código (aal2) vê dados');
reset role;

-- ---------------------------------------------------------------------------
-- Excluir um usuário no painel não apaga as garantias que ele registrou
-- ---------------------------------------------------------------------------
select lives_ok(
  $$delete from auth.users where id = '00000000-0000-0000-0000-00000000000b'$$,
  'excluir usuário que registrou garantias é permitido'
);
select is(
  (select count(*)::int from garantias where criado_por is null and cliente_id = (select cliente_id from ids)), 1,
  'a garantia continua existindo (autor fica em branco)'
);

select * from finish();
rollback;
