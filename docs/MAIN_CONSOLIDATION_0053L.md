# Consolidação do main — 0053l

## Objetivo

O build 0053l fecha regressões de continuidade editorial e torna a prévia local
de transformação um consumidor explícito da hierarquia resolvida introduzida em
0053k. Documento, histórico e `InstanceGraph` continuam canônicos; a prévia é
uma camada efêmera e recursiva.

## Continuidade de ferramenta e entrada em malha

- Entrar em vértices, arestas ou faces reativa a última transformação usada
  (`translate`, `rotate` ou `scale`).
- Duplicar não troca implicitamente a ferramenta ativa.
- Entrar em edição de malha seleciona o primeiro vértice por padrão. Selecionar
  todos permanece uma opção explícita de API.
- A seleção de componentes é sincronizada novamente depois de o modo de gizmo
  ser ativado, de modo que o primeiro arraste não dependa de uma troca manual de
  ferramenta.

## Prévia hierárquica

Cada gesto local cria uma camada `local-preview:<id>` acima de animação e
preview compartilhado. A camada contém somente as raízes canônicas selecionadas.
`LocallyResolvedObjectHierarchy.resolveAffectedBy()` enumera essas raízes e
todos os descendentes, resolve as matrizes efetivas em qualquer profundidade e
atualiza proxies e lotes sem escrever no documento.

No commit, a camada muda para `committing` antes do dispatch. Ela só é liberada
depois de a nova projeção canônica chegar ao renderer. Cancelamento remove a
camada imediatamente e reaplica a camada inferior apenas na subárvore afetada.
O payload de preview entre viewers também contém raízes; o viewer remoto faz a
mesma resolução recursiva.

## Pivô, alavanca e âncoras

O pivô editorial padrão passa a ser o centro dos limites mundiais da seleção.
As políticas `active`, `anchor`, `median` e `custom` continuam disponíveis
quando escolhidas explicitamente. Em edição de malha, o gizmo nasce sobre a
seleção de componentes e usa seu referencial local já existente.

Uma âncora com política `reference` agora resolve o alvo pela mesma hierarquia
local usada por animação e previews. Assim, o ponto referenciado acompanha a
matriz efetiva do alvo durante essas camadas, sem criar uma segunda fonte de
transformação. O status público expõe `anchorRef` para diagnóstico.

Isso consolida a política espacial, mas não transforma âncoras em um esqueleto:
ossos/juntas, propagação cinemática, regras de ciclo, serialização própria e
avaliação temporal de juntas continuam fora deste incremento.

## Regressões recuperadas

A suíte volta a conter os testes removidos na reorganização 0050b, adaptados às
APIs públicas atuais. Os novos contratos cobrem pivô padrão, continuidade da
ferramenta, primeira seleção de vértice e cache recursivo de preview. Os gates
não fixam uma contagem histórica: validam o conjunto descoberto no build.

## Pendências confirmadas fora do 0053l

- Semânticas de câmera da linha 0030 ainda não portadas integralmente: `aim`,
  precedência entre animação e arraste manual, restauração de preview e
  visibilidade semântica de helpers.
- Player, catálogo de ajuda e atlas de capacidades da linha 0043c ainda não
  estão ligados à aplicação canônica.
- A interface 0046 permanece deliberadamente excluída por ter sido substituída;
  não deve ser reintegrada por merge.
- A documentação/tutorial da linha 0049a ainda precisa de triagem editorial.
- A política de âncora referenciada ainda não inclui autoria cinemática ou
  esquelética.

Essas lacunas devem ser portadas em incrementos isolados, com testes próprios,
sem integrar a branch de recuperação inteira.

## Validação necessária antes do main

Além dos gates automatizados, o candidato precisa de validação em navegador:

1. entrar em vértices a partir de rotação e escala e arrastar imediatamente;
2. duplicar em cada modo e confirmar que a ferramenta não muda;
3. transformar grupo contendo grupo durante a prévia, commit e cancelamento;
4. repetir com animação ativa e com preview de outro viewer;
5. alternar pivô padrão, ativo, âncora e personalizado;
6. mover um alvo de `anchor reference` durante animação e preview.

O `main` só deve avançar depois dessa validação visual e do `runtime test all`
no perfil diagnóstico do navegador.
