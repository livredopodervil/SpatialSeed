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
