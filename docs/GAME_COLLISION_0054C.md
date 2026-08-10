# Colisão por malha final e controles combináveis — 0054c

A 0054c preserva a separação broad/narrow phase da 0054b e muda a forma física
final. A AABB mundial continua sendo usada somente para localizar candidatos.
A narrow phase passa a usar a tesselação final renderizada para qualquer objeto
que não seja uma caixa ou uma esfera analítica válida.

## Formas físicas

- `local-box`: somente caixas reais;
- `sphere`: somente esferas completas sob transformação ortogonal com escala
  uniforme;
- `triangle-mesh`: geometria final tessellada para as demais formas, inclusive
  geometrias procedurais, rotacionadas, compostas e recursos heterogêneos.

A projeção de Three.js fica em `GameCollisionProjection.js`. O `CollisionWorld`
continua independente do renderer: recebe apenas triângulos numéricos e matrizes.
Nesta etapa a malha é normalizada para triângulos mundiais e consultada
linearmente. Isso mantém o contrato pronto para substituir a busca linear por
BVH posteriormente sem alterar `CharacterPhysics` ou `GameRuntime`.

## Controles

Teclado e ponteiros passam a possuir estados separados. Cada `pointerId` mantém
seu próprio controle pressionado; o snapshot final combina todos os controles
ativos. Assim, em touch, `forward + right`, `forward + left` e combinações com
corrida/salto permanecem simultaneamente ativas enquanto os respectivos dedos
estiverem pressionados.

## Limites atuais

O personagem ainda usa AABB e o resolvedor continua cinemático em X/Z/Y. A
colisão passa a respeitar a superfície triangular real, mas locomoção contínua
sobre rampas ainda requer contatos com normal e resolução tangencial. O próximo
passo natural é introduzir `CollisionContact { point, normal, depth }` e cápsula
de personagem, mantendo o contrato de mundo desta versão.
