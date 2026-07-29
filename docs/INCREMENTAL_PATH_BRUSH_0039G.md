# Pincel causal, commit incremental e cor paramétrica — 0039g/0039g1

## Objetivo

O `0039g` estabiliza o pincel afim do `0039f`. Estender um gesto não redefine
as geometrias que já foram aceitas: cada cópia conserva sua transformação e sua
cor, enquanto somente novas amostras e uma pequena cauda sujeita à curvatura
são reparadas.

O gesto também passa a produzir um plano de commit completo durante o
movimento. Soltar o ponteiro publica esse plano em um único comando e um único
undo, sem reconstruir a trajetória, reavaliar todas as expressões ou clonar
novamente toda a fonte. O preview permanece visível por dois quadros durante a
passagem para o renderer autoritativo.

## Correção de integração e custo passivo — 0039g1

O `0039g1` corrige uma regressão que aparecia principalmente com **Persistir
ferramenta** habilitado. Depois do primeiro gesto, o pincel ainda guardava a
revisão anterior da cena. O preview conseguia continuar usando o lote
capturado, mas o commit seguinte era rejeitado como obsoleto; editar um
parâmetro recapturava a fonte e parecia “destravar” a ferramenta.

Ao concluir uma publicação própria e aditiva, o controlador agora avança
somente a revisão da captura. Geometria, matrizes-fonte, materiais e
`InstancedMesh` conservam as mesmas referências. Se outra edição tiver alterado
a cena ou a fonte selecionada, a captura é refeita de forma explícita.

O encerramento também passa a distinguir pedido enfileirado de publicação
observável. Em uma réplica coordenada, o preview permanece visível e o
controlador fica em estado `committing` até todos os IDs criados aparecerem no
sandbox local. Rejeições são exibidas sem ocultar silenciosamente o traço.
Observadores de sandbox e coordenação são removidos ao aceitar, rejeitar,
cancelar ou descartar o controlador.

O caminho de entrada do modo `array` não executa simplificação ou Chaikin
globais em cada movimento. Os pontos aceitos chegam causalmente ao plano
incremental; somente a cauda definida pela curva pode ser reparada.

Para impedir que objetos passivos encareçam ferramentas e seleção:

- o `Sandbox` mantém índices por ID atualizados em create, update, histórico,
  rebase e recuperação;
- validação de IDs preparados e hierarquia nova consulta o índice e somente o
  lote entrante;
- referências espaciais são descritas uma vez e atualizadas pelas mudanças do
  sandbox antes de qualquer HUD;
- HUD e workspace consultam apenas os IDs selecionados no caminho quente;
- listas DOM de referência são preservadas na troca de ferramenta e recebem
  somente as opções acrescentadas;
- notificações equivalentes de editor e lifecycle são coalescidas;
- pedidos repetidos de ajuste do HUD compartilham um único frame pendente.

O trabalho de confirmar continua proporcional à quantidade **nova** de
objetos, como deve ser. Ele deixa de ser proporcional também à quantidade de
objetos passivos já presentes.

## Progresso causal

No pincel desenhado, `u` deixa de depender da quantidade final:

```text
u = d / affineULength
```

`d` é a distância acumulada da cópia e `affineULength` é o comprimento mundial
correspondente a `u=1`. Portanto, acrescentar caminho não altera o `u` das
cópias anteriores. Para padrões periódicos, use `fract(u)`, `sin(tau*u)` ou
outra função cíclica.

`count` e `length` continuam disponíveis para a cauda calculada no quadro
atual, mas uma cópia que já entrou no prefixo estável não é reavaliada apenas
porque esses valores cresceram. Alterar explicitamente um campo do pincel
invalida o plano e recalcula o preview inteiro, pois isso representa uma nova
intenção do usuário.

## Prefixo estável e cauda reparável

Cada plano registra matrizes, cores, frames locais e rascunhos persistentes por
cópia. Ao receber mais pontos, o serviço reutiliza o prefixo congelado e
recalcula apenas uma janela final:

| Curva | Cópias reparáveis na cauda |
| --- | ---: |
| polilinha | 2 |
| Catmull–Rom | 4 |
| Bézier | 6 |

A janela permite que tangente, normal e curvatura se acomodem perto da ponta
`b` sem fazer objetos antigos “respirarem” ao longo de todo o traço. O
`PathInstancePreviewCache` conserva os mesmos `InstancedMesh` e só escreve
matrizes ou cores cujo valor mudou.

Em caminhos abertos e sem `twistDegrees`, posição, tangente e frame também são
amostrados apenas a partir da cauda. Caminhos fechados e torção total conservam
a rota de frames integral, pois fechamento de seam e torção normalizada criam
dependência global real; ainda assim, matrizes, cores e rascunhos do prefixo
permanecem reutilizados.

## Plano de commit incremental

O resultado de `previewArrayBrush()` é um plano imutável emitido pelo próprio
`PathToolService`. Ele contém:

- pontos preparados e metadados do caminho;
- matrizes e cores validadas;
- amostras com `i`, `u`, distância, curvatura e frame;
- transformações já decompostas para fontes do catálogo;
- subárvores já clonadas e transformadas para fontes selecionadas;
- diagnósticos de cópias reutilizadas, avaliadas e preparadas.

