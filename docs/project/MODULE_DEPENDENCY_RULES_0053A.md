# Regras de dependência modular — 0053a

## Fluxo permitido

```text
UI
 ↓
Commands / Queries
 ↓
Edit Kernel / Selection / Temporal
 ↓
Occurrence Runtime
 ↓
Project Model
```

Em paralelo:

```text
Occurrence Runtime + Preview Runtime + Temporal Runtime
                       ↓
                  Render Graph
                       ↓
                  Three Adapter
```

## Dependências proibidas

- UI → Renderer interno;
- Renderer → mutação do ProjectModel;
- Mesh editor → Three.js direto;
- Inspector → estado interno do Sandbox;
- Preview → save/histórico;
- Temporal → Three object;
- ferramenta → `state.objects.find/map` como resolução canônica de alvo.

## Atomicidade da migração

Cada incremento posterior deve introduzir uma abstração e migrar uma família pequena de clientes. 0053a é deliberadamente contrato + auditoria; não altera Delete, Inspector, mesh, preview ou renderer.
