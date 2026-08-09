# Modo jogo local — 0054a

O incremento 0054a introduz uma primeira fronteira jogável sobre qualquer
objeto renderizável selecionado. A sessão é estado efêmero local ao viewer: posição física,
velocidade, estado de animação e câmera não alteram o documento, o sandbox nem
o histórico de undo.

## Uso

1. selecione o objeto que representará o personagem;
2. pressione **Jogar** na barra ou use `G`;
3. use `WASD` ou as setas para andar, `Shift` para correr e `Espaço` para pular;
4. arraste a cena para orbitar a câmera de acompanhamento;
5. use `Esc` ou **Sair do jogo** para restaurar a câmera e a interface de autoria.

Em telas de toque, o HUD fornece direções, corrida e pulo por pressão contínua.
Enquanto a sessão estiver ativa, toolbar, painéis, seleção, gizmos, auxiliares
de câmera e HUD editorial ficam ocultos.

## Comandos públicos

- `game.start { characterId?, config?, camera? }` inicia com o ID explícito ou
  com o membro ativo da seleção;
- `game.stop { reason? }` encerra e restaura câmera e projeção autoral;
- `game.input.set { forward, strafe, sprint, jump, lookYawDelta,
  lookPitchDelta }` atualiza a entrada local;
- `game.respawn` volta à posição inicial;
- `game.config.set { character?, camera? }` ajusta parâmetros da sessão;
- `game.status` descreve personagem, movimento, contato, câmera e contadores.

O console também aceita `game start`, `game stop`, `game status`,
`game respawn` e `game config {JSON}`.

## Contrato de execução

`GameRuntime` pertence à camada `viewer`. Ele consome o relógio de simulação em
passo fixo e publica somente overlays de animação no renderer. A projeção lê os
limites mundiais dos objetos renderizáveis e fornece uma fotografia de
colisores AABB estáticos, excluindo a subárvore do personagem.

A física contém gravidade, aceleração no chão e no ar, atrito, corrida, pulo
com pequena tolerância de borda (`coyoteSeconds`), colisão separada nos três
eixos, teste de apoio e respawn abaixo de um limite configurável. O estado
visual básico alterna entre `idle`, `walk`, `jump` e `fall`; a implementação
atual aplica giro e deslocamento corporal simples, deixando clips esqueléticos
como substituição futura da mesma saída de overlay.

Mudanças no próprio personagem ou substituições integrais da cena encerram a
sessão. Mudanças nos demais objetos atualizam a fotografia de colisão depois da
projeção incremental. Parar sempre libera demanda de frame, restaura o overlay,
reativa a apresentação autoral e repõe a câmera capturada no início.

## Limites deliberados

- colisores são caixas AABB estáticas; não há rampas, malha de colisão, corpos
  dinâmicos, gatilhos ou resposta física entre personagens;
- o personagem é uma ocorrência renderizável, não um rig esquelético;
- entrada, parâmetros e estado da partida ainda não são persistidos nem
  compartilhados entre viewers;
- a câmera não faz prevenção de oclusão contra paredes;
- a sessão não executa scripts anexados ao documento.

Esses limites mantêm o primeiro loop jogável substituível sem transformar o
documento editorial em estado físico por quadro.

## Verificação

O suite `runtime test game-runtime` cobre queda e apoio, bloqueio lateral,
pulo/queda, aplicação e restauração do overlay/câmera e invalidação do
personagem. O perfil diagnóstico continua responsável por `runtime test all`.
