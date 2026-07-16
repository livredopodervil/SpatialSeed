# Painel de criação geométrica — 0024g

O painel **Geometrias** é uma superfície visual para o comando público
`object.create.geometry`. O console e o painel não possuem implementações de
criação diferentes: ambos enviam descritor, colocação e aparência para a mesma
operação de domínio.

As famílias e seus campos vêm de `GeometryRegistry.describe()`. Cada provider
declara nome, topologia, parâmetros, valores iniciais e limites. Assim, uma
nova família registrada pode aparecer no painel sem acrescentar condicionais
à interface.

O painel inicial oferece:

- caixa, esfera, cilindro/cone, plano e polígono regular;
- nome opcional e cor hexadecimal arbitrária;
- origem tridimensional;
- orientação nativa ou planos canônicos XY, XZ e YZ;
- parâmetros próprios de cada provider.

Planos e polígonos começam no plano XZ. Sólidos preservam a orientação nativa
de sua geometria. Referenciais por normal/tangente e por três pontos continuam
disponíveis no console e serão expostos visualmente em um incremento posterior.

## Séries afins — 0024i

O painel pode criar de 1 a 100.000 objetos em uma operação atômica. A quantidade
é total: inclui a semente e todas as cópias. Os campos de translação, rotação e
escala aceitam números ou expressões da linguagem afim (`i`, `u`, `count`,
`sin`, `cos`, `pi` e demais funções permitidas).

A interface envia `object.create.geometrySeries`. A operação normaliza a
geometria, resolve o referencial, compila as expressões e calcula todas as
transformações antes de alterar o sandbox. Semente e cópias produzem um único
item de histórico; uma expressão inválida não insere objetos.

O mesmo contrato está disponível no console:

```text
create box size 1 1 1 count 20 move 2 0 0 rotate 0 5 0
create sphere radius 1 count 40 move "4*cos(i*pi/20)" 0 "4*sin(i*pi/20)"
```
