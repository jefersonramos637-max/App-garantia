# App de Garantias — Lojão dos Tratores / LL Tratores

Aplicativo web para **registrar e acompanhar garantias** do setor de compras, com acesso restrito por login e senha.
Funciona no computador e no celular, fica no ar 24 horas e todos os dados são gravados automaticamente em um banco
de dados na nuvem (Supabase / PostgreSQL). O que uma pessoa registra aparece **na hora** para todas as outras.

---

## Sumário

1. [O que o aplicativo faz](#1-o-que-o-aplicativo-faz)
2. [Segurança](#2-segurança)
3. [Como colocar no ar (passo a passo)](#3-como-colocar-no-ar-passo-a-passo)
4. [Dar acesso a outras pessoas](#4-dar-acesso-a-outras-pessoas)
5. [Importar as listas de produtos e de clientes](#5-importar-as-listas-de-produtos-e-de-clientes)
6. [Backup automático e "manter ativo"](#6-backup-automático-e-manter-ativo)
7. [Custos e limites](#7-custos-e-limites)
8. [Problemas comuns](#8-problemas-comuns)
9. [Para técnicos: desenvolvimento e testes](#9-para-técnicos-desenvolvimento-e-testes)

---

## 1. O que o aplicativo faz

**Registro de garantia** com:

| Campo | Observação |
|---|---|
| Empresa | **Lojão dos Tratores** (matriz) ou **LL Tratores** (filial) — obrigatório escolher |
| Cliente | Busca pelo **código** ou nome (lista importada; dá para cadastrar na hora) |
| Peça / produto | Busca pelo código ou descrição |
| Marca | Só aparecem as marcas daquele produto (o produto “X” vem com as marcas “Y, Z, W”) |
| **Nacional ou Importado** | Obrigatório. Preenchido automaticamente quando a marca tem origem cadastrada (pode alterar) |
| Quantidade e valor | Valor unitário opcional; o total é calculado |
| Defeito | Descrição da reclamação |
| NF de venda, data da venda, fornecedor, NF de compra, protocolo do fornecedor, observações | Opcionais |

**Acompanhamento do processo** — cada garantia tem um status:
`Aberta → Em análise → Enviada ao fornecedor → Aprovada / Reprovada → Concluída` (ou `Cancelada`), com:

- **Histórico completo** (quem fez o quê e quando): registro, mudanças de status, edições, comentários e anexos;
- **Comentários** de andamento (ex.: “fornecedor confirmou recebimento”);
- **Fotos e PDFs** anexados (fotos do celular são reduzidas automaticamente);
- **Resolução** (troca, crédito, reparo, reembolso, sem cobertura);
- Data de conclusão automática; alerta para garantias **abertas há mais de 30 dias**;
- **Impressão** da garantia.

**Outras telas**

- **Painel** com totais por status, por empresa (Lojão × LL) e por origem (Nacional × Importado), valor em andamento e
  últimas movimentações — atualiza sozinho.
- **Lista de garantias** com busca (nº, cliente, código, peça, marca, NF, fornecedor), filtros (situação, empresa,
  origem, período) e **exportação para Excel**.
- **Cadastros** de clientes, produtos (com várias marcas) e marcas.
- **Importação** das listas em Excel (.xlsx) ou CSV, com prévia e conferência antes de gravar.
- **Usuários** (administrador): liberar/bloquear acesso, definir papel, redefinir senha, remover verificação em 2 etapas.
- **Auditoria** (administrador): registro permanente de todas as inclusões, alterações e exclusões.
- **Minha conta**: trocar senha, ativar verificação em duas etapas, sair de todos os aparelhos.

> **“Replicar as informações para os terceiros”:** o aplicativo usa um banco de dados central — tudo que você registra
> fica disponível **imediatamente** para todas as pessoas que você liberar, em qualquer aparelho (as telas se atualizam
> sozinhas). Se você quis dizer enviar os dados para **outro sistema** (por exemplo, o ERP da empresa), me diga qual
> é o sistema que eu preparo a integração. Enquanto isso, a exportação para Excel funciona com qualquer sistema.

## 2. Segurança

- **Só entra quem você cadastrar.** O cadastro público fica desligado; usuários novos entram **bloqueados** até o
  administrador liberar.
- **Senha forte obrigatória** (mínimo 10 caracteres, com maiúscula, minúscula e número) e **troca obrigatória da senha
  provisória** no primeiro acesso.
- **Verificação em duas etapas (2FA)** opcional com aplicativo autenticador (Google Authenticator, Microsoft
  Authenticator…). Recomendado para administradores.
- **Saída automática** após 30 minutos sem uso; opção “Sair de todos os dispositivos”.
- **Três papéis:** *Administrador* (tudo), *Operador* (registra e acompanha) e *Consulta* (só visualiza).
- **Regras de acesso dentro do próprio banco de dados (RLS):** mesmo que alguém tente acessar o banco diretamente pela
  internet, sem login válido e liberado **não recebe nenhum dado**. Testado automaticamente (63 testes de segurança).
- **Garantias e histórico não podem ser apagados** pelo aplicativo (use o status “Cancelada”); a **auditoria é
  imutável** — nem o administrador consegue apagar.
- Bloquear um usuário **encerra as sessões dele na hora**. Não é possível remover o último administrador.
- Conexão sempre criptografada (HTTPS), cabeçalhos de segurança rígidos no site (CSP, HSTS, proteção contra
  “clickjacking”) e site **fora do Google** (não indexado).
- O aplicativo **se recusa a funcionar** se for configurado por engano com a chave secreta do Supabase.
- Arquivos anexados ficam em armazenamento **privado** (links temporários de 1 hora).

## 3. Como colocar no ar (passo a passo)

Você vai usar dois serviços com plano gratuito: **Supabase** (banco de dados + login) e **Cloudflare Pages**
(hospedagem do site). Tempo estimado: 30 a 40 minutos.

### Passo 1 — Criar o banco de dados no Supabase

1. Acesse **https://supabase.com**, crie uma conta e clique em **New project**.
2. Nome: `garantias`. **Database Password**: crie uma senha forte (só letras e números facilita depois) e **guarde-a**.
   Região: **South America (São Paulo)**. Clique em **Create new project** e aguarde 1–2 minutos.
3. No menu lateral, abra **SQL Editor** → **New query**.
4. Abra o arquivo [`supabase/migrations/20261111000000_esquema_inicial.sql`](supabase/migrations/20261111000000_esquema_inicial.sql)
   deste repositório, copie **todo** o conteúdo, cole no editor e clique em **Run**.
   Deve aparecer *“Success. No rows returned”*. **Rode apenas uma vez.**

### Passo 2 — Configurar o login (muito importante para a segurança)

Em **Authentication** (menu lateral):

1. **Sign In / Providers** (ou *Settings*):
   - **Allow new users to sign up** → **DESLIGADO**. (Assim ninguém consegue criar conta sozinho.)
   - Mantenha o provedor **Email** **LIGADO** (é ele que permite entrar com e-mail e senha).
   - No provedor **Email**: **Minimum password length** = `10` e **Password requirements** =
     *“Lowercase, uppercase letters and digits”*.
2. **Multi-Factor** → confirme que **TOTP (App Authenticator)** está habilitado (vem habilitado por padrão).

### Passo 3 — Criar o seu usuário administrador

1. **Authentication → Users → Add user → Create new user**.
2. Informe o seu e-mail e uma senha provisória, marque **Auto Confirm User** e clique em **Create user**.
3. Volte ao **SQL Editor → New query**, cole o comando abaixo **trocando o e-mail** e clique em **Run**:

   ```sql
   update public.perfis
      set papel = 'admin', ativo = true, nome = 'Jeferson'
    where email = 'seu-email@exemplo.com';
   ```

   Deve aparecer *“Success. 1 rows affected”*. (Se aparecer 0, confira o e-mail.)

### Passo 4 — Copiar as chaves públicas

Em **Project Settings → API** (ou no botão **Connect** no topo / **API Keys**), copie:

- **Project URL** — algo como `https://abcdefghijk.supabase.co`
- **Publishable key** (`sb_publishable_...`) — ou, em projetos antigos, a **anon public** key.

> ⚠️ **Nunca** use a *Secret key* / *service_role* no site. Se usar por engano, o aplicativo mostra um alerta e não abre.

### Passo 5 — Publicar o site no Cloudflare Pages

1. Antes, junte o código no ramo principal do GitHub: abra um *Pull Request* do ramo
   `claude/warranty-registry-app-51jbw6` para `main` e faça o *merge* (ou peça para eu fazer).
   Recomendado: deixe o repositório **privado** (GitHub → Settings → General → Danger Zone → Change visibility).
2. Acesse **https://dash.cloudflare.com**, crie uma conta e vá em **Workers & Pages → Create → Pages →
   Connect to Git** (se aparecer a opção de Workers, procure “Pages”).
3. Autorize o GitHub e escolha o repositório **App-garantia**.
4. Configuração do build:
   - **Production branch:** `main`
   - **Framework preset:** `Vite` (ou *None*)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. Em **Environment variables**, adicione:

   | Nome | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | a *Project URL* do passo 4 |
   | `VITE_SUPABASE_ANON_KEY` | a *Publishable key* (ou *anon key*) do passo 4 |
   | `NODE_VERSION` | `22` |
   | `VITE_INATIVIDADE_MINUTOS` | `30` (opcional: minutos sem uso até sair) |

6. Clique em **Save and Deploy**. Em 1–2 minutos você terá um endereço como `https://garantias.pages.dev`.
   (Opcional: em **Custom domains** dá para usar algo como `garantias.lojaodostratores.com.br`.)

> Mudou alguma variável? Faça um novo deploy (**Deployments → Retry deployment**), pois elas entram no site na publicação.

### Passo 6 — Informar o endereço do site ao Supabase

No Supabase: **Authentication → URL Configuration** → **Site URL** = o endereço do passo 5
(ex.: `https://garantias.pages.dev`) → **Save**.

### Passo 7 — Primeiro acesso

Abra o endereço do site, entre com seu e-mail e a senha provisória. O aplicativo vai pedir para você criar uma senha
nova. Pronto! Recomendo ativar a **verificação em duas etapas** em **Minha conta**.

> **Alternativa ao Cloudflare:** o projeto também funciona no **Netlify** (o arquivo `netlify.toml` já está pronto;
> cadastre as mesmas variáveis). Evite o plano gratuito da Vercel: ele não permite uso comercial.

## 4. Dar acesso a outras pessoas

1. No Supabase: **Authentication → Users → Add user → Create new user** (e-mail + senha provisória +
   **Auto Confirm User**).
2. No aplicativo: **Usuários → Atualizar lista**. A pessoa aparece como “Aguardando liberação”.
3. Clique em **Editar**, escolha o papel e marque **Acesso liberado**.
4. Envie à pessoa o endereço do site, o e-mail e a senha provisória (ela troca no primeiro acesso).

- **Esqueceu a senha?** Em **Usuários → Redefinir senha** o sistema gera uma senha provisória.
- **Perdeu o celular da verificação em 2 etapas?** **Usuários → Remover 2 etapas**.
- **Tirar o acesso:** **Editar** → desmarque **Acesso liberado** (a pessoa é desconectada na hora).

## 5. Importar as listas de produtos e de clientes

Menu **Importar listas** (somente administrador). Aceita **Excel (.xlsx)** e **CSV**. Há um botão
**Baixar planilha-modelo**. O sistema reconhece as colunas automaticamente, mostra uma **prévia com os erros e avisos
linha a linha** e só grava quando você confirmar. Importar a mesma lista de novo **não duplica**: atualiza o que já existe.

**Produtos** — colunas: `Código` (opcional, recomendado), `Descrição`, `Marcas`, `Origem` (Nacional/Importado,
opcional), `Referência do fabricante` (opcional). As marcas podem vir:

- na mesma célula, separadas por vírgula, ponto e vírgula ou barra: `VALTRA, JOHN DEERE / SKF`; ou
- uma linha por marca, repetindo o código do produto.

| Código | Descrição | Marcas | Origem |
|---|---|---|---|
| P0001 | FILTRO DE ÓLEO DO MOTOR | VALTRA, MASSEY FERGUSON | Nacional |
| P0001 | FILTRO DE ÓLEO DO MOTOR | JOHN DEERE | Importado |

**Clientes** — colunas: `Código`, `Nome` e, opcionalmente, `CPF/CNPJ`, `Cidade`, `UF`, `Telefone`.

> Dica: se os códigos têm zeros à esquerda (ex.: `000123`), formate a coluna como **Texto** no Excel antes de salvar.
> Arquivos `.xls` antigos: abra no Excel e use **Salvar como → .xlsx**.
>
> Se preferir, me envie as planilhas que eu confiro o formato e ajusto o importador para elas.

## 6. Backup automático e “manter ativo”

Os dados ficam gravados no banco do Supabase (servidores da AWS em São Paulo). Como o plano gratuito **não faz backup
automático**, o projeto inclui uma automação no GitHub que faz um **backup diário criptografado** (guardado por 30
dias) e outra que evita que o projeto gratuito “durma” por falta de uso.

**Configurar (uma vez):** no GitHub, abra o repositório → **Settings → Secrets and variables → Actions →
New repository secret** e cadastre:

| Segredo | Valor |
|---|---|
| `SUPABASE_URL` | a *Project URL* |
| `SUPABASE_ANON_KEY` | a *Publishable key* (ou *anon key*) |
| `SUPABASE_DB_URL` | no Supabase, botão **Connect** → **Session pooler** → copie a URI e troque `[YOUR-PASSWORD]` pela senha do banco (passo 1) |
| `BACKUP_SENHA` | uma senha longa só para os backups — **guarde em lugar seguro**: sem ela o backup não abre |

Depois, em **Actions → Backup diário → Run workflow**, rode uma vez para testar. Os arquivos ficam em cada execução,
na seção **Artifacts**. Para restaurar, use `scripts/restaurar-backup.sh` (instruções dentro do arquivo; peça ajuda a um
técnico). Observação: as **fotos e PDFs** ficam no armazenamento do Supabase e não entram nesse backup.

## 7. Custos e limites

| Serviço | Plano gratuito | Observação |
|---|---|---|
| Supabase | 500 MB de banco, 1 GB de arquivos, 50 mil usuários/mês | Pausa após 7 dias sem uso (a automação “Manter Supabase ativo” evita) |
| Cloudflare Pages | Acessos ilimitados, 500 publicações/mês | Uso comercial permitido |
| GitHub Actions | 2.000 minutos/mês em repositório privado | Backup + verificação usam pouco |

Para uso corporativo prolongado, recomendo o **Supabase Pro (US$ 25/mês)**: backups diários automáticos do próprio
Supabase, sem pausa por inatividade e suporte. O aplicativo não precisa de nenhuma mudança para isso.

## 8. Problemas comuns

| Situação | Solução |
|---|---|
| Tela “Configuração incompleta” | Confira as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no Cloudflare e faça novo deploy. |
| “Email logins are disabled” | Em Authentication, o provedor **Email** foi desligado. Ligue-o de novo (desligue apenas *Allow new users to sign up*). |
| Usuário entra e vê “Acesso aguardando liberação” | Libere em **Usuários → Editar → Acesso liberado**. |
| Ninguém consegue entrar e o site mostra erro de conexão | O projeto gratuito pode ter pausado: no painel do Supabase clique em **Restore project** e configure o “manter ativo” (seção 6). |
| Garantia registrada por engano | Mude o status para **Cancelada** (garantias não são apagadas, por segurança). |

## 9. Para técnicos: desenvolvimento e testes

Tecnologias: React 19 + TypeScript + Vite (front-end estático) e Supabase (PostgreSQL com RLS, Auth com TOTP,
Storage, Realtime).

```bash
npm install
npm run db:start            # Supabase local (requer Docker)
cp .env.example .env.local  # preencha com os dados de "npx supabase status"
npm run dev                 # http://localhost:5173

npm run lint && npm run typecheck
npm test                    # testes de unidade (Vitest)
npm run db:test             # testes de segurança do banco (pgTAP)
npm run test:e2e            # testes no navegador (Playwright) — recria o banco local
```

Estrutura:

```
supabase/migrations/   esquema do banco, regras de acesso (RLS), auditoria e funções
supabase/tests/        testes de segurança do banco
src/lib/               cliente Supabase, formatação, importação de planilhas, erros em português
src/pages/             telas
tests/e2e/             testes de ponta a ponta (rodam com os mesmos cabeçalhos de segurança da hospedagem)
public/_headers        cabeçalhos de segurança (CSP, HSTS…) usados pelo Cloudflare Pages / Netlify
.github/workflows/     verificação automática, backup diário e “manter ativo”
```
