#!/data/data/com.termux/files/usr/bin/bash
#
# ==========================================================
# Spatial Seed - Migração para repositório Git no $HOME
# ==========================================================
#
# Objetivo:
#
#   Situação atual
#
#       /storage/emulated/0/SpatialSeed
#
#   Situação desejada
#
#       ~/SpatialSeed                <- repositório Git
#
#       ~/storage/shared/SpatialSeed <- cópia para o navegador
#
# O navegador continuará lendo do armazenamento compartilhado,
# enquanto o Git trabalhará em um diretório Linux normal.
#
# ==========================================================

set -e

# Diretório usado pelo navegador
ANDROID="$HOME/storage/shared/SpatialSeed"

# Novo repositório
REPO="$HOME/SpatialSeed"

echo
echo "========================================="
echo " Spatial Seed - Migração"
echo "========================================="
echo

#
# Verificações
#

if [ ! -d "$ANDROID" ]; then
    echo "ERRO:"
    echo
    echo "Diretório não encontrado:"
    echo
    echo "    $ANDROID"
    echo
    exit 1
fi

#
# Cria cópia do projeto
#

echo "Copiando arquivos..."

mkdir -p "$REPO"

cp -a "$ANDROID"/. "$REPO"/

#
# Remove eventual Git antigo copiado
#

rm -rf "$REPO/.git"

#
# Inicializa Git
#

cd "$REPO"

git init

git branch -M main

#
# Configuração
#

echo
echo "Informe seu nome para os commits:"
read NOME

echo
echo "Informe seu e-mail:"
read EMAIL

git config user.name "$NOME"
git config user.email "$EMAIL"

#
# Primeiro commit
#

git add .

git commit -m "Primeira versão do Spatial Seed"

#
# Script de sincronização
#

cat > "$HOME/seed-sync" <<'EOF'
#!/data/data/com.termux/files/usr/bin/bash

set -e

REPO="$HOME/SpatialSeed"
ANDROID="$HOME/storage/shared/SpatialSeed"

echo
echo "Sincronizando..."

mkdir -p "$ANDROID"

cp -au "$REPO"/. "$ANDROID"/

echo
echo "Concluído."
EOF

rsync -av --delete \
    "$REPO"/ \
    "$ANDROID"/
    


#
# Script para iniciar servidor
#

cat > "$HOME/seed-run" <<'EOF'
#!/data/data/com.termux/files/usr/bin/bash

cd "$HOME/storage/shared/SpatialSeed"

python -m http.server 8080 --bind 127.0.0.1
EOF

chmod +x "$HOME/seed-run"

#
# Resumo
#

echo
echo "========================================="
echo "Migração concluída."
echo "========================================="
echo
echo "Repositório:"
echo
echo "   $REPO"
echo
echo "Arquivos usados pelo navegador:"
echo
echo "   $ANDROID"
echo
echo "Comandos disponíveis:"
echo
echo "   seed-sync"
echo "   seed-run"
echo
echo "Fluxo recomendado:"
echo
echo "   cd ~/SpatialSeed"
echo "   editar arquivos"
echo "   git status"
echo "   git commit"
echo "   seed-sync"
echo "   seed-run"
echo