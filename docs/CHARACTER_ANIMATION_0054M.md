# SpatialSeed 0054m — Character animation backend v1

A 0054m introduz animação esquelética de personagens como subsistema substituível. O módulo `character-animation` não depende de Three.js e define estados semânticos, bindings de clips, transições e integração com o scheduler do jogo. O módulo `character-animation-three` é o primeiro backend e usa `GLTFLoader`, `AnimationMixer` e `AnimationAction`.

O root mundial continua sob autoridade do `CharacterPhysics`; o mixer modifica a pose interna do rig. Por padrão, tracks horizontais de posição do root bone são neutralizadas (`in-place-horizontal`) para reduzir conflito com locomoção física. O sistema usa o delta do `GameRuntime/SimulationClock`, sem `THREE.Clock`.

Estados inferidos: `idle`, `walk`, `run`, `jump`, `fall`, `land`. Bindings podem ser sobrescritos por comando. O renderer fornece apenas uma porta genérica de visual transitório e oculta o visual-base enquanto o personagem animado está ativo.

## Comandos

`character.animation.asset.load`, `character.animation.configure`, `character.animation.play`, `character.animation.unload`, `character.animation.status`, `character.animation.clips`.

Exemplo por URL:

`runtime command character.animation.asset.load {"src":"assets/characters/hero.glb"}`

Exemplo de binding:

`runtime command character.animation.configure {"bindings":{"idle":{"clip":"Idle"},"walk":{"clip":"Walk"},"run":{"clip":"Run"},"jump":{"clip":"Jump"},"fall":{"clip":"Fall"},"land":{"clip":"Land"}}}`

GPU-instanced crowds ficam fora desta etapa. `InstancedMesh` compartilha geometria/material e transformações, mas não fornece por si só uma pose esquelética independente por instância. Um backend de crowds deve usar palette/texture de bones ou compute/storage buffers e permanecer atrás do mesmo contrato de character-animation.

## 0054ma — alinhamento visual e auto-fit

A família 0054m passa a usar microversões (`0054ma`, `0054mb`, ...) para amadurecer
animação de personagem antes do marco 0055. A 0054ma introduz um wrapper de
alinhamento acima do root glTF: o `AnimationMixer` continua atuando sobre o rig
original, enquanto escala, orientação, âncora e hover pertencem ao wrapper visual.
Isso impede que tracks do root sobrescrevam o alinhamento do asset.

O padrão é `fit=height`, `sourceUp=+Y`, `sourceForward=+Z`, `anchor=feet`,
`hover=0`. O backend converte a convenção glTF (+Y para cima, +Z para frente)
para a convenção atual do jogo (+Y para cima, -Z para frente), calcula a altura
do asset e ajusta uniformemente ao bounding box local do objeto físico. A escala
manual continua disponível como multiplicador; chamadas legadas que fornecem
apenas `visual.scale` mantêm o comportamento manual (`fit=none`).

A UI da área de Animação permite alterar auto-fit, escala, eixo para cima, eixo
para frente, âncora, hover e correção Euler XYZ. O comando equivalente é
`character.animation.visual.configure`. Nenhum desses parâmetros modifica
`CharacterPhysics`, collider ou documento canônico.

## 0054mb — movimento explícito, idle e preview editor/jogo

A referência do input deixa de ser implicitamente a câmera. `controls.movementReference`
aceita `world` (padrão estável) e `camera` (terceira pessoa clássica). A física continua
recebendo apenas `worldX/worldZ`; a escolha do referencial pertence ao orquestrador.

Visibilidade e execução da animação deixam de ser o mesmo estado. O visual GLB pode
permanecer projetado no editor enquanto o `AnimationMixer` está pausado. Ao carregar
ou sair do jogo, o sistema retorna ao binding `idle`; `Survey` é reconhecido como idle
para o Fox do Khronos. O mesmo painel de alinhamento é reparented para o HUD durante
o modo jogo, portanto não há uma segunda cópia de parâmetros nem estado divergente.

