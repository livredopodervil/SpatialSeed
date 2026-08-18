# PARTE III - REFERÊNCIA TÉCNICA

## 1 - Escopo e autoridade

Esta referência descreve as fronteiras públicas observáveis no snapshot de 18
de agosto de 2026. Ela não congela toda assinatura interna. Para listas
exaustivas, consulte registros e ajuda do build carregado.

Ordem de autoridade:

1. código e testes da árvore;
2. `apps/web/build-info.json`;
3. `help`, `runtime test help`, registros de geometria, propriedade e
   ferramentas;
4. esta referência;
5. documentos de marco.

O snapshot documentado contém as alterações de 18 de agosto validadas pelos
gates locais e identificadas como build `20260818-0054my`. Commit, árvore e
branch devem ser consultados no checkout; não são constantes deste documento.

## 2 - Modelo de maturidade

| Categoria | Critério |
| --- | --- |
| Implementado | módulo ou fluxo presente no snapshot |
| Testado | coberto por gate, suíte do runtime ou roteiro confirmado |
| Em consolidação | contrato público existente, ainda sujeito a refinamento |
| Decidido | invariante registrada em `docs/project/DECISIONS.md` |
| Pretendido | direção sem implementação suficiente para uso |

Contagens de testes e hashes pertencem ao build e ao Git. Não devem ser
copiados como constantes em documentos vivos.

## 3 - Camadas de estado

### Região

A região representa o estado lógico aceito. Ela não conhece DOM, Three.js,
gizmos ou movimentos intermediários do ponteiro.

### Sandbox

O sandbox mantém uma réplica editorial, aplica comandos validados, controla
revisão e histórico de undo/redo. Recuperação local preserva checkpoint e
journal de comandos confirmados.

### Editor

O editor mantém seleção, pivô, contexto de ferramenta, sessão de malha e
previews. Esses estados não pertencem ao documento salvo.

### Viewer

O viewer mantém câmera de navegação, apresentação, painéis, renderização,
animação efêmera e simulação jogável. Objetos câmera persistentes são entidades
do documento; ativá-los como vista é local ao viewer.

### Renderer

O renderer projeta estado e overlays. Three.js, `Object3D`, materiais e lotes
são recursos de projeção. Identidade lógica não pode depender do endereço de um
objeto Three.js.

## 4 - Fluxo de uma mutação

Uma mutação persistente segue, conceitualmente:

```text
intenção de interface
  -> comando público
  -> validação e resolução de alvos
  -> reducer ou serviço de domínio
  -> delta/snapshot do sandbox
  -> projeção incremental
```

Previews interrompem esse fluxo antes da publicação. Programas e experimentos
produzem planos revisáveis; só o commit do plano publica comandos.

## 5 - Comandos, queries e eventos

### Comando

Solicita mudança de estado. Deve validar argumentos e autoridade antes da
primeira mutação. Exemplos: `selection.translate`, `project.new`,
`mesh.edit.commit`, `game.start`.

### Query

Lê estado ou descreve capabilities sem mutar. Exemplos: `game.status`,
`authoring.tool.describe`, `mesh.exchange.formats`, `runtime.resources`.

### Evento

Relata algo ocorrido e permite reação desacoplada. Eventos de jogo como
`game.start`, `character.jump` e `character.land` podem acionar áudio ou ações.
Um evento não deve se transformar silenciosamente em segunda autoridade do
documento.

### Registro

Registros fornecem descritores de geometria, propriedade, ferramenta, ação e
experimento. A interface deve consultá-los, não manter listas concorrentes.

`CommandPalette` consulta `UiActionRegistry.describe()` e
`runtime.capabilities().commands`. Ações já registradas são executadas pela
mesma superfície; comandos sem ação equivalente são apenas encaminhados ao
Console, evitando execução implícita sem parâmetros.

`ResourceSearchIndex` é uma query sem autoridade editorial. Ele indexa nomes,
IDs, tipos, visibilidade e caminhos de objetos, além de descritores compactos
de assets. `AssetStore.listDescriptors()` omite deliberadamente o campo
`value`; assim, texturas Base64 não são clonadas nem publicadas nos resultados.
A interface consulta `resource.search`; selecionar um objeto reutiliza
`selection.select-object`. O Console oferece `resource search`, `resource
select` e `resource status` sobre as mesmas superfícies.

