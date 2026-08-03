# Autoria por caminho e perfil desenhados — incremento 0047f

## Resultado

O capturador contínuo antes apresentado como um único ícone de spline agora é
projetado pelo catálogo canônico como cinco intenções estáveis:

| ID | Entrada desenhada | Entrada adicional | Resultado |
| --- | --- | --- | --- |
| `draw.tube` | caminho | — | tubo contínuo |
| `draw.array` | caminho | seleção ou provider | distribuição de objetos |
| `draw.sweep` | caminho | perfil selecionado ou informado | extrusão pelo caminho |
| `draw.extrude` | perfil fechado | — | extrusão linear |
| `draw.revolve` | perfil aberto ou fechado | — | revolução em torno do eixo Y do plano |

As cinco capacidades reutilizam `PathSketchController` para ponteiro, plano,
curva, suavização, preview, cancelamento e continuidade. Cada uma possui,
porém, descritor, nome, ícone, entradas e parâmetros próprios. O último modo
lembrado não decide silenciosamente o significado de um único botão.

## Entradas canônicas

O descritor `spatial-seed-tool-capability-v2` inclui `inputs`. Cada entrada
declara ID, papel semântico, fontes aceitas, rótulo e obrigatoriedade. Os papéis
iniciais são `path`, `profile`, `selection`, `boundary` e `point`.

Essa descrição não contém objetos do documento nem callbacks. Ela permite que
HUD, painel, console, procedure ou agente descubram que uma varredura precisa
de caminho e perfil sem conhecer o controller legado. Caminhos e perfis
capturados pelo ponteiro usam a fonte `draw`; listas explícitas usam `points`.

O mesmo contrato também publica a ação
`authoring.tool.parameters.reset`. Restaurar um preset afeta somente os
parâmetros expostos por ele; por exemplo, restaurar `draw.extrude` não apaga o
raio lembrado de `draw.tube`.

## Captura e criação

`PathToolService.prepareSketchOutputPlan()` transforma a captura em um plano
imutável antes de qualquer mutação:

- tubo conserva o plano preparado anterior;
- sweep combina o caminho desenhado com um perfil espacial resolvido;
- extrusão projeta o traço no frame do plano e produz um contorno 2D;
- revolução projeta o perfil no mesmo frame e produz uma geometria `lathe`.

Somente planos emitidos pelo próprio serviço podem ser confirmados. O commit
continua passando por `SelectionOperations.createGeometry`, portanto cada
resultado cria uma única mutação e uma única entrada de undo. Preview e objeto
final usam o mesmo descritor geométrico e o mesmo frame.

O perfil de `draw.sweep` é resolvido na ativação e reutilizado durante todo o
gesto. Isso produz erro antes de desenhar quando o perfil está ausente e evita
reextrair sua topologia a cada `pointermove`. Perfis desenhados para extrusão e
revolução exigem um plano; com alvo de superfície seus descritores ficam
indisponíveis e a ativação também é rejeitada explicitamente.

## Superfícies humanas e procedurais

O HUD constrói o grupo **Autoria por desenho** a partir de
`authoring.tools.list({ family: "draw" })`. Os elementos recebem os IDs
canônicos e seu estado ativo/disponível; não há descoberta de ferramenta pelo
DOM. O grupo pode ser ocultado como parte do perfil visual existente.

O painel genérico de parâmetros também consulta a fachada canônica. Ele mostra
apenas os campos do preset escolhido e usa as mesmas ações de consultar,
alterar e restaurar que o console.

Mover, girar e escalar no HUD e no painel, além de extrude, inset e split de
malha, passam agora pelas ações `authoring.tool.*`. Os controllers e algoritmos
anteriores continuam sendo a autoridade; os aliases antigos permanecem apenas
para os controles ainda não migrados.

Exemplos:

```text
tool show draw.sweep
tool get draw.extrude
tool set draw.extrude depth=2 bevelEnabled=false
tool reset draw.extrude

tool activate draw.tube radius=0.12 radialSegments=8
tool activate draw.array sourceMode=catalog geometryType=sphere spacingMode=world spacingWorld=0.5
tool activate draw.sweep profileObjectId=perfil sweepSegments=48
tool activate draw.extrude depth=2 extrudeSteps=2
tool activate draw.revolve revolveSegments=48 phiLengthDeg=270
tool run draw.extrude points=[[0,0,0],[2,0,0],[2,1,0]] frame={"origin":[0,0,0],"xAxis":[1,0,0],"yAxis":[0,1,0],"normal":[0,0,1]} depth=2
tool cancel
```

`activate` inicia o gesto humano; `run` consome pontos explícitos sem simular
eventos de ponteiro. Uma execução com `points` e `frame` completos não depende
do alvo local do ponteiro. Ambos chegam ao mesmo serviço de plano e commit.

O alias `path draw` aceita os mesmos novos resultados para compatibilidade:

```text
path draw mode=sweep profile=perfil segments=48 twist=30
path draw mode=extrude depth=2 steps=2 bevel=off
path draw mode=revolve segments=48 phiLength=270
```

## Limite explícito do inset de malha

`mesh.inset` não recebe um caminho na implementação atual. Ele contrai cada
triângulo selecionado por um escalar `amount`; não existe ainda um operador de
recorte planar por contorno arbitrário. Por isso seu descritor continua
declarando apenas uma entrada `selection`.

Associar um traço a esse comando sem alterar a topologia produziria uma opção
visual falsa ou um segundo algoritmo incompatível. O suporte correto deverá
entrar como uma fatia própria: projetar um `boundary` desenhado no plano da
região, validar interseções e furos, subdividir a região e então aplicar o
inset/cut em uma única transação. Quando esse operador existir, ele poderá
consumir o mesmo papel `boundary` e o mesmo capturador introduzidos aqui.

## Verificação

No perfil diagnóstico:

```text
runtime test tool-capabilities
runtime test path-references
runtime test hud-context
runtime test all
```

Os testes específicos cobrem descritores e entradas serializáveis, isolamento
dos parâmetros de cada preset, reset seletivo, resolução única do perfil,
extrusão no frame do desenho, revolução, rejeição de planos forjados e aliases
procedurais.
