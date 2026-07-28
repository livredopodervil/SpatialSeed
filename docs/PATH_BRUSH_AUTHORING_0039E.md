# Pincel progressivo por caminho — 0039e

> O `0039f` acrescenta parâmetros completos do provider, orientação relativa ao
> plano/caminho e expressões afins interativas. Consulte
> [Parâmetros geométricos e pincel afim — 0039f](AFFINE_PATH_BRUSH_0039F.md).

## Objetivo

O `0039e` substitui a quantidade predeterminada do desenho distributivo por
espaçamento. Conforme o traço aumenta, novas instâncias aparecem a cada
distância acumulada. O desenho de tubo permanece disponível e conserva sua
última configuração.

Ferramenta, estilo e fonte ficam explícitos:

- `tube` produz um tubo contínuo pelo caminho;
- `array` usa a seleção atual ou uma geometria do catálogo como pincel;
- `inputSamplePixels` controla somente a amostragem do gesto na tela;
- `spacingMode=auto` deriva a distância das dimensões mundiais da fonte;
- `spacingMode=world` usa uma distância informada em unidades do mundo.

`count` permanece válido para distribuir sobre um caminho já existente com
`path array`. Ele não controla mais o pincel desenhado.

## Amostragem progressiva

Se `s` é o espaçamento positivo e `L` é o comprimento atual do traço, um
caminho aberto produz amostras nas distâncias `0, s, 2s, ...` menores ou iguais
a `L`. Estender o caminho não redistribui as posições anteriores.

Os frames continuam usando transporte paralelo e podem alinhar cada instância
à tangente e aplicar torção total. A confirmação aceita no máximo 10.000
posições; o preview limita o total de matrizes alocadas a 4.096, repartidas
entre os elementos renderizáveis do pincel.

## Cache do preview

Ao armar o pincel, `PathToolService.captureArrayBrush()` resolve uma única vez:

- raízes selecionadas ou descritor do catálogo;
- descendentes renderizáveis;
- geometrias normalizadas;
- matrizes mundiais;
- pivô da fonte;
- dimensão usada pelo espaçamento automático.

`PathInstancePreviewCache` cria um `InstancedMesh` por combinação compatível de
geometria e cor. Geometria, material e mesh permanecem vivos durante todo o
gesto. Em cada quadro, somente matrizes novas ou realmente alteradas são
escritas; matrizes idênticas são ignoradas. O status
`path.sketch.status().previewResources` expõe capacidades, IDs dos meshes e
contadores de criação e atualização.

O painel de edição recebe atualizações leves de contador durante o gesto. Uma
mudança entre estado ativo e inativo ainda dispara a atualização estrutural
completa.

## Confirmação e instancing

Uma fonte selecionada preserva a hierarquia e os transforms locais de cada
subárvore. Uma fonte do catálogo cria objetos lógicos independentes com o mesmo
descritor geométrico e aparência. Nos dois casos:

- cada elemento possui ID e continua selecionável;
- o renderer os agrupa em `THREE.InstancedMesh`;
- um único `selection.duplicate` confirma o lote;
- um único undo remove todo o gesto;
- preview, pontos intermediários e cache não entram no documento.

O documento atual ainda contém descritores por objeto. A compactação persistente
em protótipo + instâncias leves e o copy-on-write de geometria continuam como
uma migração própria do modelo de mundo; não foram simulados dentro do
renderer.

## Preferências e migração

Os parâmetros passam para:

```text
spatialseed.edit.tool-parameters.v2
```

Na primeira abertura, o registro `v1` é lido e migrado. `spacingPixels` torna-se
`inputSamplePixels`; raio, segmentos, curva, cor, suavização e demais valores
continuam associados a `path.sketch`, enquanto tubo por referência permanece
independente em `path.tube`. O registro antigo não é apagado. Registros de
versão futura permanecem somente leitura.

## Console

```text
path draw mode=tube radius=0.12 curve=polyline plane=world-xy
path draw mode=array source=selection spacing=auto align=on twist=0
path draw mode=array source=catalog geometry=torus spacing=0.75 brushColor=#6699cc
```

Para ajustar a fluidez da captura:

```text
path draw sample=4
```

## Validação

```text
runtime test tool-parameters
runtime test path-references
runtime test edit-context
runtime test affine-repeat
runtime test all
```

As provas específicas verificam migração sem apagamento, todos os providers do
catálogo, fontes hierárquicas, posições estáveis por distância, mesh de preview
reutilizado, redução de notificações, ausência de histórico durante o gesto e
commit atômico.

Um benchmark sintético em Node.js 24, Linux x64, com esfera de baixa resolução,
64 quadros e crescimento até 512 cópias mediu mediana de `21,213 ms` para
recriar recursos por quadro e `6,478 ms` para o cache, aceleração de `3,27×`.
Esse resultado compara o caminho algorítmico, não substitui a medição no Chrome
Android no mesmo aparelho e cenário.

## Roteiro visual móvel

1. Escolha **Tubo contínuo**, altere raio e cor, desenhe e confirme que o painel
   não engasga durante o arraste.
2. Selecione um objeto ou grupo, escolha **Pincel de geometrias** e
   **Automática pelo tamanho**. Confirme que novas instâncias aparecem conforme
   o traço avança.
3. Repita com **Distância no mundo** e compare densidades.
4. Escolha **Catálogo de geometrias**, altere o tipo e desenhe sem criar antes
   um objeto-fonte.
5. Cancele com `Esc` e confirme que o histórico não mudou.
6. Conclua um gesto e confirme que um único undo remove todo o lote.