### Bindings de interação

`spatialseed-interactions-v1` descreve dados JSON portáteis no estado da cena:

```json
{
  "version": "spatialseed-interactions-v1",
  "bindings": [{
    "id": "start-spin",
    "event": "app.start",
    "objectId": "object-a",
    "enabled": true,
    "actions": [{
      "type": "command",
      "command": "animation.preset",
      "args": {"id": "spin", "targetIds": ["$self"], "targetMode": "objects"}
    }]
  }]
}
```

`InteractionRuntime` combina bindings das fontes `system`, `document` e
`session`. Ele não conhece DOM, renderer, seleção ou formato de arquivo. Antes
de executar, resolve `$self`, `$event.type` e `$event.objectId`; eventos com
`objectId` alcançam somente o proprietário correspondente. Uma proteção de
reentrada impede o mesmo binding de executar recursivamente enquanto ainda está
ativo e publica a contagem `cyclesPrevented` no status.

`SelectionInteractionService` resolve o único objeto selecionado, valida o
catálogo e publica `interaction.bindings.set`. Ações não são strings de código:
somente comandos cujo descritor contém `metadata.interactionAction` entram no
catálogo e a autorização é verificada novamente na execução. Parâmetros
desconhecidos são rejeitados; valores devem ser finitos, acíclicos e compostos
somente por dados JSON portáteis.

Adapters históricos como `audio.music`, `procedure` e `character.animation`
continuam aceitos apenas em fontes internas ou transitórias do runtime. O
validador do documento rejeita qualquer ação persistente diferente de
`command`, impedindo que um arquivo importado contorne a allowlist.

Eventos publicados inicialmente: `app.start`, `game.start`, `game.stop`,
`character.jump`, `character.land` e `character.respawn`. Ações iniciais:
`game.start`, `game.stop`, `game.respawn`, `game.audio.music.play`,
`game.audio.music.stop`, `game.audio.effect.play`, `animation.preset` e
`animation.stop`.

Superfícies públicas:

```text
selection.interactions.add
selection.interactions.remove
selection.interactions.enabled.set
interaction.event.emit
interaction.catalog.describe
selection.interactions.inspect
interaction.status
```

O `InteractionComposer` consulta essas superfícies no Inspector; o Console usa
`interaction list|catalog|add|remove|enable|disable|emit|status`. Nenhuma das
duas superfícies grava diretamente no objeto ou mantém lista concorrente.

## 6 - Famílias principais de comandos

A tabela é um mapa de navegação, não uma enumeração exaustiva.

| Domínio | Prefixos e exemplos |
| --- | --- |
| Projeto | `project.new`, `project.open`, `project.save`, `project.inspect` |
| Histórico | `history.undo`, `history.redo`, `history.status` |
| Seleção | `selection.*`, `selection.gesture.*`, `selection.snapshot` |
| Transformação | `selection.translate`, `selection.rotate`, `selection.scale`, `pivot.*`, `snap.set` |
| Criação | `object.create.*`, `object.placement.*`, `light.create` |
| Aparência | `appearance.*`, `resource.property.set` |
| Propriedades | `properties.describe`, `selection.properties.*` |
| Recursos | `resource.search`, `resource.search.status`, `resource search`, `resource select` |
| Interações | `selection.interactions.*`, `interaction.event.emit`, `interaction.*` |
| Autoria | `authoring.tool.*`, `authoring.plane.*` |
| Contexto de edição | `edit.context.*`, `edit.tool.*`, `drawing.target.*` |
| Planar | `planar.*`, `measurement.*` |
| Caminhos | `path.*`, `profile.extrude.create`, `profile.revolve.create` |
| Malha | `mesh.edit.*`, `mesh.tool.*`, `mesh.topology.*`, `mesh.path.*` |
| Intercâmbio | `mesh.import.stl`, `mesh.export.stl`, `mesh.exchange.formats` |
| Animação | `animation.*`, `time.*` |
| Personagem | `character.animation.*` |
| Jogo | `game.*`, `game.audio.*`, `game.events.*` |
| Câmera | `viewer.camera.*`, `camera.object.*` |
| Viewers | `viewer.instance.*`, `viewer.sessions.*`, `viewer.project.*` |
| Runtime | `runtime.status`, `runtime.resources`, `runtime.test.*`, `runtime.performance` |
| Procedural | `program.plan.commit`, `procedure.plan.prepare`, `experiment.*` |

