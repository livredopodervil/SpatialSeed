# Plataformas cinemáticas e colisores animados — 0054my

## Estado e objetivo

**Implementado e testado.** Este incremento faz a transformação temporal de um
objeto participar também do mundo de colisão local. Uma caixa animada pode
funcionar como plataforma móvel e transportar o personagem apoiado sem gravar
matrizes, física ou comandos a cada frame.

Não é um motor geral de corpos rígidos. O objeto animado é cinemático: segue a
pose prescrita, permanece sólido e não recebe impulso do personagem.

## Fronteiras de autoridade

```text
documento + runtime temporal
            |
            v
projeção efetiva no renderer
            |
            | fotografia numérica revisionada
            v
KinematicCollisionWorld -> CharacterPhysics -> overlay do jogo
```

- o documento conserva objeto, geometria e definição autoral;
- o runtime temporal calcula a pose efêmera;
- o renderer já conhece a pose projetada e deriva formas numéricas;
- o jogo decide apoio e resposta antes do passo fixo;
- sandbox, undo, recuperação e arquivo não recebem frames.

Three.js não entra em `KinematicCollisionWorld`. O renderer não passa a decidir
física e o runtime de jogo não passa a escrever animação no documento.

## Identidade e atualização incremental

`CollisionWorld` v4 acrescenta `ownerId` a cada colisor. Um objeto composto pode
produzir várias formas, todas associadas ao mesmo proprietário lógico.

`readGameKinematicCollisionFrame(characterId, { sinceRevision })` publica
somente os proprietários com overlays de animação ativos. Se a revisão não
mudou, retorna imediatamente `changed: false`. Quando o conjunto de
proprietários ativos muda, a base estática é reconstruída uma vez; nos demais
frames, apenas as formas cinemáticas são substituídas.

O overlay do próprio personagem é excluído da consulta. Revisões de pose são
mantidas por objeto para evitar que a movimentação do personagem force uma
reconstrução do mundo que ele consulta.

## Transporte pelo apoio

Ao terminar um passo, `CharacterPhysics` registra `supportColliderId` quando o
personagem está apoiado. Antes do passo seguinte:

1. o runtime localiza a forma anterior e a nova forma do mesmo ID;
2. calcula `delta = nextMatrix * inverse(previousMatrix)`;
3. aplica o delta afim à posição do personagem;
4. herda somente o yaw horizontal, mantendo o body vertical;
5. conserva velocidade e distância de locomoção.

Separar deslocamento do apoio e velocidade evita que subir numa plataforma seja
contabilizado como comando de movimento ou que parar a animação injete uma
velocidade artificial.

## Superfície observável

`game status` inclui:

- `supportColliderId`;
- `kinematics.revision`;
- `kinematics.activeOwnerIds`;
- `kinematics.activeColliderCount`;
- `statistics.kinematicRefreshes`;
- `statistics.platformCarries`;
- `statistics.lastKinematicRefreshMs`;
- `statistics.maximumKinematicRefreshMs`.

O overlay **Colisão** usa o mundo já combinado e permite confirmar visualmente
que a forma acompanha a plataforma.

## Teste automatizado

```bash
node --import ./tools/register_node_vendor_loader.mjs \
  tools/test_kinematic_platforms_0054my.mjs
python3 tools/run_current_gates.py
```

Os casos específicos verificam o delta afim do apoio, a substituição somente do
proprietário animado e a integração do runtime ao longo de frames.

## Roteiro manual em toque

1. saia do jogo e escolha uma caixa larga;
2. no **Inspector → Comportamento**, ligue `game.start` à ação
   `animation.preset`;
3. use preset `float` com
   `{"axis":"y","amplitude":1,"frequency":0.15}`;
4. selecione o personagem e toque em **Jogar**;
5. suba na plataforma e solte o círculo direcional;
6. confirme que corpo, câmera e colisor acompanham o apoio na subida e descida;
7. ative **Colisão** e consulte `game status` se houver separação ou tremor.

## Limites e próximos contratos

- rotação inclinada e escala deslocam o ponto apoiado, mas o body do personagem
  permanece vertical e não é escalado;
- a plataforma não recebe força, massa, torque ou dano;
- não há pilhas de corpos, joints ou resolução dinâmica entre objetos;
- não há ainda papéis autorais `solid`, `trigger` e `none`;
- coletáveis precisam de eventos `collision.enter/stay/exit` ligados a comandos;
- empurráveis precisam de backend dinâmico substituível, passo fixo e estado
  efêmero próprio.

Recursos sem geometria são uma extensão adjacente, não parte deste incremento.
O próximo contrato previsto representa `record`, `text` e `asset-reference`
como recursos lógicos com ID, propriedades, comandos, undo, persistência e
busca, sem exigir `Object3D`. Isso fornece mini registros de estado, conteúdo e
assets para applets sem transformar renderer, DOM ou Termux em dependência.
