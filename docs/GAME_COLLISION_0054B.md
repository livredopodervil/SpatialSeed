# Colisão espacial local — 0054b

A 0054b separa a representação usada para localizar candidatos de colisão da
representação usada para decidir a colisão. O modo jogo continua local e
efêmero; não grava transformações por quadro no documento.

## Contrato

Cada colisor publicado ao runtime contém:

- `broadBounds`: AABB em coordenadas mundiais, usada somente como broad phase;
- `collider.type`: nesta etapa, `local-box`;
- `collider.localBounds`: limites da geometria no espaço local do objeto;
- `collider.worldMatrix`: transformação afim local→mundo.

`packages/game-runtime/src/CollisionWorld.js` é independente de Three.js e do
renderer. Ele normaliza os descritores e executa a narrow phase. O renderer é
somente um adaptador da projeção visual para esse contrato.

## Narrow phase

A primeira implementação usa SAT entre a AABB do personagem e uma caixa local
orientada pela matriz mundial do objeto. Dessa forma, girar um objeto não
transforma todo o seu AABB mundial em volume sólido. A AABB mundial continua
existindo apenas para rejeitar rapidamente pares sem possibilidade de contato.

Movimentos do controlador continuam cinemáticos e separados em X/Z/Y. Quando o
movimento encontra uma forma local, a distância segura é refinada por busca
binária. A recuperação de interpenetração também consulta a narrow phase.

## Compatibilidade

Descritores legados 0054a no formato `{ id, bounds }` continuam aceitos e são
normalizados como caixas locais sob matriz identidade. Isso preserva testes e
consumidores externos enquanto a projeção principal passa a publicar v2.

## Limites deliberados

Esta etapa ainda não introduz cápsula de personagem, contatos com normal,
`stepHeight`, inclinação máxima, sliding em rampas, BVH/triângulos ou corpos
dinâmicos. Uma rampa rotacionada passa a possuir volume físico orientado correto,
mas a locomoção sobre sua superfície ainda é limitada pelo resolvedor X/Z/Y.

A próxima evolução deve acrescentar uma interface de contatos (`point`, `normal`,
`depth`) sem alterar `GameRuntime` nem o contrato de broad phase.