## 0054mc — yaw lateral, âncora local e histórico visual

A direção lateral passa a obedecer à mesma convenção da matriz afim: deslocamento +X
produz yaw -90 graus, orientando o frontal canônico -Z para +X. O alinhamento GLB deixa
de misturar Box3 mundial com bounds locais; todos os bounds de fit/anchor são calculados
no espaço local do proxy-alvo, mesmo após translação, rotação ou escala canônica.

Parâmetros visuais continuam sendo projeção do backend, mas seu descritor genérico é
persistido no objeto via `characterAnimation.visual`. Alterações entram no histórico do
Sandbox e Undo/Redo reconfiguram o backend transitório. Mudanças exclusivamente visuais
não reiniciam a física nem o CollisionWorld. O HUD de jogo muda de apresentação apenas
nas transições authoring<->game e não desfoca/reescreve selects a cada frame.

## 0054md — frame canônico único de personagem

O erro W/A trocados mostrou que sem um frame espacial declarado o input, o yaw físico
e o alinhamento do asset podiam assumir frentes diferentes. A convenção desta geração
fica explícita: `+Y` é cima, `+X` é frente e `+Z` é direita. O teclado permanece
semanticamente `W/S = forward/back` e `A/D = left/right`; somente a projeção dessas
intenções para o mundo usa o frame canônico. O modo camera-relative continua opcional.

`CharacterPhysics` calcula yaw contra a mesma frente +X, e o backend Three converte o
`sourceForward` do asset (glTF normalmente +Z) para +X. Assim input, orientação física
e orientação visual deixam de possuir convenções independentes.


## 0054me — câmera livre, locomoção camera-relative e fonte visual única

O padrão de controle passa a ser terceira pessoa com câmera livre: `W/S` usam a
frente/trás da câmera e `A/D` usam a direita/esquerda da câmera. A câmera não é
forçada a acompanhar o yaw do personagem. O modo `world` permanece como opção
explícita, preservando o frame `+Y up, +X forward, +Z right` da 0054md.

Há uma única autoridade para o default de locomoção: `GameRuntime.DEFAULT_CONTROLS`.
A UI apenas espelha `game.status().controls.movementReference`; ela não define um
segundo fallback. A orientação do personagem continua derivada da velocidade
física efetiva, e o backend GLB cuida somente da conversão dos eixos do asset.

A fonte visual possui uma única política persistente por objeto:
`object.characterAnimation.sourceMode`, com `default`, `custom` e `original`.
`default` resolve `assets/characters/Fox.glb` apenas na camada web; `custom` usa o
GLB explicitamente carregado; `original` mantém o objeto canônico sem visual
animado. Se o Fox padrão não puder ser carregado, `game.start` continua com o
objeto original. `customCharacterSources` e `loadedCharacterSourceModes` são
apenas caches transitórios de recurso/proveniência e não constituem outra fonte
de verdade.

Uma política futura de câmera (`free | follow | lock`) deve permanecer no
contrato da câmera, sem alterar `CharacterPhysics`.

## 0054mf — projeto demo substituível e entrada direta em jogo

O projeto aberto em uma URL comum passa a ser dirigido por
`assets/demo/default-game.manifest.json`. O bootstrap não conhece nome, índice ou
ID fixo do personagem: o manifesto aponta para o arquivo `.spatialseed`, o
`characterId`, o modo de lançamento e os controles iniciais. Isso permite trocar
o projeto de demonstração e o personagem sem alterar `GameRuntime`, física,
renderer ou backend de animação.

A URL explícita `?project=new`, os fluxos `project=open` e os viewers/sandboxes
coordenados não são substituídos pelo demo. Se o asset demo falhar, o bootstrap
continua utilizável e registra o problema no console em vez de tornar a falha
fatal.

No demo inicial o personagem é o objeto definido pelo manifesto e está salvo com
quaternion identidade `[0,0,0,1]`. Após a projeção inicial da cena, a aplicação
seleciona esse objeto e executa o comando público `game.start`; a política de
visual continua sendo `default/custom/original` da 0054me.

