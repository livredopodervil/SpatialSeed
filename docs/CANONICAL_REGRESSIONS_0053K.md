# Regressões canônicas — 0053k

## Objetivo

O build 0053k substitui a disputa entre matrizes canônicas, animação e preview
por uma visão derivada única de objetos localmente resolvidos. O documento e o
`InstanceGraph` continuam autoritativos; a nova estrutura contém apenas caches
efêmeros, versionados e descartáveis.

## Modelo de camadas

`LocallyResolvedObjectHierarchy` mantém uma base canônica e camadas ordenadas.
Cada camada guarda somente matrizes, propriedades ou limites que realmente
substitui. Quando uma ocorrência não possui entrada na camada atual, sua matriz
local é recuperada da camada imediatamente inferior e recomposta sob o pai
efetivo da camada atual.

Para um nó `n`, uma camada `k` sem override próprio calcula
`W(k,n) = W(k,pai(n)) · L(k-1,n)`, onde `W` é a matriz mundial e `L` é a matriz
local obtida da camada inferior. Assim, mover uma raiz propaga-se recursivamente
sem copiar matrizes para toda a subárvore; um override mais específico continua
vencendo apenas no caminho onde existe.

No renderer, a precedência é:

1. projeção canônica;
2. animação;
3. previews compartilhados, inclusive a barreira de commit.

O `FastTransformOverlay` permanece como captura da intenção final do gizmo. Ele
não é mais a fonte implícita para animação ou preview remoto.

## Commit sem salto de quadro

Antes do dispatch final, o renderer publica a fase `commit` com as matrizes
finais. O coordenador converte a sessão para `committing`. A notificação
síncrona do Sandbox não remove essa camada. `SceneProjectionScheduler` carrega
a revisão junto do snapshot e confirma sua instalação; somente então a camada
do commit é retirada. O temporizador permanece como recuperação para um viewer
que não consiga projetar. Cancelamentos continuam removendo o preview
imediatamente.

## Grupos de grupos

Ao compactar uma instância dentro de outra, overrides descendentes agora são
prefixados pelo slot externo. Um caminho `slot:0/slot:1` da instância interna
vira, por exemplo, `slot:2/slot:0/slot:1` na nova raiz. Definições permanecem
imutáveis e compartilháveis; as exceções locais permanecem na instância-raiz.

## Edição de malha

`MeshEditVisibility` passou a ser usado de fato. Antes de a malha editável ficar
visível, todos os recursos de lote pertencentes ao objeto são ocultados de modo
atômico. Razões de ocultação são compostas; encerrar a edição não pode tornar
visível um objeto ainda suprimido por outra política.

## Escala negativa como espelho

O fator das alças locais conserva o sinal quando o ponteiro cruza o pivô. O
único intervalo proibido é a vizinhança singular de zero, substituída pelo
módulo mínimo com o mesmo sinal. `scaleWorldTrsWithoutShear()` aceita fatores
negativos e o renderer reutiliza a separação já existente entre geometria
espelhada e matriz de instância com determinante positivo.

## Validação

O teste `test_canonical_regressions_0053k.mjs` cobre herança entre três
níveis, precedência de camadas, preservação de geometria e aparência, grupo de
grupos com override, contexto mundial, razões de visibilidade, barreira de
commit e escala negativa. Os gates gerais continuam cobrindo runtime, PWA,
arquitetura, alcance e regressões anteriores.
