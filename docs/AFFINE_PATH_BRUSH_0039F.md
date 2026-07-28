# Parâmetros geométricos e pincel afim — 0039f

## Objetivo

O `0039f` completa a configuração do pincel progressivo introduzido no
`0039e`. Uma geometria do catálogo deixa de ser apenas um tipo com parâmetros
padrão: o workspace expõe o schema inteiro do provider, conserva o descritor
normalizado e aplica suas mudanças ao preview ativo.

O mesmo pincel também recebe um referencial de orientação e um modificador afim
paramétrico. Assim, uma sequência pode variar posição local, rotação e escala à
medida que novas instâncias aparecem, sem recriar geometria, material ou
`InstancedMesh`.

## Geometria configurável

Ao escolher **Catálogo de geometrias**, a seção **Parâmetros da geometria do
pincel** é construída a partir de `GeometryRegistry.describe()`. São aceitos os
tipos publicados pelos providers:

- número e inteiro;
- vetor 3D e vetor 3D inteiro;
- booleano e enum;
- JSON para contornos, pontos, furos e outras estruturas compostas.

Cada alteração válida grava `sourceGeometry` junto de `geometryType`. O provider
continua sendo a autoridade de normalização e validação. Trocar o tipo invalida
o descritor anterior e recupera os padrões do novo provider até que seus campos
sejam alterados.

Exemplo no console:

```text
path draw mode=array source=catalog geometry=sphere params={"radius":0.4,"widthSegments":18,"heightSegments":9} spacing=0.75
```

`params` exige `geometry` na mesma execução para impedir que parâmetros sejam
aplicados silenciosamente ao provider errado.

O descritor geométrico é compartilhado por todas as instâncias do gesto.
Expressões não alteram segmentos, contornos ou topologia por instância, pois
isso exigiria geometrias diferentes e quebraria o único `InstancedMesh`.
Variações por elemento atuam na transformação afim; por exemplo, variar o raio
visual de uma esfera usa `scale`, mantendo o mesmo asset geométrico.

## Referenciais de orientação

O campo **Referencial** separa a orientação inicial da variação afim:

| Valor | Semântica |
| --- | --- |
| `preserve` | conserva a orientação da fonte no primeiro ponto e transporta sua variação ao longo do caminho; é o comportamento compatível com `0039e` |
| `plane` | o eixo local X acompanha o traço, Y permanece lateral e Z é a normal do plano de desenho |
| `path` | o eixo local Z acompanha a tangente; X e Y usam o frame de transporte paralelo |

Para uma seleção ou grupo já girado, `plane` e `path` removem a rotação mundial
da raiz de referência antes de aplicar o novo frame. Orientações relativas dos
filhos permanecem intactas. Quando há várias raízes, a primeira raiz canônica é
o referencial comum.

`twistDegrees` continua sendo uma torção total ao longo do caminho. A rotação
afim é aplicada depois do frame e usa seus eixos locais.

## Modificador afim

Os sete campos aceitam números ou expressões da linguagem segura
`spatialseed-math-v1`:

```text
affineMoveX
affineMoveY
affineMoveZ
affineRotateX
affineRotateY
affineRotateZ
affineScale
```

Rotações usam graus. A escala é uniforme e precisa permanecer positiva. Essa
restrição conserva a representação TRS do documento e evita cisalhamento
implícito em grupos com transformações próprias.

Exemplos:

```text
path draw mode=array orientation=plane rotateZ=360*u scale=0.5+u
path draw mode=array orientation=path moveZ=0.1*sin(i*pi/2)
path draw mode=array rotateZ=45*i scale=1+0.15*sin(2*pi*u)
```

### Variáveis

| Símbolo | Valor |
| --- | --- |
| `i`, `index` | índice da instância, começando em 1 |
| `u` | progresso normalizado, de 0 a 1, calculado com a quantidade atual |
| `count` | quantidade atual produzida pelo comprimento do traço |
| `d`, `distance` | distância acumulada da instância |
| `length`, `pathLength` | comprimento atual do caminho |
| `spacing` | espaçamento efetivo |
| `k`, `curvature` | estimativa local de curvatura em radianos por unidade |
| `x`, `y`, `z` | posição mundial da amostra |
| `tx`, `ty`, `tz` | tangente unitária |
| `nx`, `ny`, `nz` | normal unitária do frame |
| `bx`, `by`, `bz` | binormal unitária do frame |

Constantes (`pi`, `e`, `tau`, `phi`, `deg`, `rad`, `turn`) e funções
matemáticas da linguagem afim continuam disponíveis. O compilador usa AST
validada, sem `eval`, e rejeita símbolos que não pertencem ao contexto do
pincel.

`u`, `count`, `length` e qualquer expressão que dependa deles são reavaliados
quando o traço cresce. Portanto, instâncias anteriores podem mudar de
transformação em tempo real, enquanto suas posições amostradas e os recursos
Three.js permanecem os mesmos.

## Ordem de composição

Para a amostra `i`, a transformação do pincel segue:

```text
T(amostra) · R(referencial) · A(i,u,...) · R(base)⁻¹ · T(-pivô)
```

`A` é a matriz produzida pelas expressões. No modo `preserve`, `base` é o
primeiro frame do caminho. Nos modos `plane` e `path`, `base` é a rotação
mundial capturada da fonte.

## Preview, falhas e histórico

- as expressões são compiladas ao armar a ferramenta ou ao editar um campo;
- entradas afins válidas atualizam o preview enquanto o campo é digitado;
- uma expressão sintaticamente inválida não substitui a última configuração
  válida;
- geometrias, materiais e meshes só são reconstruídos se a fonte ou seu
  descritor mudar;
- mudar apenas a expressão reescreve matrizes no mesmo `InstancedMesh`;
- expressões neutras (`move=0`, `rotate=0`, `scale=1`) usam a rota rápida e não
  são avaliadas por instância;
- soltar confirma um único comando e um único undo.

## Validação

```text
runtime test tool-parameters
runtime test path-references
runtime test edit-context
runtime test affine-repeat
runtime test all
```

As provas específicas cobrem descritor geométrico não padrão, persistência,
console, rejeição de símbolo desconhecido, reavaliação de `u`, orientação em
planos mundiais, compensação da rotação de uma fonte selecionada, identidade
dos meshes durante edição ao vivo e commit atômico.

Uma microprova sintética em Node.js 24 executou 64 previews crescentes, de 8 a
512 instâncias, após aquecimento e em 31 amostras. A mediana do `0039e` neutro
foi `13,699 ms`; a rota neutra do `0039f` ficou em `13,543 ms`. Com translação
senoidal, rotação por `u` e escala progressiva, o ciclo inteiro ficou em
`147,133 ms`, média de `2,30 ms` por preview. Esses números validam o caminho
algorítmico e a ausência de penalidade neutra mensurável nesse cenário; a prova
visual no Chrome Android continua obrigatória.

## Roteiro visual

1. Abra **Pincel de geometrias** e **Catálogo de geometrias**.
2. Escolha esfera, altere raio e segmentos e confirme a mudança imediata do
   preview.
3. No plano mundial XZ, escolha `plane`; confirme que a geometria permanece no
   plano e que `rotateZ=360*u` gira ao redor da normal.
4. Troque para `path`; confirme que o Z local acompanha a tangente.
5. Durante o traço, edite `scale` para `0.4+0.8*u`; confirme que objetos já
   visíveis também mudam, sem piscar ou recriar o lote.
6. Use uma seleção previamente girada como fonte e compare `preserve` com
   `plane`.
7. Solte e confirme que um único undo remove todo o resultado.
