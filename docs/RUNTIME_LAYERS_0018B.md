# Runtime Layers 0018b

Esta etapa separa os contratos de interação entre Viewer, Editor e simulador global.

## ViewerState

Mantém somente estado local e efêmero:

- câmera;
- seleção;
- hover;
- painéis;
- metadados de apresentação.

Não conhece Region, Sandbox ou renderer.

## EditorSession

Mantém uma operação editorial transitória:

```text
begin
preview
commit
cancel
```

`preview()` nunca publica comandos.

`commit()` produz um único comando final com:

- `commandId`;
- `sessionId`;
- `viewerId`;
- `baseVersion`;
- `type`;
- `targets`;
- `payload`.

O editor não escreve diretamente na região.

## SimulationClock

Executa passo fixo determinístico, independente da taxa de renderização.

Isso permite:

- viewer a 30 ou 60 FPS;
- simulador a passo fixo;
- interpolação visual;
- limitação de catch-up.

## SimulationBridge

Recebe:

- snapshot autoritativo;
- fila de comandos finais;
- contexto de passo.

Produz:

- comandos aceitos;
- comandos rejeitados;
- nova versão;
- snapshot final;
- delta opcional.

A implementação concreta de `applyCommand` e `stepSimulation` é injetada. Portanto o módulo não conhece física, Region ou renderer.

## Limites desta etapa

Nenhum arquivo existente é modificado.

A próxima etapa deve ser um plugin de testes que registre comandos como:

```text
runtime test viewer
runtime test editor
runtime test simulation
runtime test clock
runtime test all
```
