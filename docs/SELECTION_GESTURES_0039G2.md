# Gestos de seleção cacheados — 0039g2

## Objetivo

O `0039g2` acrescenta quatro gestos no viewer:

- retângulo;
- pincel;
- laço;
- borracha.

Eles operam tanto sobre objetos quanto sobre vértices, arestas ou faces da
sessão de malha ativa. A operação atual — substituir, adicionar, remover ou
alternar — continua valendo para os três gestos de seleção.

## Captura e custo passivo

Durante `pointermove`, a interface apenas acrescenta pontos coalescidos a uma
lista compacta, com distância mínima de dois pixels. Nenhum objeto, lote,
hierarquia ou componente é consultado nesse caminho.

Ao soltar, o renderer projeta os alvos e constrói um índice em células de 64
pixels. A chave inclui:

- revisão da cena;
- matriz da câmera;
- projeção;
- tamanho da viewport;
- quadro de animação, quando houver animação ativa.

Enquanto essa chave permanece igual, os próximos gestos reutilizam o mesmo
índice. Pincel e borracha testam o traço contra os limites projetados do objeto;
retângulo e laço conservam a seleção pelo centro projetado. Grupos são
resolvidos para sua unidade selecionável e IDs repetidos são removidos antes do
comando.

Uma microprova sintética no mesmo executor mediu a consulta quente de uma
pincelada curta:

| Entradas | Construção fria | Consulta quente mediana | Candidatos testados |
| ---: | ---: | ---: | ---: |
| 32 | 0,292 ms | 6,129 µs | 16 |
| 4.096 | 1,480 ms | 4,927 µs | 16 |
| 65.536 | 14,104 ms | 7,791 µs | 16 |

A construção fria é deliberadamente proporcional à cena e só ocorre quando a
projeção fica obsoleta. A consulta quente depende das células tocadas, não do
total de objetos passivos. Os números isolam CPU em Node.js e não substituem a
medição visual no Chrome Android.

## Atomicidade

Seleção não altera o documento e não cria entrada de undo. A borracha resolve
todos os alvos antes de mutar:

- em modo objeto, envia uma única `selection.delete`, incluindo descendentes de
  grupos, para o histórico global;
- em modo de componentes, faz uma única exclusão topológica no histórico local
  da sessão de malha.

Nenhuma exclusão é emitida durante o movimento. Listeners temporários de
`pointermove`, `pointerup` e `pointercancel` são removidos ao concluir ou
cancelar.

## Superfícies

Os quatro modos estão na barra, no HUD contextual e no workspace **Editar**. O
workspace também expõe o raio, entre 2 e 128 pixels. O console usa a mesma
superfície de comando:

```text
select gesture rectangle
select gesture brush 36
select gesture lasso
select gesture eraser 28
select gesture off
```

## Validação

```text
runtime test selection-ui
runtime test path-references
runtime test instance-batches
runtime test all
```

Roteiro visual:

1. Ative **Persistir ferramenta**, desenhe um traço, desfaça e desenhe outro sem
   alterar geometria ou parâmetros.
2. Use `colorExpr=hsl(240-120*u,1,0.5)` com caixa, esfera, cilindro, plano e
   polígono; confirme a mesma progressão visual.
3. Selecione objetos com pincel e laço usando adicionar/remover/alternar.
4. Passe a borracha sobre vários objetos e confirme que um único undo restaura
   todos.
5. Entre em edição de malha, apague componentes com a borracha e use o undo
   local da sessão.
6. Com milhares de objetos estáticos, desenhe vários gestos e confirme que a
   movimentação permanece fluida.
