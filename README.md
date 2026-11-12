# App de Garantias — Lojão dos Tratores / LL Tratores

Aplicativo para **registrar e acompanhar garantias** do setor de compras, com acesso restrito por login e senha.
Funciona como **programa instalado no Windows (.exe)**, no navegador do computador e no celular. Fica no ar 24 horas e
todos os dados são gravados automaticamente em um banco de dados na nuvem (Supabase / PostgreSQL). O que uma pessoa
registra aparece **na hora** para todas as outras.

---

## Sumário

1. [O que o aplicativo faz](#1-o-que-o-aplicativo-faz)
2. [Segurança](#2-segurança)
3. [Como colocar no ar (passo a passo)](#3-como-colocar-no-ar-passo-a-passo) — banco de dados, instalador do Windows e celular
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

**Menu principal** (enxuto): Painel, Garantias, Clientes e Produtos — e o botão **+ Nova garantia**.

- **Painel**: em andamento, abertas há mais de 30 dias, concluídas e valor em andamento; situação das garantias;
  comparação Lojão × LL e Nacional × Importado; últimas movimentações — atualiza sozinho.
- **Garantias**: busca (nº, cliente, código, peça, marca, NF, fornecedor), filtros (situação, empresa, origem,
  período) e **exportação para Excel**.
- **Clientes** e **Produtos** (cada produto com suas várias marcas).

**Configurações** (no rodapé do menu):

- **Importar planilhas** (administrador): listas de produtos e de clientes em Excel (.xlsx) ou CSV, com prévia e
  conferência antes de gravar.
- **Usuários** (administrador): liberar/bloquear acesso, definir papel, redefinir senha, remover verificação em 2 etapas.
- **Marcas**: corrigir nomes e ativar/desativar marcas.
- **Auditoria** (administrador): registro permanente de todas as inclusões, alterações e exclusões.
- **Minha conta**: trocar senha, ativar verificação em duas etapas, sair de todos os aparelhos.

Operadores e usuários de consulta veem em Configurações apenas **Marcas** e **Minha conta**.

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

**Link fixo para baixar o programa do Windows** (funciona depois da Parte A):
**https://github.com/jefersonramos637-max/App-garantia/releases/latest/download/Garantias-Instalador.exe**

O programa do Windows já leva o sistema dentro dele e **se atualiza sozinho**. Só falta o banco de dados, que precisa
ser criado na **sua** conta do Supabase (gratuito). Tempo estimado: 15 minutos.

### Parte A — Criar o banco de dados (você, uma única vez)

**A1. Criar o projeto**

1. Acesse **https://supabase.com**, crie uma conta e clique em **New project**.
2. Nome: `garantias`. **Database Password**: crie uma senha forte e **guarde-a** (não envie para ninguém).
   Região: **South America (São Paulo)**. Clique em **Create new project** e aguarde 1–2 minutos.

**A2. Criar as tabelas e as regras de segurança**

1. No menu lateral, abra **SQL Editor** → **New query**.
2. Abra o arquivo [`supabase/migrations/20261111000000_esquema_inicial.sql`](supabase/migrations/20261111000000_esquema_inicial.sql),
   clique no botão **Copy raw file** (ícone de copiar), cole no editor do Supabase e clique em **Run**.
   Deve aparecer *“Success. No rows returned”*. **Rode apenas uma vez.**

**A3. Fechar o cadastro público (muito importante para a segurança)**

Em **Authentication** (menu lateral) → **Sign In / Providers** (ou *Settings*):

- **Allow new users to sign up** → **DESLIGADO**. (Assim ninguém consegue criar conta sozinho.)
- Mantenha o provedor **Email** **LIGADO** (é ele que permite entrar com e-mail e senha).
- No provedor **Email**: **Minimum password length** = `10` e **Password requirements** =
  *“Lowercase, uppercase letters and digits”*.

**A4. Criar o seu usuário administrador**

1. **Authentication → Users → Add user → Create new user**: seu e-mail, uma senha provisória, marque
   **Auto Confirm User** e clique em **Create user**.
2. Volte ao **SQL Editor → New query**, cole o comando abaixo **trocando o e-mail** e clique em **Run**:

   ```sql
   update public.perfis
      set papel = 'admin', ativo = true, nome = 'Jeferson'
    where email = 'seu-email@exemplo.com';
   ```

   Deve aparecer *“Success. 1 rows affected”*. (Se aparecer 0, confira o e-mail.)

**A5. Passar os dois dados públicos para o programa**

Em **Project Settings → API** (ou no botão **Connect** no topo / **API Keys**), copie:

- **Project URL** — algo como `https://abcdefghijk.supabase.co`
- **Publishable key** (`sb_publishable_...`) — ou, em projetos antigos, a **anon public** key.

Envie esses dois dados para o Claude **ou** cole você mesmo no arquivo [`.env.production`](.env.production)
(no GitHub: abra o arquivo → ícone de lápis → preencha → **Commit changes**):

```
VITE_SUPABASE_URL=https://abcdefghijk.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

> Esses dois dados são **públicos** (ficam dentro do programa) — tudo bem compartilhar. ⚠️ **Nunca** envie nem cole
> a *Secret key* / *service_role* nem a senha do banco. Se a chave secreta for usada por engano, o programa se recusa a
> ser gerado.

### Parte B — Automática (GitHub)

Assim que o `.env.production` é preenchido, o GitHub faz sozinho, em uns 10 minutos:

1. roda todos os testes;
2. gera o instalador num computador Windows;
3. **abre o programa gerado e testa** (tela de login e conexão com o banco);
4. publica a versão em **Releases** — o link fixo lá em cima passa a baixar essa versão.

Acompanhe em **Actions** (no topo do repositório). A cada melhoria enviada, uma versão nova é publicada e **os programas
já instalados se atualizam sozinhos** (avisam “Atualização pronta — Reiniciar agora”).

### Parte C — Instalar nos computadores

1. Baixe pelo link fixo (ou em **Releases**) o arquivo `Garantias-Instalador.exe`.
2. Dê dois cliques. Não precisa ser administrador do Windows. Será criado o atalho **Garantias** na área de trabalho e
   no menu Iniciar.
3. Entre com seu e-mail e a senha provisória: o programa pede para criar uma senha nova. Recomendo ativar a
   **verificação em duas etapas** em **Configurações → Minha conta**.

> **Aviso do Windows na primeira instalação:** como o instalador não tem “assinatura digital” (um certificado pago, de
> cerca de R$ 1.000 a R$ 2.500 por ano), o Windows pode mostrar *“O Windows protegeu o computador”*. Clique em
> **Mais informações → Executar assim mesmo**. Isso é normal para programas próprios da empresa.

Segurança do programa: as telas ficam dentro do programa, só conversam com o seu banco do Supabase, não têm acesso aos
arquivos do computador, nenhum outro site abre dentro dele (links externos vão para o navegador) e o executável não
aceita “truques” para rodar outros programas. As atualizações vêm só das versões publicadas neste repositório —
**ative a verificação em duas etapas na sua conta do GitHub** (github.com → Settings → Password and authentication).

### Parte D (opcional) — Usar também no celular e no navegador

Para acessar de qualquer lugar pelo navegador (inclusive celular), publique o site no **Cloudflare Pages** (gratuito,
permite uso comercial):

1. Acesse **https://dash.cloudflare.com**, crie uma conta e vá em **Workers & Pages → Create → Pages →
   Connect to Git** (se aparecer a opção de Workers, procure “Pages”). Autorize o GitHub e escolha **App-garantia**.
2. Build: **Framework preset** `Vite`, **Build command** `npm run build`, **Build output directory** `dist`.
   Não precisa de variáveis: a configuração vem do `.env.production`.
3. **Save and Deploy**. Em 1–2 minutos você terá um endereço como `https://garantias.pages.dev`.
4. No Supabase: **Authentication → URL Configuration** → **Site URL** = esse endereço → **Save**.

> Alternativa: **Netlify** (o `netlify.toml` já está pronto). Evite o plano gratuito da Vercel: não permite uso comercial.

## 4. Dar acesso a outras pessoas

1. No Supabase: **Authentication → Users → Add user → Create new user** (e-mail + senha provisória +
   **Auto Confirm User**).
2. No aplicativo: **Configurações → Usuários → Atualizar lista**. A pessoa aparece como “Aguardando liberação”.
3. Clique em **Editar**, escolha o papel e marque **Acesso liberado**.
4. Envie à pessoa o endereço do site, o e-mail e a senha provisória (ela troca no primeiro acesso).

- **Esqueceu a senha?** Em **Configurações → Usuários → Redefinir senha** o sistema gera uma senha provisória.
- **Perdeu o celular da verificação em 2 etapas?** **Configurações → Usuários → Remover 2 etapas**.
- **Tirar o acesso:** **Editar** → desmarque **Acesso liberado** (a pessoa é desconectada na hora).

## 5. Importar as listas de produtos e de clientes

**Configurações → Importar planilhas** (somente administrador). Aceita **Excel (.xlsx)** e **CSV**. Há um botão
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

Os dados ficam gravados no banco do Supabase (servidores da AWS em São Paulo).

- **Manter ativo:** o plano gratuito do Supabase “dorme” após 7 dias sem uso. A automação **Manter Supabase ativo**
  evita isso a cada 2 dias — funciona **sozinha** assim que o `.env.production` é preenchido.
- **Backup diário criptografado** (guardado por 30 dias): como o plano gratuito **não faz backup automático**, há uma
  automação para isso. Ela precisa de dois segredos que **só você** deve cadastrar (envolvem a senha do banco):
  no GitHub, **Settings → Secrets and variables → Actions → New repository secret**:

| Segredo | Valor |
|---|---|
| `SUPABASE_DB_URL` | no Supabase, botão **Connect** → **Session pooler** → copie a URI e troque `[YOUR-PASSWORD]` pela senha do banco (passo A1) |
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
| Tela “Configuração incompleta” no site | Confira `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env.production` e publique de novo. |
| O link de download dá “Not Found” | O instalador ainda não foi publicado: preencha o `.env.production` (passo A5) e acompanhe em **Actions**. |
| “Email logins are disabled” | Em Authentication, o provedor **Email** foi desligado. Ligue-o de novo (desligue apenas *Allow new users to sign up*). |
| Usuário entra e vê “Acesso aguardando liberação” | Libere em **Configurações → Usuários → Editar → Acesso liberado**. |
| Programa mostra “Sem conexão com o servidor” | Verifique a internet do computador. Se continuar, veja a linha abaixo. |
| Windows diz “O Windows protegeu o computador” ao instalar | Normal sem assinatura digital: **Mais informações → Executar assim mesmo** (veja a Parte C). |
| Quero forçar a atualização do programa | No programa, aperte **Alt** → **Aplicativo → Procurar atualização**. |
| Ninguém consegue entrar e o site mostra erro de conexão | O projeto gratuito pode ter pausado: no painel do Supabase clique em **Restore project** e configure o “manter ativo” (seção 6). |
| Garantia registrada por engano | Mude o status para **Cancelada** (garantias não são apagadas, por segurança). |

## 9. Para técnicos: desenvolvimento e testes

Tecnologias: React 19 + TypeScript + Vite (front-end estático), Supabase (PostgreSQL com RLS, Auth com TOTP,
Storage, Realtime) e Electron (programa para Windows).

```bash
npm install
npm run db:start            # Supabase local (requer Docker)
cp .env.example .env.local  # preencha com os dados de "npx supabase status"
npm run dev                 # http://localhost:5173

npm run lint && npm run typecheck
npm test                    # testes de unidade (Vitest)
npm run db:test             # testes de segurança do banco (pgTAP)
npm run test:e2e            # testes no navegador (Playwright) — recria o banco local

# Programa para computador (Electron) — telas embutidas, servidas em app://garantias/
cd desktop && npm ci
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<publishable local> npm run iniciar
# Testes do programa: na raiz, "xvfb-run -a npm run test:e2e" (Linux) roda também tests/e2e/desktop.spec.ts
# O instalador é gerado, testado (scripts/testar-programa.mjs) e publicado pelo GitHub Actions
# (.github/workflows/app-windows.yml) num Windows, com atualização automática via Releases (electron-updater).
```

Estrutura:

```
supabase/migrations/   esquema do banco, regras de acesso (RLS), auditoria e funções
supabase/tests/        testes de segurança do banco
src/lib/               cliente Supabase, formatação, importação de planilhas, erros em português
src/pages/             telas
tests/e2e/             testes de ponta a ponta (rodam com os mesmos cabeçalhos de segurança da hospedagem)
public/_headers        cabeçalhos de segurança (CSP, HSTS…) usados pelo Cloudflare Pages / Netlify
desktop/               programa para Windows (Electron): telas embutidas, segurança e atualização automática
.env.production        configuração pública do Supabase usada no programa e no site
.github/workflows/     verificação automática, instalador Windows, backup diário e “manter ativo”
```
