# Esboços semânticos e entradas explícitas — incremento 0047g

## Resultado

Geometrias 2D deixam de ser classificadas como caminho ou perfil pelo tipo da
malha usada para desenhá-las. Círculo, retângulo, polígono, polilinha, arco e
segmento conservam um `SketchDescriptor` imutável em coordenadas XY locais.
Espessura, preenchimento e provider renderizado continuam sendo apenas
apresentação.

O contrato `spatial-seed-sketch-v1` pertence ao kernel e pode ser consumido por
documento, autoria e providers sem criar dependências entre essas camadas. Ele
declara:

```js
{
  descriptorVersion: "spatial-seed-sketch-v1",
  plane: "local-xy",
  points: [[0, 0], [1, 0], [0.5, 1]],
  closed: true,
  roles: ["path", "profile", "boundary"],
  primitive: { type: "polygon", sides: 3 },
  source: { toolId: "planar.sketch", mode: "polygon", style: "stroke" }
}
```

`profile` e `boundary` exigem contorno fechado, não degenerado e com ao menos
três pontos. `path` exige dois pontos. O frame do objeto posiciona o esboço no
mundo; mudar a aparência não muda seus papéis.

## Compatibilidade de referências

`SpatialReferenceResolver` consulta primeiro o esboço semântico. Objetos
anteriores ao contrato continuam utilizáveis por adaptação conservadora:

- tubo aberto fornece sua linha central como caminho;
- tubo fechado planar pode fornecer sua linha central como perfil;
- `shape` e `extrude` continuam fornecendo seu contorno declarado;
- superfície aberta continua fornecendo boundary ou arestas soltas.

Quando um esboço semântico existe, um papel ausente não é inferido novamente
da triangulação. Por exemplo, um arco continua sendo caminho — e não perfil —
tanto contornado quanto preenchido.

Uma geometria editada como malha perde um esboço que se tornou obsoleto, em vez
de conservar metadados falsos. Ela ainda pode oferecer extrações derivadas de
sua geometria atual.

Não há interpretação de imagem ou textura como perfil neste incremento. As
fontes são esboços e geometrias vetoriais existentes.

## Operações de feature

Três capacidades imediatas distinguem seleção de entrada de captura por gesto:

| ID | Entradas | Parâmetros principais | Comando autoritativo |
| --- | --- | --- | --- |
| `feature.sweep` | perfil + caminho | segmentos, torção, escalas, caps | `path.sweep.create` |
| `feature.extrude` | perfil | profundidade, passos, curva, bisel | `profile.extrude.create` |
| `feature.revolve` | perfil | segmentos, início e extensão angular | `profile.revolve.create` |

Os presets `draw.sweep`, `draw.extrude` e `draw.revolve` permanecem para criar
uma das entradas pelo gesto. Ambos os fluxos usam o mesmo armazenamento de
parâmetros e os mesmos serviços geométricos. Extrusão de perfil não é
extrusão topológica de faces; os IDs e as entradas são distintos.

## Workspace local da ferramenta

`ToolWorkspaceController` conserva somente apresentação local:

- ferramenta em foco;
- vínculos explícitos de cada slot;
- extração escolhida;
- resolução automática pela seleção atual.

Ele não possui documento, histórico, parâmetros ou estado gestual. Antes de
`activate` ou `execute`, o runtime completa entradas ausentes com referências
compatíveis da seleção. Perfil e caminho distintos são escolhidos sem usar o
mesmo objeto duas vezes automaticamente.

O painel **Ferramenta em foco** mostra fonte, extração e parâmetros antes da
aplicação. O HUD cria os ícones das features a partir do catálogo canônico;
tocá-los foca a operação e abre o painel, sem executá-la prematuramente.
Console, procedures e agentes usam a mesma porta:

```text
tool show feature.sweep
tool set feature.sweep sweepSegments=48 sweepTwistDegrees=30 scaleEnd=0.5
tool run feature.sweep profile={"objectId":"perfil"} path={"objectId":"curva"}

tool set feature.extrude depth=2 bevelEnabled=false
tool run feature.extrude profile={"objectId":"hexagono","extraction":"sketch"}

tool set feature.revolve revolveSegments=48 phiLengthDeg=270
tool run feature.revolve profile={"objectId":"perfil"}
```

## Transição de projeto e erros recuperáveis

Substituir o projeto passa por uma única preparação transitória. Uma sessão de
mesh, desenhos, posicionamento, medição, plano-alvo, foco e vínculos locais são
cancelados antes de `newProject`, `openText` ou recuperação substituir a cena.
Salvar continua exigindo que a edição de mesh seja finalizada.

Falhas de validação, contexto ou operação aparecem como aviso temporário e são
limpas pelo próximo sucesso. A caixa persistente da aplicação fica reservada a
erros marcados explicitamente como fatais. Nenhum erro recuperável deixa a
interface num estado de falha permanente.

## Limites deliberados

Extrude e lathe conservam os descritores paramétricos de seus providers, mas as
referências de perfil/caminho ainda são resolvidas como snapshots. Sweep ainda
publica um descritor buffer. O próximo incremento deverá criar receitas
procedurais vinculadas, avaliação/cache incremental e conversão explícita para
malha sem alterar os contratos de entrada entregues aqui.

Retângulos e arcos continuam usando o protocolo gestual anterior. Protocolos
CAD por fases, projeção de curvas sobre superfícies e restrições gerais do gizmo
permanecem incrementos próprios.

## Verificação

No perfil diagnóstico:

```text
runtime test tool-capabilities
runtime test path-references
runtime test tool-parameters
runtime test planar-authoring
runtime test hud-context
runtime test all
```

Os testes cobrem persistência do esboço, equivalência entre hexágono semântico e
tubo fechado legado, slots resolvidos pela seleção, parâmetros compartilhados,
extrusão/revolução de perfil existente e delegação de transição de projeto
durante edição de mesh.