O painel `Visual do personagem` permanece disponível no HUD de jogo, mas entra
recolhido. Um botão explícito o abre sem alterar a simulação. Ao voltar ao editor,
o painel retorna visível ao seu local editorial.


### 0054mf — polimento do demo

O painel de visual no modo jogo usa `details/summary` nativo e começa fechado.
A música padrão continua sendo disparada semanticamente por `game.start`, mas o
autoplay de navegador pode rejeitar `Audio.play()` durante o bootstrap automático.
A camada web repete a reprodução no primeiro gesto de jogo (teclado, HUD ou
ponteiro no viewport), preservando `GameRuntime` e `GameAudioRuntime` livres de
política específica do navegador.


## 0054mh — proxy físico independente e câmera estabilizada

O objeto-base permanece a autoridade física do personagem. Seu bounds é lido pelo
GameRuntime para construir o collider, mas o rig visual conserva o frame de fit e a
escala visual independem da escala local do proxy desde o primeiro bind. Alterações
feitas antes ou depois do carregamento são reconciliadas por evento e compensadas no
wrapper visual; assim é possível aumentar o collider para conter a raposa sem aumentar
sua geometria, inclusive após salvar e reabrir o projeto.
Um `rebindTarget` explícito continua disponível ao backend quando se desejar refazer o
fit deliberadamente.

A inicialização de yaw da câmera deve usar a mesma convenção de `movementBasis`:
`forward = [sin(yaw), 0, -cos(yaw)]`. Portanto, para o vetor horizontal
`target - camera = [dx, 0, dz]`, o yaw correto é `atan2(dx, -dz)`. A forma
`atan2(-dx, dz)` introduzida na 0054mh estava deslocada em π e foi corrigida
na revisão final da 0054mi. A câmera mantém agora uma posição livre amortecida
separada da posição resolvida por colisão. A posição colidida não retroalimenta o integrador, removendo o ciclo de
empurrar/retrair junto a paredes. A distância mínima usa a saída do AABB físico do
personagem mais `collisionCharacterPadding`; portanto aumentar o proxy também aumenta
a região que a câmera evita. Se uma parede deixar menos espaço que essa região, a
parede permanece soberana para não ser atravessada.


## 0054mi — lifecycle exclusivo do personagem

O autostart do demo adia somente `game.start` para a próxima tarefa do browser, garantindo que `bindWebInterface` já tenha instalado mouse/touch. Uma sessão de jogo mantém apenas um visual animado carregado; trocar o personagem descarrega o visual anterior e sair do jogo descarrega o atual, restaurando imediatamente o objeto-base. O preview no editor passa a ser opt-in. O proxy continua definindo o volume físico; a escala do rig é compensada, enquanto a âncora nos pés acompanha a borda física atual do proxy. Na ausência de clip `jump`, o estado usa temporariamente o binding de `run`, como fallback semântico substituível.


## 0054mj — escala efetiva do proxy, câmera inicial estável e atualização PWA

A escala do visual animado é compensada pela escala efetiva extraída de
`parent.matrixWorld`, e não por `parent.scale`. Isso cobre proxies cujo transform
canônico é aplicado diretamente por matriz. O objeto-base continua definindo o
volume físico, enquanto a malha GLB mantém tamanho visual independente.

A câmera de jogo passa a iniciar diretamente na órbita configurada, preservando
apenas o yaw derivado da câmera editorial. O integrador não parte mais de uma
posição editorial próxima do personagem. A posição vertical desejada também é
limitada pela base física do personagem através de `minimumBaseClearance`,
impedindo a órbita de atravessar o chão/corpo ao olhar muito para baixo.

O bootstrap lê `build-info.json` com `cache: no-store`. Esse arquivo é controle
de versão e não pode ser servido pelo cache estático antigo; o service worker
também o trata, junto com o manifesto de precache, como request network-first.
Cada alteração de código volta a receber build único, evitando misturar conteúdo
diferente sob a mesma chave de cache.
