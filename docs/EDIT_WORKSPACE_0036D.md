# SpatialSeed 0036d — correção dos controles de frame

O build `20260727-0036d` corrige a inicialização do painel unificado de
edição. Os botões `mesh-frame-world`, `mesh-frame-local` e
`mesh-frame-viewer` agora são ligados ao comando público
`edit.context.frame.set`.

No build anterior, o identificador do comando foi passado por engano como se
fosse o identificador de um elemento DOM. O construtor do `MeshEditPanel`
procurava um controle chamado `edit.context.frame.set`, interrompendo a
inicialização antes de concluir o workspace. A auditoria da interface agora
verifica explicitamente as três ligações entre controle e comando.
