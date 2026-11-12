#!/usr/bin/env bash
# Restaura um backup criptografado (gerado pela automação "Backup diário").
#
# ATENÇÃO: use em um projeto Supabase NOVO, onde você já rodou a migração
# (supabase/migrations/...sql) e ainda NÃO criou nenhum usuário.
# Os dados atuais do banco de destino serão SUBSTITUÍDOS.
#
# Requisitos no computador: gpg, tar e psql (PostgreSQL 17).
# Uso:
#   ./scripts/restaurar-backup.sh backup-garantias-AAAA-MM-DD.tar.gz.gpg "postgresql://postgres.xxxx:SENHA@...pooler.supabase.com:5432/postgres"
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Uso: $0 <arquivo-backup.tar.gz.gpg> <url-do-banco>" >&2
  exit 1
fi
ARQUIVO="$1"
URL_BANCO="$2"

read -rsp "Senha do backup (BACKUP_SENHA): " SENHA
echo
PASTA=$(mktemp -d)
trap 'rm -rf "$PASTA"' EXIT

if ! gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 -d "$ARQUIVO" 3<<<"$SENHA" > "$PASTA/backup.tar.gz" 2>/dev/null; then
  echo "Senha do backup incorreta ou arquivo danificado." >&2
  exit 1
fi
tar -xzf "$PASTA/backup.tar.gz" -C "$PASTA"
test -s "$PASTA/dados.sql" || { echo "Backup sem dados (arquivo inválido)." >&2; exit 1; }

echo "Os dados do banco de destino serão SUBSTITUÍDOS pelos do backup."
read -rp "Digite RESTAURAR para continuar: " CONFIRMA
[ "$CONFIRMA" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

psql "$URL_BANCO" -v ON_ERROR_STOP=1 --single-transaction \
  -c "truncate public.empresas restart identity cascade" \
  -c "set session_replication_role = replica" \
  -f "$PASTA/dados.sql"

echo "Backup restaurado com sucesso."