## 7 - Fachada de autoria

`authoring.tool.*` converge HUD, workspace, console e futuras automações sobre
capacidades existentes. Ela não mantém documento ou histórico paralelos.

Operações importantes:

```text
authoring.tools.list
authoring.tool.describe
authoring.tool.status
authoring.tool.activate
authoring.tool.parameters.get
authoring.tool.parameters.set
authoring.tool.parameters.reset
authoring.tool.input.bind
authoring.tool.input.use-selection
authoring.tool.execute
authoring.tool.cancel
```

Uma ferramenta declara identidade estável, contextos aceitos, parâmetros,
entradas e ciclo. Adapters legados encaminham para controllers atuais.

### Clipboard de propriedades

`SelectionPropertyClipboard` armazena, na sessão, valores acompanhados pelos
IDs estáveis do `PropertyRegistry`. `PropertyTransferPresetCatalog` descreve
presets serializáveis e aceita registros adicionais sem mudar o clipboard. Os
presets padrão separam transformação segura, posição absoluta, material,
textura, binding de cor e cor própria da instância.

`selection.properties.copyPreset` e `selection.properties.copy` apenas capturam
valores. A query `selection.properties.clipboard.preview` resolve o destino e
publica valor de origem, valor atual, compatibilidade e mudança para cada ID.
`selection.properties.paste` exige a lista explícita de IDs confirmados, filtra
`writable`, `editableMany` e suporte e então delega uma única mutação a
`SelectionPropertyService.setSelection`.

As propriedades `appearance.color`, `appearance.colorMode`,
`appearance.uniformColor`, `appearance.tint`, `instance.color` e a propriedade
derivada somente leitura `appearance.effectiveColor` tornam observáveis as
camadas que o HUD já compunha. Mudanças no binding entram no mesmo patch
editorial e no mesmo item de undo/redo que material e transformação.

Superfícies de console correspondentes: `property presets`, `property copy`,
`property clipboard`, `property paste` e `property clear`.

Valores textuais com esquema `data:` permanecem no clipboard tipado, mas sua
projeção visual usa um resumo de MIME type e tamanho. Essa regra é somente de
apresentação: não cria outra representação persistente nem altera o valor
aplicado.

## 8 - Documento, projeto e arquivos

### Projeto `.spatialseed`

O arquivo transporta estado lógico e metadados do projeto. Estado transitório
do viewer não deve ser serializado como parte do mundo.

`scene.interactions` é estado lógico opcional e versionado. O validador o
normaliza; o serializer preserva o shell da cena; o reducer produz um único
delta `interaction-bindings-changed`, portanto adicionar, remover ou ativar uma
ligação participa de salvar/abrir, recuperação e undo/redo. Bindings cujo objeto
não existe permanecem observáveis no documento, mas são filtrados da execução.

Separações obrigatórias:

- documento não é seleção;
- documento não é câmera de navegação;
- documento não é preview;
- documento não é sessão física;
- arquivo não é recuperação local;
- PWA não é armazenamento do projeto.

### Ordem de recuperação e lançamento do demo

`startApplication` aguarda `interfaceBinding.ready` antes de considerar o
lançamento automático do demo. A política
`shouldStartDefaultDemoAfterRecovery` permite o fallback em estados sem projeto
persistente (`empty`, `unavailable`, `error` e `discarded`) e o bloqueia após
`continued`, `restored-clean` ou `viewer-replica`. Assim, um checkpoint ou
journal recuperado sempre vence o demo e reabre em autoria. O modo jogo continua
local e efêmero.

### Procedimentos

Bibliotecas de procedimentos usam um documento próprio, com schema
`spatial-seed-procedure-library-v1`. Importar fonte não executa código.

### STL

