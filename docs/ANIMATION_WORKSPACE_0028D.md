# Espaço de trabalho de animação e lotes procedurais — 0028d

## Objetivo

O marco 0028d torna capacidades antes dispersas mais descobríveis sem ligar a
interface à implementação. O manifesto de UI continua decidindo quais ações
aparecem e onde os painéis começam; painéis permanecem independentes,
reposicionáveis, redimensionáveis e podem ficar abertos simultaneamente.

## Reorganização da interface

A barra principal prioriza seleção, transformação, duplicação, exclusão,
inspetor, criação, animação e modo de cena. O laboratório paramétrico permanece
disponível no menu **Explorar**. O inspetor e a animação ganham ações diretas
porque dependem da seleção corrente e formam o fluxo principal de autoria.

Essa disposição é somente a configuração padrão em
`apps/web/config/ui.default.json`. `ToolbarComposer`, `UiActionRegistry` e
`FloatingPanelManager` continuam sendo as superfícies de composição; nenhuma
regra editorial foi movida para HTML ou handlers de botão.

No refinamento 0028e, a escala uniforme já fornecida pelo eixo composto `XYZ`
do `TransformControls` ganhou um cubo central branco maior, opacidade adequada
e área de toque ampliada. A alteração é estritamente de affordance: arrastar o
cubo continua produzindo a mesma escala proporcional nos três eixos, através
da mesma sessão transacional usada pelas alças X, Y e Z.

## Inspetor coletivo

O inspetor oferece dois escopos explícitos:

- **Objetos visíveis; abrir grupos**: expande grupos aninhados e edita apenas
  descendentes renderizáveis;
- **Nós diretamente selecionados**: preserva o significado estrutural da
  seleção e permite propriedades suportadas por grupos, como transformação.

Alterações comuns e procedurais chegam à mesma `SelectionPropertyService`.
Uma expressão é compilada uma vez, avaliada para todos os alvos, normalizada e
só então publicada como um único comando `selection.properties.set`. Portanto,
uma falha intermediária não deixa edição parcial nem item de histórico.

Para distribuir cores em muitas instâncias:

```text
property batch instance.color "hsl(300*u,0.8,0.55)" scope=renderables
```

Para deformar uma seleção pela posição atual:

```text
property batch transform.position "x; y + 2*sin(tau*u); z"
```

## Animação por objeto e por faixa

O runtime continua efêmero e de passo fixo. Há dois modos de captura:

- `selection`: uma unidade por raiz; um grupo permanece rígido;
- `objects`: uma unidade por objeto renderizável; cada objeto usa seu pivô.

O painel permite animar a seleção com um preset ou compor faixas distintas.
Cada faixa armazena apenas IDs de alvo, preset e parâmetros. Ao reproduzir, o
serviço compila os programas e inicia uma única sobreposição. Alvos duplicados
ou ambíguos falham antes do primeiro quadro.

O preset **Arco-íris** e `animate color` avaliam `hsl`, `rgb` ou `mix` no
tempo, por unidade. A cor é enviada como atributo efêmero de instância; assim,
objetos geometricamente iguais continuam no mesmo lote. `stop` restaura a cor
canônica registrada no proxy do renderer.

A composição é deliberadamente temporária nesta etapa. Ela não altera o
documento, não ocupa o histórico e não é serializada. Persistência de clips,
keyframes e vínculos a eventos deve entrar por um contrato de documento futuro,
sem enfraquecer a fronteira atual.

## Desempenho e robustez

- expressões são compiladas uma vez por lote ou faixa;
- o lote procedural publica um comando atômico;
- cores por instância evitam multiplicar materiais;
- todas as faixas compartilham o mesmo relógio e overlay;
- o painel consulta status somente quando visível;
- mudança editorial restaura o renderer canônico;
- a camada matemática pura não depende mais de `three` apenas para converter
  graus em radianos.

## Testes relevantes

```text
runtime test property-contract
runtime test animation-runtime
runtime test animation-commands
runtime test animation-tracks
runtime test all
```

Os contratos cobrem expansão de grupos, atomicidade, valores procedurais,
programas distintos por objeto, captura em modo `objects`, sobreposição de
alvos, restauração e ausência de mutação editorial.
