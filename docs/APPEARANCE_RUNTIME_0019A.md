# Appearance Runtime 0019a

Serviço isolado para manter e resolver o grafo de aparência durante a execução.

## Responsabilidades

```text
importAssets
exportAssets
internLegacyMaterial
resolve
attachLegacyObject
normalizeScene
clearResolvedCache
stats
```

## Cache

`resolve(appearanceId)` retorna a mesma referência imutável enquanto o catálogo não for recarregado.

O cache é invalidado quando:

- novos assets são importados;
- uma nova aparência é internada;
- `clearResolvedCache()` é chamado.

## Estado

O serviço mantém:

- catálogo `AppearanceGraph`;
- revisão monotônica;
- cache de resoluções;
- notificações de alteração.

## Limite desta etapa

Ainda não há integração com:

- Sandbox;
- renderer;
- Inspector;
- `ProjectService`;
- arquivos abertos.

A próxima etapa fará o Sandbox manter objetos com `appearanceId` sem material embutido.
