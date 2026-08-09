# Correções de escala e preset de render — 0053i

## Escopo

Esta revisão corrige duas regressões visuais observadas no build 0053h:

1. a escala aparecia durante o arraste, mas não permanecia após o término;
2. trocar o preset de render removia objetos da projeção até uma alteração de
   material forçar sua reinserção.

Nenhuma das correções altera o formato do documento, materiais canônicos,
histórico ou semântica dos comandos públicos.

## Escala

O preview calculava e projetava corretamente a nova matriz mundial, porém não
gravava essa matriz no `FastTransformOverlay`. No término do gesto, o commit
consultava o overlay e recuperava a matriz inicial capturada no começo da
sessão. A revisão passa a registrar no overlay a mesma matriz produzida por
`scaleWorldTrsWithoutShear`, antes de atualizar o proxy e o lote visual.

Contrato verificado: o preview continua efêmero e o `pointerup` publica no
máximo um `selection.transform-world` com a matriz final observada.

## Presets de render

Uma troca de parâmetros materiais reconstrói os lotes renderizáveis. O fluxo
removia a instância e limpava `batchKey`, mas preservava `batchBaseKey` e
`spatialShardBaseKey` no proxy. Na atualização seguinte, o renderer interpretava
essas chaves transitórias como associação válida e tentava atualizar uma
instância inexistente. Alterar o material modificava a chave-base e, por isso,
mascarava o defeito ao forçar uma nova inserção.

A reconstrução agora invalida as três chaves transitórias. O update seguinte
reinsere cada objeto com o material derivado do preset atual, sem mutar sua
aparência no documento.

## Validação

- gate específico `audit_scale_render_preset_0053i.py`;
- gates atuais: 13/13;
- runtime executável em Node: 580/580;
- regressões standalone: 20/20;
- PWA: 334 recursos;
- imports relativos não resolvidos: zero;
- dívida arquitetural: 140 achados aceitos, nenhum novo.

Ainda é necessário validar no navegador com mouse real: escala nos eixos,
planos, centro `XYZ` e cantos dos limites; depois alternar entre todos os
presets e confirmar que os objetos permanecem visíveis e selecionáveis.
