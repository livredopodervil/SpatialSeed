# Distribuição e portabilidade

O cliente é estático, mas precisa de HTTP por causa de módulos, import maps, texturas, `fetch` e políticas de origem.

## Modalidades

1. Página pública: nenhum requisito de instalação.
2. PWA: instalação pelo navegador e uso offline.
3. Pasta portátil: servidor autocontido por plataforma.
4. Desenvolvimento: qualquer servidor HTTP.

## Estratégia

- uso imediato: página pública;
- uso offline comum: PWA;
- acesso amplo a arquivos: pacote portátil;
- desenvolvimento: Python, Node ou outro servidor.

A distribuição será criada em paralelo. O fluxo atual não será substituído antes de testes.