Novas cópias lógicas são preparadas durante o gesto. O comando final aceita
somente um plano emitido pelo mesmo serviço e cuja revisão e fonte ainda sejam
as capturadas ao armar a ferramenta. Isso conserva a fronteira de segurança sem
repetir a validação geométrica completa no `pointerup`.

O commit ainda precisa publicar os objetos no documento — trabalho inevitável
e proporcional à quantidade criada —, mas o preview não é ocultado durante
essa publicação. Depois do comando, ele permanece latente por dois
`requestAnimationFrame`, cobrindo a troca visual sem piscar.

## Cor paramétrica e escala negativa

O campo `affineColor` aceita uma pequena linguagem declarativa, compilada pela
mesma AST segura das expressões afins:

```text
source
#3366aa
hsl(360*fract(u), 0.8, 0.55)
rgb(32*i, 96, 220)
mix(source, #ffffff, fract(u))
invert(source)
```

Em `hsl`, matiz usa graus e saturação/luminosidade usam valores de 0 a 1. Em
`rgb`, os canais usam 0 a 255. O resultado é armazenado como cor individual da
instância e continua compatível com os lotes instanciados do renderer.

`affineScale` continua uniforme para preservar TRS e hierarquias. Valores
negativos usam o módulo como tamanho e invertem os canais RGB da cor avaliada.
O valor zero é limitado internamente a `0.000001`, evitando matriz singular sem
interromper o gesto.

Parâmetros do provider que alteram topologia — segmentos, contornos, furos e
resolução — permanecem comuns ao pincel inteiro. Variá-los por cópia exigiria
geometrias distintas e quebraria o compartilhamento de um único
`InstancedMesh`. Dimensões visuais por cópia continuam expressáveis por escala;
variantes topológicas deverão usar protótipos ou lotes discretos em um
incremento posterior.

## Console

```text
path draw mode=array source=catalog geometry=sphere params={"radius":0.4,"widthSegments":18,"heightSegments":9} spacing=0.5 orientation=plane uLength=2 rotateZ=90*u scale=0.5-u colorExpr=hsl(120*u,1,0.5)

path draw mode=array source=selection spacing=auto orientation=path uLength=1 moveZ=0.1*sin(tau*u) colorExpr=mix(source,#ffffff,fract(u))
```

## Validação

```text
runtime test tool-parameters
runtime test path-references
runtime test edit-context
runtime test affine-repeat
runtime test all
```

As provas específicas verificam prefixo byte a byte estável, reparo limitado da
cauda, reutilização do rascunho lógico, rejeição de planos forjados, cor no
preview e no documento, escala negativa, identidade dos meshes, ausência de
novo cálculo no `pointerup`, handoff visual de dois quadros e um único undo.

O `0039g1` acrescenta provas de dois traços consecutivos com a ferramenta
persistente, publicação local e coordenada, handoff de tubo pelo ID criado,
remoção de observadores, cache incremental de referências, índice do sandbox e
uma única notificação observável por troca de ferramenta.

Uma microprova sintética em Node.js 24 comparou oito previews crescentes até
512 esferas, com rotação, escala sinalizada e cor HSL, após aquecimento e em 21
amostras. Em três repetições finais, o plano incremental ficou entre `2,54×` e
`2,58×` mais rápido que reconstruir todos os previews. Publicar o plano de
catálogo já preparado ficou entre `2,51×` e `2,63×` mais rápido que recalcular e
publicar no mesmo passo; com 256 cópias de uma subárvore selecionada de dois
nós, o ganho ficou entre `2,89×` e `3,02×`. A medição demonstra a diferença
algorítmica nesses cenários; não substitui o teste de percepção e de frame time
no Chrome Android.

Uma segunda microprova comparou o `0039g` e o `0039g1` no mesmo executor. O
ciclo sintético de ferramenta + consulta de seleção + referências mediu
`6,910 ms` com 512 objetos e `54,233 ms` com 4.096 objetos no `0039g`; no
`0039g1`, mediu respectivamente `0,480 µs` e `0,582 µs`. A publicação de 64
cópias já preparadas mediu `2,095 ms` e `15,754 ms` no `0039g`, contra
`1,311 ms` e `1,655 ms` no `0039g1`. Esses números isolam CPU e complexidade
algorítmica em Node.js; DOM, GPU e percepção ainda exigem validação no aparelho.

## Roteiro visual

1. Use uma esfera de catálogo, espaçamento `0.5`, `uLength=2`,
   `rotateZ=90*u` e `colorExpr=hsl(120*u,1,0.5)`.
2. Desenhe lentamente e confirme que objetos antigos não mudam quando a ponta
   avança; apenas os últimos elementos podem ajustar a orientação em curva.
3. Use `scale=0.5-u`; após `u=0.5`, confirme o crescimento pelo módulo e a
   inversão de cor, sem erro.
4. Solte sobre um traço longo e confirme que o preview não desaparece antes do
   resultado persistente.
5. Desfaça uma vez e confirme que todo o gesto é removido.
6. Ative **Persistir ferramenta**, produza dois traços seguidos sem alterar
   parâmetros e confirme que ambos permanecem, cada um com um único undo.
7. Com milhares de objetos passivos, alterne seleção, rotação e escala e
   confirme que a troca de ferramenta não acompanha o tamanho da cena.
