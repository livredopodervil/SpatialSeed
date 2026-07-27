# SpatialSeed 0036c — correção da composição da barra

O build `20260727-0036c` corrige a configuração declarativa do workspace
unificado. O controle `mesh-editor` permanece na linha principal da barra,
onde pode abrir diretamente o painel único de edição, e deixa de ser repetido
no menu Editar. Um mesmo elemento DOM não pode ocupar simultaneamente a barra
principal e um menu composto pelo `ToolbarComposer`.

A auditoria `tools/audit_mesh_edit_ui.py` agora lê
`apps/web/config/ui.default.json` e rejeita qualquer identificador repetido
entre `toolbar.primary`, os itens de menus e `toolbar.hidden`.
