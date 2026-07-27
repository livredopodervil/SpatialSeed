# Edição de malha por vértices — build 0033a

O build 0033a acrescenta uma sessão local de edição de malha. A sessão isola um único objeto, mostra seus vértices reais, permite selecionar e transformar somente esses vértices e publica a alteração como uma única operação atômica quando o usuário pressiona **Aplicar**.

## Invariantes

Durante a sessão:

- exatamente um objeto é a malha ativa;
- somente os vértices dessa malha podem ser selecionados pelo toque, clique ou seleção por área;
- a instância original é ocultada somente neste viewer e substituída por uma cópia visual independente;
- nenhum arrasto do gizmo altera o sandbox, o histórico ou outros viewers;
- seleção de outros objetos, criação, exclusão, propriedades, undo, redo, abertura e salvamento do projeto ficam bloqueados;
- **Aplicar** executa um único comando `object.geometry.replace`;
- **Cancelar** remove a prévia sem produzir comando persistente.

A geometria paramétrica original é convertida para um descritor `type: "buffer"` apenas quando o commit contém uma alteração geométrica real. Aplicar uma sessão sem mudança é um no-op e preserva a família paramétrica. Até o commit, a conversão pertence somente à sessão transitória.

## Painel

Abra **Editar → Editar malha**. Selecione exatamente um objeto e pressione **Editar seleção**.

O painel oferece:

- selecionar todos, nenhum ou inverter a seleção de vértices;
- mover juntos os registros de vértice coincidentes, útil para costuras de UV e normais duras;
- impedir, no toque ou clique pontual, a seleção de vértices ocluídos;
- referenciais **Mundo**, **Objeto** e **Travar plano do viewer**;
- transformações numéricas de translação, rotação e escala;
- **Aplicar** e **Cancelar**.

Ao entrar, o editor muda para a ferramenta de seleção. As ferramentas **Mover**, **Girar** e **Escalar** passam a operar sobre o centróide mundial dos vértices selecionados.

## Referenciais

### Mundo

Os eixos do gizmo coincidem com os eixos mundiais.

### Objeto

Os eixos acompanham a orientação mundial do objeto. O frame é obtido pela composição, da raiz até o objeto, dos quaternions locais persistentes. Escala não uniforme e cisalhamento induzido pela hierarquia não contaminam a orientação, porque não se tenta decompor a matriz mundial para recuperar uma rotação que o modelo já armazena explicitamente.

### Viewer travado

Ao pressionar **Travar plano do viewer**, o quaternion da câmera é capturado naquele instante e permanece congelado, mesmo que a câmera seja movida depois.

- `X` é a direita da tela;
- `Y` é o alto da tela;
- `Z` é a normal ao plano da tela, positiva em direção ao observador.

O botão não projeta a transformação para duas dimensões: o eixo `Z` continua disponível para deslocamento normal ao plano. Ele fixa o frame tridimensional do viewer para que gizmo e comandos numéricos usem exatamente a mesma base.

## Matemática da transformação

Considere um vértice local homogêneo `p_l`, a matriz mundial do objeto `M`, o pivô mundial dos vértices selecionados `c_w` e a rotação do referencial ativo `R_f`. A operação afim escrita no referencial ativo é `A_f`. A transformação mundial aplicada ao conjunto selecionado é:

`D_w = T(c_w) R_f A_f R_f⁻¹ T(-c_w)`.

Aqui, `T(c_w)` é a translação para o pivô e `R_f⁻¹` é a inversa da rotação do frame. O novo vértice precisa voltar ao espaço local da malha:

`p_l' = M⁻¹ D_w M p_l`.

Essa conjugação é a parte central da implementação. Ela mantém o gizmo e os comandos numéricos coerentes mesmo quando o objeto possui translação, rotação, escala não uniforme ou cisalhamento herdado. A matriz mundial precisa ser invertível; objetos com escala degenerada são recusados. A geometria compartilhada e cacheada nunca é modificada diretamente.

Para translação, um vetor `d_f` informado pelo usuário é convertido por `d_w = R_f d_f`, e então aplicado no espaço mundial antes de voltar pelo inverso de `M`.

O pivô é a média aritmética das posições mundiais dos vértices selecionados. Para `n` vértices, `c_w = (1/n) Σ M p_i`.

## Gizmo

O `TransformControls` é anexado a uma âncora transitória situada em `c_w`. A âncora recebe o quaternion do referencial ativo e o controle opera em modo local. Durante o arrasto, a matriz delta é calculada por:

`D_w = G_atual G_inicial⁻¹`,

onde `G_inicial` e `G_atual` são as matrizes da âncora. O mesmo método `M⁻¹ D_w M` usado pelos comandos numéricos transforma os vértices. Portanto, gizmo e console não possuem duas matemáticas concorrentes.

Snaps de movimento, rotação e escala continuam usando a configuração geral do gizmo. Quando **travar na grade** está ativo, o pivô é convertido para coordenadas do frame, arredondado pelo passo e transformado novamente para o mundo. Assim, no frame do viewer, a grade também acompanha direita, alto e normal da tela.

A prévia reutiliza um buffer de posições da própria sessão. Em cada quadro, somente os registros selecionados são reescritos nos atributos de posição da superfície e dos marcadores; normais e limites são recalculados apenas no fim do arrasto. A prévia não envia cópias integrais da malha ao controller a cada evento.

## Seleção e oclusão

