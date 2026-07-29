# Ciclo persistente de ferramentas e planos independentes — 0038b

## Objetivo

O build `20260727-0038b` corrige dois problemas de fluxo do editor: ações que
precisavam ser reabertas a cada uso e travas de plano que não controlavam de
forma autoritativa a navegação. A solução mantém todo estado transitório no
viewer e preserva a regra de que somente comandos públicos alteram o projeto.

## Ciclo de vida das ferramentas

`ToolLifecycleController` distingue a ferramenta editorial selecionada de uma
ação interativa em curso, como posicionar objetos ou desenhar caminhos. Cada
ação pode ser mantida ativa separadamente. O HUD e o painel expõem a opção
**Manter ferramenta**. A preferência é lembrada por ferramenta em
`localStorage["spatialseed.edit.tools.v2"]`.

O registro `v2` possui versão explícita e usa o identificador semântico da
ferramenta como chave. Quando ele ainda não existe, o controlador importa os
valores booleanos válidos de `spatialseed.edit.tools.v1`, grava o novo registro
e conserva o legado intacto. Uma preferência anterior do usuário, inclusive
`false`, continua sendo respeitada.

Sem `toolId` explícito, a configuração resolve primeiro a ação interativa ativa
e depois a ferramenta editorial corrente. Ela nunca altera simultaneamente
posicionamento e desenho. HUD, workspace e console passam pelo mesmo comando e
somente a sessão correspondente ao alvo recebe a mudança de continuidade.

- `single-shot`: termina depois da execução;
- `sticky`: permanece ativa quando configurada;
- `continuous`: mantém uma sessão e aceita vários gestos.

O desenho livre e o posicionamento de objetos usam o mesmo controlador. `Esc`
cancela a ação em curso sem modificar o histórico.

## Parâmetros lembrados

Continuidade e parâmetros permanecem registros distintos. O
`ToolParameterStore` indexa valores normalizados por `toolId` em
`spatialseed.edit.tool-parameters.v2`. O registro `v1` é migrado sem ser
apagado. Argumentos explícitos prevalecem; campos omitidos recuperam a última
configuração da ferramenta.

O workspace projeta os schemas de `EditToolRegistry` num painel contextual. Os
controles rápidos de caminhos e topologia e o HUD funcionam como aliases da
mesma origem. Alterações válidas feitas durante um desenho ativo atualizam o
preview sem criar comando de documento.

O desenho livre pode confirmar um tubo ou usar a seleção, um grupo ou qualquer
geometria do catálogo como pincel progressivo por espaçamento. Nos dois modos,
a prévia é local e somente o resultado final ocupa uma entrada de undo.
Consulte `PATH_BRUSH_AUTHORING_0039E.md`.

## Repetição

O registro de comandos possui um observador posterior à execução. Comandos
marcados como `repeatable` têm o identificador e argumentos normalizados
copiados para `ToolLifecycleController`. O comando:

```text
edit.command.repeat
```

reexecuta essa operação sobre o contexto atual. Eventos de ponteiro não são
gravados. Repetir não cria recursivamente uma nova entrada de repetição.

Duplicação de objetos é uma especialização desse contrato. O comando
`selection.duplicate` não se torna repetível antes de uma transformação: ele
abre uma sequência e aguarda a matriz delta. Quando a matriz é confirmada, o
ciclo memoriza `selection.repeat`, e HUD, workspace, botão legado e console
passam a executar a mesma repetição afim. A duplicação topológica em modo de
malha continua sendo uma operação repetível normal.

## Posicionamento de objetos no viewer

`ObjectPlacementController` cria uma malha fantasma local e resolve cada posição
pela seguinte ordem:

1. superfície renderizável sob o ponteiro, quando habilitada;
2. plano de edição;
3. plano atual do viewer.

A orientação pode vir do frame do plano, da normal da superfície ou de um
objeto de referência. O clique executa `object.create.geometry`; o material físico é
internado antes da criação e entra no mesmo comando atômico do objeto. Com a ferramenta mantida,
novos cliques continuam criando objetos com os mesmos parâmetros.

## Plano de visualização

O plano de visualização controla a câmera. Quando ativo, o renderer entra em
`plane-2d`:

- órbita desativada;
- alvo projetado no plano;
- câmera mantida perpendicular à normal;
- vetor `up` alinhado ao eixo Y do frame;
- pan limitado ao plano;
- dolly preservado ao longo da normal.

Com point lock simultâneo, o modo é `plane-point`: pan também é desativado e o
ponto permanece no plano.

## Point lock

Sem plano, point lock entra em `orbit-point`: órbita e dolly permanecem ativos,
mas pan é desativado e o alvo permanece no ponto capturado.

## Plano de edição

O plano de edição é independente da câmera. Ele controla:

- posicionamento de novos objetos;
- desenho de caminhos;
- frame `custom-plane` do gizmo e da edição de malha;
- futuras ferramentas planas e snaps.

Pode ser capturado da vista, de uma face, de um objeto ou dos planos mundiais
XY, XZ e YZ. Alterar ou limpar esse plano não modifica a trava de visualização.

## Comandos e consultas

```text
edit.tool.keep.set
edit.tool.parameters.activate
edit.tool.parameters.set
edit.tool.parameters.reset
edit.command.repeat
object.placement.begin
object.placement.cancel
edit.plane.set
edit.plane.clear
edit.navigation.plane.toggle
edit.navigation.point.toggle
```

```text
edit.tool.status
edit.tools.describe
edit.tool.parameters.get
edit.tool.parameters.status
object.placement.status
edit.context.status
```

## Atomicidade

Prévia de criação, plano de edição, modo da câmera e ciclo da ferramenta são
locais ao viewer. Cada clique de criação ou traço concluído produz um comando
editorial normal. Nenhuma posição intermediária entra no documento ou no undo.
