# SpatialSeed 0046a — workbranch de layout do HUD

## Objetivo

Separar a política visual da toolbar dos comandos e do estado autoritativo do editor.
O branch `feature/0046-ui-toolbar-layout` não registra comandos novos, não altera
reducers, não muda ferramentas e não modifica contratos do runtime.

A dependência permanece unidirecional:

```text
estado e comandos do editor
        ↓ query/execute existentes
EditHud
        ↓ descritores visuais
edit-hud-layout
        ↓ DOM e localStorage locais
toolbar
```

O pacote `packages/edit-hud-layout` não importa `core`, `editor-commands`,
`edit-tools`, renderers ou Three.js.

## Contratos

### HudLayoutStore

Persiste somente preferências visuais no documento
`spatial-seed-hud-layout-v2`, sob a chave
`spatialseed.edit.hud.layout.v2`.

Ele conhece identificadores de famílias e itens, mas não conhece o significado
ou a implementação dos comandos associados aos botões.

### HudLayoutPolicy

Recebe descritores, contexto e preferências e devolve um plano puro:

```javascript
{
  id,
  family,
  visibility,
  zone,
  order,
  pinned,
  hidden,
  disabled,
  reason
}
```

As zonas são:

- `fixed-start`: posição estável no início;
- `adaptive`: ordenação contextual permitida;
- `fixed-end`: posição estável no fim.

A heurística só pode ordenar itens deixados na zona `adaptive`.

### HudDomLayout

Descobre controles existentes e aplica `hidden`, `order` e atributos visuais.
Não clona botões e não recria listeners.

### HudCustomizationController

Edita somente o `HudLayoutStore`. Não executa comandos do editor.

## Integração de branches paralelos

Um branch de núcleo pode adicionar um botão ao HTML ou registrar uma geometria
sem alterar o pacote de layout. Ao descobrir um identificador desconhecido, o
store cria uma política padrão `auto/adaptive`.

Um branch de catálogo poderá futuramente fornecer descritores de toolbar sem
alterar o resolvedor:

```javascript
{
  id: "catalog:architecture.colonnade",
  family: "catalog.architecture",
  label: "Colunata",
  element
}
```

A integração deve preservar estes invariantes:

1. IDs de controles são estáveis.
2. O pacote de layout não chama `query` ou `execute`.
3. Fixação visual não altera disponibilidade funcional.
4. Itens fixados e indisponíveis permanecem no slot, mas desabilitados.
5. Itens adaptativos continuam sujeitos à heurística existente.
6. Ocultar uma família não remove seus controles do DOM.
7. Preferências locais não entram no projeto, histórico ou sincronização.

## Arquivos do branch

```text
packages/edit-hud-layout/src/HudLayoutPolicy.js
packages/edit-hud-layout/src/HudLayoutStore.js
packages/edit-hud-layout/src/HudDomLayout.js
packages/edit-hud-layout/src/HudCustomizationController.js
packages/edit-hud-layout/src/index.js
packages/edit-hud/src/EditHud.js
apps/web/index.html
apps/web/style.css
packages/runtime-test-plugin/src/RuntimeLayerTests.js
```

Os demais arquivos alterados contêm somente chaves de cache, build e precache.
