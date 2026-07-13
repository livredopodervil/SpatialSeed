# Runtime incremental 0019c

Operações comuns deixam de reconstruir a cena inteira.

Mudanças incrementais: `object-created`, `object-deleted`, `object-transform` e `object-updated`.

Undo, discard, rebase, replaceState, carregamento inicial e mudanças desconhecidas continuam usando reconstrução integral segura.

O Outline só é atualizado quando visível, usa o snapshot existente e limita a listagem a 200 objetos.

A etapa seguinte será o renderer com `THREE.InstancedMesh`. Depois serão implementados comandos em lote e um plugin de navegador/editor de arquivos, capaz de visualizar e editar dinamicamente a estrutura do próprio projeto.
