# Instance Batch Manager 0019g-a

Introduz a estrutura de lote para `THREE.InstancedMesh`, sem alterar o renderer em produção.

Responsabilidades: mapear `objectId ↔ instanceIndex`, criar e localizar lotes, atualizar matrizes, resolver `Raycaster` por `instanceId` e expor diagnósticos.

O instalador exige árvore Git limpa, cria uma tag de backup e grava o commit-base em `base-commit.txt`.
