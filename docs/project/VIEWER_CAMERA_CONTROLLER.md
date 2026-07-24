# Controlador da câmera de navegação

> Contrato técnico implementado no marco `0029c`.

## Fronteira

A câmera de navegação é estado local de um viewer. Ela não é um objeto da cena,
não pertence à região ou ao sandbox, não entra no histórico e não é serializada
no arquivo `.spatialseed`. Objetos câmera persistentes são uma capacidade
posterior e distinta.

`ViewerCameraController` é a API pública. `ThreeRegionRenderer` implementa
somente o adaptador visual:

- `readNavigationCamera()`;
- `applyNavigationCamera(camera)`;
- `subscribeNavigationCamera(listener)`;
- `readSelectionBounds()`.

`OrbitControls` pode alterar a câmera concreta, mas cada mudança é normalizada
de volta ao `ViewerState`. Painel, console e procedimentos não acessam
`THREE.Camera` nem `OrbitControls`.

## Estado

O estado normalizado contém:

| Campo | Contrato |
| --- | --- |
| `position` | três números finitos |
| `quaternion` | quatro números finitos, normalizados e não nulos |
| `focusDistance` | número finito maior que zero |
| `fov` | campo visual vertical em graus, entre 1 e 179 |
| `near`, `far` | números finitos que satisfazem `0 < near < far` |
| `aspect` | razão de aspecto positiva do viewport |

O `target` retornado por `viewer.camera.snapshot` é uma consulta derivada:
posição mais o eixo frontal do quaternion multiplicado por `focusDistance`.
Alterar o alvo usa `look-at`, que calcula um novo quaternion.

## Comandos

Todos são locais ao viewer e possuem `mutates: false`:

- `viewer.camera.projection.set`;
- `viewer.camera.pose.set`;
- `viewer.camera.move`;
- `viewer.camera.look-at`;
- `viewer.camera.orbit`;
- `viewer.camera.frame-selection`;
- `viewer.camera.interpolate`;
- `viewer.camera.restore`.

A consulta `viewer.camera.snapshot` devolve a câmera normalizada e o alvo
derivado. O evento `viewer.changed` permite atualizar superfícies sem consultar
o renderer.

## Procedimentos

O Worker SES recebe uma fachada mínima `camera` quando essa capability é
explicitamente autorizada. Métodos como `camera.orbit`,
`camera.frameSelection` e `camera.lookAt` apenas emitem intenções
serializáveis. A câmera muda somente após `plan commit`.

Experimentos declarativos usam uma sessão separada, autorizada somente a
produzir criações geométricas. Um plano misto de câmera local e mutação espacial
é rejeitado, pois não existe atomicidade comum entre viewer transitório e
sandbox persistente.

## Testes

`runtime test viewer` cobre normalização, alvo derivado, `look-at`, movimento
local, órbita, enquadramento, interpolação, sincronização do adaptador,
aplicação atômica de sequência, plano procedural, revisão obsoleta e roteamento
do console. `runtime test program-evaluation` cobre presença e ausência
explícitas da capability de câmera.