`mesh-exchange` implementa codec e serviço independentes de DOM e Three.js.
`mesh-exchange-three` materializa a superfície final e aplica matriz mundial.
`BrowserAssetFileGateway` realiza transporte no navegador.

STL ASCII e binário são aceitos. O descritor canônico de entrada é `buffer`.
STL não preserva materiais, UV, hierarquia, animação ou unidades.

### GLB/glTF de personagem

O fluxo atual usa GLB/glTF como fonte visual animada do personagem, separado do
proxy físico. Isso não equivale a um importador geral rico de projeto glTF.
O runtime mantém `visualYaw`/`facingYaw` como intenção visual e `yaw` como
orientação efetivamente aceita pelo proxy OBB. A projeção da malha usa a
primeira; colisão, bounds e depuração usam a segunda.

## 9 - Geometria e recursos

### GeometryRegistry

Geometrias entram por providers descritivos. O registry normaliza parâmetros e
permite que criação, renderer, console e scripts compartilhem famílias.

Os mesmos descritores alimentam o `PropertyRegistry` sob IDs estáveis no formato
`geometry.<tipo>.<parâmetro>`. O Inspector e o Console não reimplementam as
regras do provider: a escrita recompõe e normaliza o descritor geométrico antes
do único comando persistente. Metadados de faixa, passo, unidade, integralidade
e valores enumerados permanecem no contrato descritivo.

### Recursos compartilhados

Geometrias, materiais e texturas equivalentes permanecem compartilhados
enquanto a semântica permitir. Identidade lógica é preservada mesmo quando a
projeção usa `THREE.InstancedMesh`.

### Ocorrências e hierarquia

Definições compartilhadas podem produzir ocorrências resolvidas. Transformação
efetiva combina base canônica, hierarquia, animação e preview por precedência.
Grupos preservam transformações locais. Expandir grupos em alvos renderizáveis
é escolha explícita.

## 10 - Seleção e transformação

### Seleção

O snapshot de seleção contém membros e membro ativo. Operações de substituir,
adicionar, remover e alternar são distintas. Gestos de área capturam geometria
de tela e resolvem alvos atomicamente.

### Pivô

O pivô é estado editorial. Alterá-lo não muda a transformação canônica do
objeto até que uma operação use esse pivô.

### Preview hierárquico

Previews são camadas transitórias. A projeção deve compor grupos aninhados e
ocorrências sem gravar matrizes intermediárias. O commit produz no máximo um
comando persistente por gesto.

### Escala e espelho

Escala pode atravessar o pivô e produzir espelhamento. Implementações devem
evitar uma matriz singular no cruzamento e preservar orientação/topologia
conforme o contrato da operação.

## 11 - Planos, esboços e caminhos

### Plano ativo

`authoring.plane.*` e adapters de compatibilidade resolvem uma única base ativa
para criação, desenho, medição e gestos de malha. A trava de câmera 2D é outro
estado.

### Esboço semântico

Formas 2D preservam intenção geométrica independente da malha de visualização.
Perfis, caminhos e eixos são papéis explícitos de entrada.

### PathReference

Referências espaciais são snapshots tipados. Tubo, sweep e array consomem a
mesma abstração. Modificadores vinculados com regeneração automática ainda são
pretendidos.

### Pincel incremental

O pincel por caminho prepara objetos conforme a distância acumulada, conserva
prefixo estável e confirma o lote numa operação. `u` é derivado de distância,
não da quantidade final desconhecida durante o gesto.

## 12 - Edição de malha

### Sessão

`MeshEditController` mantém uma malha de trabalho e histórico interno. Entrar
captura o alvo; aplicar substitui a geometria numa mutação editorial; cancelar
descarta.

### Topologia

O núcleo usa representação de meia-aresta transitória para conectividade e
converte para descritor persistente no commit. Operações topológicas não devem
editar diretamente buffers do renderer.

### Álgebra de operadores

`mesh-operator-kernel` descreve domínio, componentes aceitos, invariantes,
interação e categorias produzidas. A extrusão por caminho compõe segmentos da
polilinha local.

### Preview

`previewTopology()` parte sempre do snapshot-base. `commitTopologyPreview()`
registra o resultado; `cancelTopologyPreview()` restaura a base. Isso evita
acúmulo por `pointermove`.