Cada vértice real da `BufferGeometry` é projetado pela câmera para pixels. O toque escolhe o candidato mais próximo dentro de um raio de 22 pixels; o mouse usa 12 pixels. Isso mantém a precisão independente da distância da câmera e da escala do objeto.

Com oclusão ativa, apenas os poucos candidatos próximos ao ponteiro recebem um teste de visibilidade. Um raio é lançado da câmera até cada candidato; se a superfície da própria malha for atingida antes do vértice, ele não pode ser selecionado. Essa estratégia evita um raycast para todos os vértices a cada toque.

A seleção por área percorre exclusivamente os vértices projetados da malha ativa; por decisão de desempenho, ela não lança um raio de oclusão por vértice. Nenhum outro objeto da cena participa do teste enquanto a sessão estiver aberta.

## Registros coincidentes

Uma `BufferGeometry` pode conter vários registros na mesma posição para representar costuras de UV ou normais diferentes. A opção **Mover vértices coincidentes juntos** agrupa posições dentro de tolerância `10⁻⁶` e expande a seleção para todos os registros do grupo. Os grupos são recalculados após cada transformação confirmada na sessão, evitando que vértices já separados continuem ligados por uma classificação antiga.

## Console e API pública

```text
mesh enter
mesh status
mesh select all|none|invert
mesh frame world|local|viewer
mesh weld on|off
mesh occlusion on|off
mesh affine move|rotate|scale x y z
mesh apply
mesh cancel
```

Os comandos editoriais comuns são redirecionados durante a sessão:

```text
position x y z
move dx dy dz
rotate xDeg yDeg zDeg
scale sx sy sz
clear
```

Exemplo:

```text
mesh enter
mesh select all
mesh frame viewer
move 2 0 0
rotate 0 0 15
scale 1.2 1 1
mesh apply
```

A API pública equivalente é:

```js
runtime.execute("mesh.edit.enter");
runtime.execute("mesh.frame.set", { mode: "viewer" });
runtime.execute("selection.translate", { delta: [2, 0, 0] });
runtime.execute("mesh.edit.commit");
```

Consulta:

```js
runtime.query("mesh.edit.status");
```

## Concorrência e segurança editorial

A sessão registra a revisão, a geometria e a matriz mundial do objeto ao começar. Revisões externas que alteram somente outros objetos, nomes ou materiais compatíveis são incorporadas e a revisão-base avança. A sessão se torna obsoleta apenas quando a geometria ativa ou sua matriz mundial diverge; nesse caso, o commit é recusado para evitar sobrescrever uma edição recebida de outro viewer.

A entrada também é recusada enquanto o objeto participa de uma animação efêmera, de uma transformação compartilhada ou de outro arrasto local. Isso evita capturar uma matriz visual temporária como se fosse a transformação persistente do objeto.

O commit normaliza novamente o descritor, descarta normais antigas e permite que o provider `buffer` recalcule as normais da nova malha. O histórico recebe somente uma entrada, independentemente da quantidade de arrastos e comandos aplicados durante a prévia.

## Limitações deliberadas

Este build edita registros de vértice de `BufferGeometry`, não uma topologia half-edge. Ainda não existem:

- edição de arestas ou faces;
- extrusão, inset, bevel, knife ou loop cut;
- soldagem topológica destrutiva;
- UV editor;
- modificadores não destrutivos;
- assets de malha compartilhados por conteúdo.

Uma esfera ou caixa pode possuir registros coincidentes por causa de UVs e normais. A opção de coincidência preserva o comportamento visual esperado, mas não transforma esses registros em um único vértice topológico.

## Arquivos principais

```text
packages/mesh-editor-core/src/MeshEditMath.js
packages/mesh-editor-core/src/MeshEditController.js
packages/mesh-edit-panel/src/MeshEditPanel.js
packages/renderer-three/src/ThreeRegionRenderer.js
packages/editor-commands/src/EditorCommands.js
packages/region-box/src/reducer.js
apps/web/bootstrap/createWebRuntime.js
apps/web/bootstrap/bindWebInterface.js
```
## Roteiro visual manual

1. Crie uma caixa, selecione-a e abra **Editar → Editar malha**.
2. Entre na edição e confirme que clicar em qualquer outro objeto não altera a seleção; somente marcadores da caixa respondem.
3. Selecione um único canto, ative **Mover** e arraste X, Y e Z nos frames Mundo e Objeto.
4. Posicione a câmera obliquamente, pressione **Travar plano do viewer** e confirme que X segue a direita da tela, Y o alto da tela e Z a normal. Mova a câmera sem destravar e confirme que os eixos permanecem congelados.
5. Execute no console `move 1 0 0`, `rotate 0 0 15` e `scale 1.2 1 1`; compare com os mesmos deslocamentos pelo gizmo.
6. Ative a seleção por área e confirme que somente vértices da malha ativa entram na seleção.
7. Pressione **Cancelar** e confirme restauração integral. Repita, pressione **Aplicar** e confirme uma única entrada de desfazer.
8. Com uma animação ativa sobre o objeto, confirme que a entrada na edição é recusada até a animação terminar.


## Correção 0033b — entrada visual e painel móvel

O comando **Editar → Editar malha** agora abre o painel e inicia imediatamente a edição quando existe exatamente um objeto editável selecionado. O painel possui posicionamento fixo próprio, adaptação para telas móveis e apresenta **Travar plano do viewer** próximo ao topo. Os marcadores de vértices permanecem visíveis através da superfície; a opção de oclusão afeta apenas a possibilidade de selecionar um vértice encoberto. A sessão inicia no gizmo de translação para deixar o modo ativo perceptível.
