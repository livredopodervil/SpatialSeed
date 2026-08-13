# SpatialSeed 0054k — resolução explícita do plano de caminhos

> **SUPERADO EM 0054l:** plano de edição e plano de desenho deixam de ser conceitos públicos independentes e passam a aliases do único Plano ativo.

## Regra

As ferramentas baseadas em `PathSketchController` — tubo, sweep, perfil para extrusão e perfil para revolução — usam um único contrato de plano. O modo automático (`locked-or-viewer`) resolve, nesta ordem:

1. plano de edição;
2. plano de desenho;
3. plano/trava de navegação;
4. viewer.

Escolher explicitamente `drawing`, `edit`, `viewer` ou um plano mundial ignora a prioridade automática e exige aquela fonte.

O snapshot do gesto publica `resolvedPlaneSource` e o painel mostra `plano efetivo` durante o desenho. Assim a UI distingue a preferência solicitada (`planeSource`) da fonte realmente resolvida (`resolvedPlaneSource`).

## Motivação

O comportamento anterior priorizava qualquer plano de desenho persistente sobre o plano de edição. Um plano de desenho derivado do viewer podia, portanto, mascarar um plano de edição recém-definido. Como tubo, sweep, extrusão de perfil e revolução compartilham o mesmo controlador, a correção é feita uma única vez no resolvedor.