### Estado de consolidação

Operadores básicos estão implementados. IDs topológicos universais, atributos
por canto, knife completo, booleanas robustas e backend BVH geral ainda estão
em consolidação ou horizonte.

## 13 - Runtime procedural

### Linguagem afim

O parser produz AST restrita e determinística. Operadores incluem `+`, `-`,
`*`, `/`, `%` e potência. Funções matemáticas são explicitamente permitidas.
Não há acesso arbitrário a propriedades ou chamadas livres.

Contexto comum:

| Símbolo | Significado |
| --- | --- |
| `i` | índice começando em 1 |
| `u` | parâmetro normalizado |
| `count` | quantidade total |
| `t` | tempo da simulação quando fornecido |
| `dt` | passo temporal |
| `x,y,z` | posição corrente |
| `sx,sy,sz` | escala corrente |

### Worker + SES

`calc` e `program` usam um Worker com capabilities mínimas. O backend rejeita
Promise, resultados não clonáveis, excesso de saída, timeout e planos acima do
limite. O threat model ainda não autoriza tratar qualquer plugin hostil como
seguro em produção.

### Planos

Programas recebem `spatial` quando autorizados e produzem intenções. O plano é
revisado e validado contra a revisão atual. Commit é atômico; discard não tem
efeito.

## 14 - Tempo e animação

### TemporalAnimationRuntime

É a superfície recomendada para novas integrações. Consome runtime temporal,
domínios e superfície de projeção. Operações podem pertencer a domínios com
taxa, pausa, seek, dependências e demanda de frame.

### AnimationRuntime legado

Permanece exportado para compatibilidade e regressão, marcado como obsoleto.
Não deve ser escolhido por novas integrações.

### Overlay

Animação efêmera compõe matriz e aparência sobre a projeção. Definição e época
podem ser compartilhadas entre viewers locais; matrizes por quadro não são
transportadas.

### Rebase

Uma edição canônica pode exigir rebase de uma animação relativa para preservar
continuidade visual. A precedência entre base, animação e preview deve ser
única e testável.

## 15 - Runtime de jogo

### GameRuntime

É um orquestrador local do viewer. Controla sessão, frame demand, física,
câmera, overlays, eventos e restauração. Regras específicas devem crescer em
serviços ou procedimentos, não dentro de um monólito.

### CharacterBodyFrame

Autoridade física do personagem. Armazena `centerOffset`, `halfExtents` e
`baseYaw` em espaço local. A OBB orientada participa da narrow phase; sua AABB
conservadora serve apenas à busca ampla e a contratos legados.

### Visual

O visual animado não é filho escalável do proxy físico. Uma raiz transitória de
pose sincroniza posição e rotação; escala visual pertence à configuração do
asset. Malhas importadas emitem e recebem sombras pelo pipeline configurável do
viewer. `sourceMode` aceita `default`, `custom` e `original`.

### Entrada

O snapshot normaliza `forward`, `strafe`, `sprint`, `jump` e deltas de look.
`normalizeGameDirectionalInput()` converte deslocamento radial em dois eixos
contínuos, com zona morta central e intensidade preservada. Ponteiros mantêm
estados separados e são combinados. A referência de movimento pode ser
`camera` ou `world`.

### Colisão

O `CollisionWorld` é independente de Three.js. Recebe formas numéricas:

- `local-box`;
- `sphere`;
- `triangle-mesh`.

Broad phase localiza candidatos com envelopes AABB. A narrow phase compara a
OBB orientada do personagem com a forma normalizada. A câmera e as sondas de
solo usam `castCollisionSegment()`, que também retorna a normal da superfície.

`CharacterPhysics` conserva um solver cinemático barato: separação por eixos
para deslizamento tangencial, tentativa limitada de subida, sondas sob a base
para aderência a rampas e limite angular para superfícies transitáveis. Esse
contrato não introduz corpos rígidos nem estado físico persistente.

