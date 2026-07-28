# HUD adaptativo 0039a

O build 0039a transforma o HUD em uma superfície dirigida pelo estado real do editor, em vez de uma lista fixa de atalhos.

## Estado observado

A heurística consulta, pela API pública do runtime:

- contexto objeto ou edição de malha;
- modo vértice, aresta ou face;
- quantidade de objetos ou componentes selecionados;
- capacidades de agrupar, desagrupar e entrar na edição de malha;
- objetos selecionados que podem fornecer caminho ou perfil;
- colocação de objeto ou desenho de caminho em andamento.

Uma mudança na seleção notifica imediatamente o `EditContextController`. Assim, ações como duplicar e excluir deixam de depender de uma atualização incidental do sandbox.

## Modificadores de seleção

O HUD mantém disponíveis os quatro modos:

- substituir;
- adicionar;
- remover;
- alternar.

A seleção por área usa o mesmo modo. Fora da edição de malha, atua sobre objetos. Durante uma sessão, atua exclusivamente sobre vértices, arestas ou faces, conforme o modo de componente.

## Catálogo de criação

O grupo de criação é gerado a partir de `geometry.catalog`. Todas as famílias registradas aparecem como ferramentas, inclusive extrusão, tubo e superfície de revolução. O botão escolhido:

1. torna-se a geometria memorizada;
2. reutiliza os últimos parâmetros salvos dessa família;
3. inicia a colocação por clique no viewer.

O valor é sincronizado com os painéis de criação por meio do evento local `spatialseed:geometry-default-changed`.

## Referências espaciais

Quando a seleção contém referências compatíveis, o HUD habilita:

- tubo por objeto-caminho;
- varredura de perfil por caminho;
- distribuição de objetos ao longo do caminho.

Os objetos de referência continuam selecionados pela autoridade normal do editor; o HUD apenas produz comandos públicos.

## Ordenação adaptativa

A ordem dos grupos muda de acordo com o contexto:

- sem seleção: criação primeiro;
- com objetos selecionados: modificadores e ações primeiro;
- em edição de malha: modo, seleção e topologia primeiro;
- durante colocação ou desenho: continuidade e criação primeiro.

A ordenação pode ser desligada nas configurações do HUD.

## Redimensionamento

A alça `↘` ajusta diretamente colunas e linhas. O tamanho continua limitado a 1–12 colunas e 1–8 linhas e é persistido em `localStorage["spatialseed.edit.hud.v1"]`.
