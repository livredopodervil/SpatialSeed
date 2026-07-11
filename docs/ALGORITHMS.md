# Algoritmos e correspondência com problemas

- Reducer regional com cópia apenas do array/objeto alterado: structural sharing manual.
- Pilhas locais de undo/redo no sandbox: Command/Memento local, sem undo global.
- Controle otimista por `baseVersion`: evita publicar sobre região divergente.
- `Map<objectId, Mesh>`: reconciliação gráfica por identidade.
- Transformação com `TransformControls`: solução consolidada para translação, rotação e escala por eixos/planos.
- Registro isolado de módulos: falha opcional não interrompe o núcleo.
- Confirmação em duas etapas: revisar proposta e confirmar publicação.
