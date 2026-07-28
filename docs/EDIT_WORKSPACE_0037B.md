# Workspace adaptativo e curvas editáveis — build 0037b

O build `20260727-0037b` elimina o painel separado de transformação e o menu
residual **Mais**. Seleção, transformação, topologia, caminhos e precisão do
gizmo passam a usar o mesmo workspace **Editar** e a mesma camada de comandos.

## Interface adaptativa

Com **Mostrar somente ferramentas relevantes ao contexto atual** ativado, o
workspace reduz automaticamente o conteúdo exibido:

- no modo objeto, mostra ações de objeto e criação por caminhos;
- ao selecionar componentes, mostra seleção, topologia e criação de caminho;
- ao mover, girar ou escalar, mostra gizmo, frame, eixos, snap e influência;
- na edição de um caminho, oculta operações de face incompatíveis.

As seções continuam configuráveis. Desativar a adaptação mostra todas as seções
marcadas pelo usuário.

## HUD em grade

O HUD destacável aceita número configurável de colunas e linhas, orientação,
tamanho, opacidade, posição flutuante ou dock superior/inferior. Grupos de
contexto, ferramenta, frame, eixos, snap e travas podem ser ocultados
individualmente. Histórico e aplicar/cancelar aparecem apenas durante uma sessão
de malha.

A posição e o formato são persistidos em:

```text
localStorage["spatialseed.edit.hud.v1"]
```

Painéis, menus da barra e o próprio HUD são reposicionados quando a viewport
muda para que não permaneçam fora da tela.

## Desenho de caminhos

A seção **Caminhos e curvas** permite desenhar diretamente no viewer sobre:

- o plano de navegação travado;
- o plano atual do viewer;
- os planos mundiais XY, XZ ou YZ.

O traço é amostrado em pixels, projetado no plano, simplificado por
Ramer–Douglas–Peucker e opcionalmente suavizado por Chaikin. O resultado pode
ser uma polilinha, uma spline Catmull–Rom ou uma curva Bézier cúbica ajustada.

## Bézier e seleção de componentes

Uma curva Bézier aberta usa a sequência `3n+1` de pontos:

```text
âncora, controle de saída, controle de entrada, próxima âncora, ...
```

O botão **Editar pontos e alças** abre esses controles como vértices ligados por
arestas auxiliares. O commit preserva o objeto como `tube` e não o converte em
uma malha triangular genérica.

Durante a edição de uma malha, **Criar caminho da seleção** aceita:

- vértices, ordenados pela cadeia induzida ou por proximidade determinística;
- uma cadeia ou loop de arestas;
- o contorno da região de faces selecionadas.

O novo caminho é um objeto independente; a sessão de malha permanece ativa.
