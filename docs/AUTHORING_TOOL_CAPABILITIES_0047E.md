# Fachada canônica de ferramentas — incremento 0047e

## Objetivo

O SpatialSeed possuía capacidades de autoria em fontes diferentes: modos de
interação no estado editorial, ferramentas parametrizadas no
`EditToolRegistry`, operações expostas apenas por comandos e controles ligados
manualmente no HUD e nos painéis. O incremento 0047e estabelece uma porta
canônica sobre as duas primeiras fontes sem copiar seus algoritmos ou criar um
segundo estado.

A fachada é uma camada de compatibilidade transitória. Novas superfícies podem
consultá-la agora; as implementações existentes podem migrar por trás dela em
incrementos posteriores.

## Contrato público

`ToolCapabilityFacade` publica:

```text
list({ context, family, kind, includeUnavailable })
describe(toolId)
status({ toolId, context })
isAvailable(toolId, context)
activate(toolId, options, context)
execute(toolId, input, context)
finish(toolId, options, context)
cancel(toolId, options, context)
getParameters(toolId)
setParameters(toolId, patch)
subscribe(listener)
```

O runtime expõe a mesma porta por comandos e consultas:

```text
authoring.tools.list
authoring.tool.describe
authoring.tool.status
authoring.tool.parameters.get

authoring.tool.activate
authoring.tool.execute
authoring.tool.finish
authoring.tool.cancel
authoring.tool.parameters.set
```

Um descritor `spatial-seed-tool-capability-v1` contém identidade, nome,
família, tipo, lifecycle, contextos, parâmetros, apresentação, operações
suportadas e propriedades como preview, undo, repetição e uso procedural. Ele
é serializável e não contém handler, elemento DOM ou callback.

## Adapters iniciais

### `transform-modes`

Adapta o estado e os comandos existentes de interação:

| ID canônico | Modo atual | Contextos |
| --- | --- | --- |
| `interaction.navigate` | `navigate` | objeto, vértice, aresta, face |
| `selection.select` | `select` | objeto, vértice, aresta, face |
| `transform.translate` | `translate` | objeto, vértice, aresta, face |
| `transform.rotate` | `rotate` | objeto, vértice, aresta, face |
| `transform.scale` | `scale` | objeto, vértice, aresta, face |

Ativar um modo encaminha para `edit.context.tool.set`. Reativar o mesmo ID é
idempotente. A fachada não armazena qual modo está ativo: consulta sempre o
`EditContextController`. Modos suportam `activate`, mas não `execute`: ativar o
gizmo “Mover” não é equivalente a aplicar uma translação numérica.

### `edit-tool-registry`

Adapta as nove definições do registro existente. A definição ambígua
`path.sketch` é projetada como duas intenções explícitas:

| ID canônico | Implementação atual | Preset |
| --- | --- | --- |
| `draw.tube` | `path.sketch` | `mode: tube` |
| `draw.array` | `path.sketch` | `mode: array` |

Os parâmetros condicionados pelo outro modo não aparecem no descritor do
preset. Os dois IDs ainda usam o mesmo `ToolParameterStore`; logo, não existe
uma cópia das preferências. Trocar de preset enquanto o outro está ativo
cancela apenas o controller transitório e inicia o novo modo explicitamente.
Reativar o mesmo modo com parâmetros atualiza o `ToolParameterStore` e o
preview ativo sem alternar a ferramenta para inativa.
Configurar o preset inativo não troca a intenção ativa; o campo legado `mode`
só muda durante uma ativação explícita.

As demais definições conservam seus IDs:

```text
planar.sketch
path.tube
path.sweep
path.array
path.from-selection
mesh.extrude
mesh.inset
mesh.split
```

Operações de malha continuam produzindo exatamente um
`mesh.topology.apply`. O adapter apenas forma `operation` e `options`; o
`MeshEditController`, seu histórico interno e o commit editorial permanecem
autoritativos.

## Posse de estado

A fachada mantém somente o índice imutável de descritores e subscriptions para
invalidação. Uma mudança de parâmetro notifica os consumidores mesmo quando a
atividade da ferramenta não muda; eles consultam novamente a porta canônica.
Ela não mantém:

- documento ou seleção;
- ferramenta ativa;
- parâmetros lembrados;
- preview ou gesto;
- histórico ou transação;
- estado de HUD ou painel.

As autoridades continuam sendo `EditorState`, `EditContextController`,
`ToolLifecycleController`, `ToolParameterStore` e os controllers específicos.
Toda execução é encaminhada ao `CommandRegistry` existente. Um comando
canônico pode envolver um alias transitório, mas apenas o comando interno de
domínio produz a mutação e o item de undo.

## Console

O console passa a consumir a porta canônica:

```text
tool list
tool list face
tool show transform.translate
tool status
tool activate transform.translate
tool activate draw.tube radius=0.12 radialSegments=8
tool activate draw.array sourceMode=catalog geometryType=sphere spacingMode=world spacingWorld=0.5
tool get draw.array
tool set draw.array affineRotateZ=360*u affineScale=0.5+u
tool run mesh.extrude distance=2
tool cancel
```

Os comandos antigos continuam disponíveis somente para preservar as
superfícies ainda não migradas. Código novo deve usar `authoring.tool.*`.

## Limites deliberados

O incremento não reorganiza visualmente o HUD e não adota controles pelo DOM.
Também não adapta ainda:

- providers de criação geométrica;
- operações existentes apenas como comandos;
- seleção, medição e modificadores como capacidades canônicas;
- procedures SES, que continuam recebendo capabilities mínimas e planos;
- designer de HUD ou perfil de layout.

Essas fontes serão incorporadas por adapters explícitos ou por contribuições
nativas. Nenhum adapter futuro poderá inferir ferramenta pela presença de um
botão.

## Condições de remoção dos adapters

Um adapter deixa de existir quando sua fonte passa a publicar nativamente o
mesmo descritor e implementa a mesma porta. A migração deve, no mesmo
incremento:

1. redirecionar todos os consumidores;
2. remover o alias e a tabela de equivalência daquela fonte;
3. conservar os IDs canônicos;
4. provar equivalência de UI, console e execução programática;
5. não acrescentar estado ou transação paralelos.

## Verificação

No perfil diagnóstico:

```text
runtime test tool-capabilities
runtime test tool-parameters
runtime test edit-context
runtime test all
```

O teste específico cobre catálogo serializável, colisões, filtro contextual,
reutilização objeto/malha, presets distintos e idempotentes, parâmetros
condicionais, comando topológico único, instalação no runtime e consumo pelo
console textual.
