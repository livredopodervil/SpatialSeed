# Semente de contexto

Estamos desenvolvendo o SpatialSeed, ambiente modular para edição e criação procedural de estruturas espaciais.

O build funcional atual é `20260713-0019g-c2`. Ele possui InstancedMesh, picking por instanceId, highlight por instanceColor, proxies invisíveis, limites sujos por lote e repetição por matriz afim explícita. Há 49 testes aprovados e zero falhas.

O cliente estável fica em `apps/web`; protótipos em `apps/experiments`. O ambiente principal é Android/Termux. Portabilidade deve ser adicionada em paralelo.

Próximos eixos: linguagem procedural, grupos, interface móvel, PWA/portabilidade e plugins para navegar e editar projetos.