`CharacterPhysics` publica telemetria efêmera de `support`, `blocked` e
`penetration`, com ID do colisor, ponto e normal. Apoio em superfície preserva a
normal geométrica; bloqueios por eixo ainda usam normal axial. Essa telemetria não
participa da decisão física. `GameCollisionDebugOverlay` a projeta junto das
formas de colisão, limita o mundo aos colisores mais próximos e reutiliza os
marcadores de contato entre frames.

### Mundo cinemático revisionado

`CollisionWorld` v4 associa cada forma a `ownerId`, identidade lógica do objeto
que a produz. A base estática continua sendo uma lista normalizada de números;
Three.js não atravessa essa fronteira.

Quando há alvos de animação ativos, `ThreeRegionRenderer` oferece
`readGameKinematicCollisionFrame(characterId, { sinceRevision })`. Revisão igual
retorna `changed: false` sem reprojetar a cena. Uma revisão nova contém somente:

```text
revision
activeOwnerIds[]
colliders[]
```

`mergeKinematicCollisionWorld()` substitui na base apenas os proprietários
ativos. Antes de avançar o relógio de passo fixo,
`applyKinematicSupportMotion()` localiza `supportColliderId`, calcula
`nextMatrix * inverse(previousMatrix)` e aplica esse delta à posição do
personagem. O body permanece vertical; apenas o yaw horizontal do apoio é
herdado. Velocidade e `distanceTravelled` não recebem o deslocamento da
plataforma.

`game status` publica `supportColliderId`, `kinematics.revision`,
`kinematics.activeOwnerIds`, `kinematics.activeColliderCount` e métricas
`kinematicRefreshes`, `platformCarries`, `lastKinematicRefreshMs` e
`maximumKinematicRefreshMs`. Esses valores são diagnóstico efêmero.

O contrato cobre sólidos cinemáticos e plataformas de apoio. Não inclui massa,
impulso, torque, corpos empurráveis, pilhas, joints nem eventos de trigger. Um
backend dinâmico futuro deve consumir as mesmas formas e o mesmo passo fixo sem
converter estado por frame em documento.

### Áudio e eventos

`GameEventRuntime` conserva a fachada pública de compatibilidade sobre o
`InteractionRuntime` genérico. Bindings internos de áudio ocupam a fonte
`system`; o documento ocupa `document`; reconfigurações transitórias usam
`session`, sem apagar as demais. `GameAudioRuntime` mantém música e efeitos
substituíveis. Política de autoplay pertence à camada web.

### Efemeridade

Posição física, velocidade, câmera de jogo e binding de clip não são gravados no
documento. Parar libera frame demand e restaura apresentação autoral.

## 16 - PWA e build

### Fonte de build

`apps/web/build-info.json` contém `version`, `build` e `channel`. O bootstrap lê
esse arquivo com `cache: no-store`.

### Cadeia de cache

Imports usam query `?build=...` para separar módulos entre versões. O service
worker também recebe o build na URL. `precache-manifest.json` lista recursos
estáticos e hashes.

Uma promoção deve:

1. escolher identificador único;
2. atualizar manifesto e fronteiras de importação necessárias;
3. regenerar precache;
4. executar gate PWA;
5. testar atualização com controlador antigo;
6. confirmar status publicado/controlador na UI.

### Estado PWA

`registerPwa()` publica:

```text
supported
registered
publishedBuild
controllerBuild
activeBuild
waitingBuild
installingBuild
updatePending
scope
error
```

`updateNow()` verifica atualização, procura worker com build publicado, envia
`SKIP_WAITING`, aguarda mudança do controlador e recarrega.

## 17 - Viewers e coordenação local

Viewers na mesma origem usam identidade de sandbox e `BroadcastChannel`.
Autoridade local publica snapshots; réplicas enviam intenções associadas a uma
revisão. Entrada numa sessão aguarda o primeiro snapshot antes de participar da
sucessão.

Essa arquitetura não implementa:

- transporte remoto;
- autenticação multiusuário;
- CRDT de produção;
- resolução geral de conflitos geométricos.

## 18 - Perfis da aplicação

`application.default.json` define o perfil normal. O perfil diagnóstico adiciona
o plugin de testes por configuração. Dependências diagnósticas não devem ser
alcançáveis pela superfície de produção sem decisão explícita.

