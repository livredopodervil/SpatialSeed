# SpatialSeed 0054i — câmera, áudio padrão e superfícies planas no jogo

## Escopo

0054i é um incremento de consolidação da linha 0054x rumo ao critério de saída 0055: pequenos jogos completos devem poder ser descritos pela linguagem/runtime sem transformar `GameRuntime` em um módulo monolítico.

## Colisão da câmera

A câmera de terceira pessoa passa a usar o mesmo `CollisionWorld` normalizado do personagem. O runtime calcula a posição candidata da câmera e consulta o primeiro obstáculo no segmento entre o alvo do personagem e essa posição. Quando existe interseção, a câmera é retraída para antes da superfície por uma margem configurável.

A consulta é matemática e independente de Three.js: `CollisionWorld.castCollisionSegment()` suporta `local-box`, `sphere` e `triangle-mesh`. O renderer continua responsável apenas por projetar a geometria para o contrato físico.

Configuração da câmera:

- `collisionEnabled`: ativa/desativa a retração por obstáculo;
- `collisionProbeRadius`: margem entre a câmera e a superfície;
- `collisionMinimumDistance`: distância mínima preservada em relação ao alvo.

## Planos e objetos copiados

O broad phase antigo exigia volume estritamente positivo em todos os eixos. Isso é correto para volumes, mas incorreto para superfícies trianguladas: um plano possui AABB com espessura zero em um eixo. Depois de duplicar um plano, ao escolher uma cópia como personagem, a outra permanecia no mundo físico e fazia `normalizeCollisionWorld()` rejeitar o mundo antes de `game.start` concluir.

0054i separa a condição matemática do broad phase da forma física final. AABBs degeneradas de superfícies recebem somente uma espessura numérica mínima para a consulta espacial; a narrow phase continua usando os triângulos reais. Caixas, esferas e demais malhas preservam seus contratos anteriores.

## Áudio inicial

A aplicação web configura, por padrão:

- música: `assets/audio/music.ogg`, volume `0.35`, loop;
- salto: `assets/audio/jump.mp3`, volume `0.8`;
- aterrissagem: `assets/audio/land.mp3`, volume `0.6`.

Bindings iniciais:

- `game.start` → tocar música;
- `game.stop` → parar música;
- `character.jump` → efeito `jump`;
- `character.land` → efeito `land`.

A configuração permanece substituível pelos comandos `game.audio.*` e `game.events.configure`.

## Nota de tooling ESM/Node

O runner direto `node tools/run_runtime_regressions.mjs ...` pode emitir `MODULE_TYPELESS_PACKAGE_JSON` porque arquivos `.js` em `packages/` usam sintaxe ESM sem uma declaração de escopo `"type": "module"`. O Node os reparsa corretamente e os testes continuam válidos, mas informa o custo de detecção.

A correção de metadata foi deliberadamente adiada: declarar ESM na raiz ou em todo `packages/` deve ser precedido por uma auditoria completa de CommonJS para não alterar silenciosamente a interpretação de scripts legados. Isso não é requisito do runtime web atual.
