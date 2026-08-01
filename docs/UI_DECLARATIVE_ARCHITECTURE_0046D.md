# SpatialSeed UI 0046d — arquitetura declarativa

## Objetivo

Separar a composição visual do estado e da lógica do domínio. O núcleo expõe comandos, consultas e subscriptions; módulos de UI registram descritores; aplicações escolhem módulos; perfis escolhem a disposição. O DOM deixa de ser o contrato entre features.

## Camadas

```text
Domain modules
  commands · queries · subscriptions
          ↓
UiModuleRegistry
  modules · dependencies · capabilities
          ↓
HudComponentRegistry · PanelRegistry · OverlayRegistry
          ↓
UiApplicationStore / UiApplicationComposer
  quais módulos participam da aplicação
          ↓
HudLayoutStore / HudGridEngine
  onde e em que tamanho cada componente aparece
          ↓
HudRuntime / HudDesigner
  execução e edição visual
```

A dependência inversa não é permitida: domínio e renderer não importam pacotes do designer.

## Contrato de módulo

```javascript
uiModules.register({
  id: "ui.measurement",
  version: "1",
  title: "Medição",
  dependencies: ["ui.selection"],
  capabilities: ["measurement.distance", "measurement.angle"],
  commands: ["measurement.tool.activate"],
  queries: ["measurement.status"],
  hudComponents: [{
    id: "measurement.distance",
    kind: "toggle",
    category: "measurement",
    label: "Distância",
    icon: "📏",
    action: {
      command: "measurement.tool.activate",
      arguments: { tool: "distance" }
    },
    state: {
      query: "measurement.status",
      path: "activeTool",
      activeWhen: { equals: "distance" }
    }
  }],
  panels: [],
  overlays: []
});
```

O registro aceita módulos desativados antes de suas dependências. A ativação valida dependências, detecta ausência e pode ativar ou desativar em cascata. Isso evita acoplamento à ordem de carregamento dos bundles.

## Contrato de componente HUD

Cada componente possui:

- ID estável;
- tipo de widget;
- módulo proprietário;
- categoria padrão;
- limites e tamanho preferencial;
- ação declarativa;
- binding declarativo de estado;
- posicionamento padrão;
- capacidades exigidas.

Tipos iniciais:

```text
button toggle radio select number integer range color text boolean
vector2 vector3 label separator spacer menu composite procedure-form
```

Um controle composto é atômico para o layout. Sliders, selects e grupos de inputs não são desmontados em ícones arbitrários.

## Aplicações e perfis

Uma aplicação define quais módulos estão ativos e pode vincular um perfil de HUD:

```json
{
  "schemaVersion": "spatial-seed-application-v1",
  "id": "technical-drawing",
  "name": "Desenho técnico",
  "enabledModules": ["ui.selection", "ui.planar", "ui.measurement"],
  "disabledModules": ["ui.animation"],
  "hudProfileId": "technical-drawing-hud"
}
```

O perfil não registra comandos nem módulos. Ele apenas referencia IDs e determina posição, tamanho, visibilidade e substituições de apresentação. Assim, uma feature pode ser atualizada sem reescrever todos os perfis.

## Grid determinístico

Seções e itens possuem coordenadas explícitas:

```javascript
{ x, y, width, height }
```

O motor puro `HudGridEngine` resolve colisões por uma das políticas:

```text
push · swap · reject
```

Toda movimentação que empurra outros componentes devolve o conjunto completo de posições. O store persiste todas elas; a disposição não pode existir apenas como efeito transitório do DOM.

## Designer

O designer usa o mesmo documento que o HUD operacional. Suas vistas são:

- Prévia: canvas neutro, sem executar comandos;
- Estrutura: árvore de seções, componentes e itens não posicionados;
- Propriedades: dimensões, comandos, argumentos e estados;
- Biblioteca: componentes registrados fora do perfil;
- Aplicação: composição dos módulos e vínculo com perfil de HUD.

Seções podem ser removidas de um perfil sem apagar componentes. Componentes removidos voltam à biblioteca. Tipos heterogêneos mantêm dimensões mínimas coerentes.

## Migração do HUD legado

O HTML atual é adaptado temporariamente por `LegacyHudModuleAdapter`:

```text
família HTML existente → módulo declarativo
controle DOM existente → HudComponentDescriptor + runtime.element
```

Isso permite migrar feature por feature sem interromper o produto. Para novos módulos, o caminho preferido é registrar descritores diretamente, sem acrescentar elementos ao `index.html` e sem modificar `EditHud`.

## Limites desta etapa

- O HUD possui registro declarativo real; controles históricos ainda podem usar elementos DOM adotados.
- Painéis e overlays já têm contratos e registries, mas o shell histórico ainda precisa ser migrado para consumi-los integralmente.
- O catálogo de comandos atual fornece IDs, não schemas completos de argumentos; o designer oferece JSON avançado enquanto a introspecção tipada não for adicionada ao `CommandRegistry`.
- O estado nativo de várias ferramentas ainda é atualizado por `EditHud`; a migração futura deve mover isso para `state` bindings registrados por cada feature.

## Invariantes

1. Um módulo registra sua própria UI; não modifica o HTML de outro módulo.
2. O layout não importa serviços de domínio.
3. O widget não chama serviços concretos; ele executa um comando público.
4. O estado visual autoritativo vem de query/subscription.
5. A aplicação escolhe módulos; o perfil escolhe layout.
6. IDs de componentes são estáveis e independentes da posição.
7. Componentes novos entram na biblioteca sem invalidar perfis antigos.
8. Componentes ausentes permanecem como referências diagnosticáveis, não quebram o documento.
9. O DOM é uma projeção descartável do documento e dos registries.
10. O designer nunca executa a ação do componente durante drag ou resize.