`ui.default.json` descreve composição inicial da interface. Layout persistido
no navegador não cria um segundo sistema de comandos.

## 19 - Testes e gates

### Gates locais

```bash
python3 tools/run_current_gates.py
```

O conjunto inclui auditorias arquiteturais, PWA, alcançabilidade e regressões
de marcos. O número efetivo deve ser lido da saída.

### Runtime

```text
runtime test help
runtime test all
```

Suítes podem ser executadas por nome. O perfil diagnóstico é obrigatório para
o plugin correspondente.

### Testes específicos

Exemplo do runtime temporal legado/event-driven:

```bash
node tools/test_animation_runtime_event_driven.mjs
```

Contrato de interações:

```bash
node --import ./tools/register_node_vendor_loader.mjs \
  tools/test_interaction_bindings_0054mx.mjs
```

Plataformas cinemáticas:

```bash
node --import ./tools/register_node_vendor_loader.mjs \
  tools/test_kinematic_platforms_0054my.mjs
```

### Qualidade visual

Mudanças de UI, PWA, câmera, gizmo, animação e jogo exigem roteiro manual. Uma
regressão observada continua sendo regressão mesmo quando gates passam.

## 20 - Dívida e limites conhecidos

### Implementado, mas em consolidação

- runtime de jogo e personagem;
- colisão triangular sem aceleração universal;
- plataformas cinemáticas derivadas da animação temporal;
- ferramentas por caminho e extrusão interativa;
- autoria unificada sobre adapters legados;
- catálogo inicial de eventos e ações por objeto;
- visual GLB e mapeamento de clips;
- PWA em múltiplos checkouts durante desenvolvimento.

### Pretendido

- cápsula opcional e contatos tangenciais completos;
- papéis `solid | trigger | none` e eventos de contato `enter | stay | exit`;
- corpos dinâmicos, objetos empurráveis e física geral;
- recursos lógicos tipados para registros, texto e referências de assets;
- modificadores vinculados e avaliação incremental universal;
- bindings reativos entre propriedades, prefabs e exportação de applets;
- gatilhos autorais de ponteiro, colisão e mudança de propriedade;
- booleanas robustas em backend substituível;
- colaboração remota com semântica de conflitos;
- segundo backend de isolamento para plugins hostis;
- gramática procedural especializada.

### Regra de evolução

Uma nova implementação pode substituir backend, renderer ou índice sem alterar
a identidade pública da operação. Mudanças que criam uma segunda fonte de
verdade devem ser rejeitadas ou explicitamente migradas.

## 21 - Mapa de pacotes

| Área | Pacotes representativos |
| --- | --- |
| Estado e comandos | `region-core`, `sandbox-core`, `editor-commands` |
| Seleção e transformação | `selection-operations`, `transform-hierarchy`, `math-affine` |
| Geometria | `geometry-registry`, `geometry-registry-three`, `mesh-editor-core` |
| Autoria | `edit-tools`, `edit-hud`, `spatial-references`, `planar-authoring` |
| Projeção | `renderer-three`, `viewer-rendering` |
| Arquivos | `project-io`, `platform-web`, `mesh-exchange` |
| Programação | `script-runtime`, `experiment-runtime` |
| Tempo | `temporal-runtime`, `animation-runtime` |
| Interações | `interaction-runtime`, contrato portátil em `core` |
| Jogo | `game-runtime` (`CollisionWorld`, `KinematicCollisionWorld`), `character-animation`, `character-animation-three` |
| Diagnóstico | `runtime-test-plugin`, ferramentas em `tools/` |

Consulte `docs/project/MODULE_MIGRATION_MAP.json` e auditorias de arquitetura
para o estado exato das fronteiras e da dívida medida.

## 22 - Critérios para documentação futura

Uma capacidade pública concluída deve registrar:

- objetivo e estado de maturidade;
- comando, query ou evento autoritativo;
- alvos e validações;
- persistência ou efemeridade;
- caminho de UI e console;
- teste automatizado;
- roteiro manual;
- limites e migração;
- relação com decisões e roadmap.

Documentos de marco permanecem históricos. Manual, Referência e Livro devem ser
atualizados sem transformar planos em fatos.
