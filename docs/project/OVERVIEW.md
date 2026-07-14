# Visão geral

O SpatialSeed é um ambiente modular para criação, edição, visualização e simulação de estruturas espaciais, matemáticas e procedurais.

## Direção

- criação manual e procedural;
- transformações afins cumulativas;
- edição eficiente de grandes conjuntos;
- recursos gráficos compartilhados;
- grupos transportáveis entre regiões e sandboxes;
- plugins e múltiplos renderizadores;
- inspeção e edição futura do próprio projeto;
- uso local, offline e público.

## Princípios

1. O estado lógico não depende do renderer.
2. O viewer mantém apenas estado local.
3. Operações editoriais são comandos auditáveis.
4. Recursos iguais são compartilhados.
5. Alterações grandes são divididas em etapas testáveis.
6. Toda etapa deve ter backup e reversão.
7. Experimentos ficam separados do cliente estável.
8. Portabilidade é criada em paralelo.
