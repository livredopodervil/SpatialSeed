# SpatialSeed 0050a — tempo analítico e execução sob demanda

**Estado:** implementação inicial integrada  
**Baseline exigido:** `main`, build `20260805-0048l1`  
**Build resultante:** `20260806-0050a`

## Objetivo

O tempo não deve obrigar o editor a recalcular ou renderizar uma cena estática.
A execução passa a ser dirigida por mudanças, dependências e eventos futuros.
Objetos sem operadores temporais não entram no scheduler. Propriedades derivadas
só são recalculadas quando alguma dependência muda.

## Invariantes implementados

1. Depois do primeiro quadro, uma cena estática não mantém um
   `requestAnimationFrame` permanente.
2. O relógio é analítico: o tempo local é obtido a partir de âncoras, sem
   incrementar todos os objetos a cada quadro.
3. Domínios temporais podem ser aninhados e suas taxas se multiplicam.
4. Operações independentes da mesma fase leem o mesmo snapshot e são avaliadas
   por `Promise.all`.
5. A ordem do merge não depende da ordem de conclusão das Promises.
6. `identity` não produz patch, versão, histórico ou renderização.
7. Uma operação registrada com `idempotent: true` converte o primeiro resultado
   identidade em ponto fixo e não volta a ser calculada até uma dependência mudar.
8. `fixed-point` remove a operação da fila até uma dependência mudar.
9. `sleep-until` não avalia a operação antes do próximo instante relevante.
10. `applyChanges(state, [])` é identidade visual.
11. Matrizes, cores e pivôs de animação iguais aos já aplicados não são enviados
    novamente ao renderer.
12. O renderer só desenha quando foi invalidado ou enquanto existe uma licença
    explícita de quadro contínuo.

## Modelo matemático

O estado global é o produto dos estados dos objetos. Uma fase temporal avalia
operadores independentes sobre o mesmo snapshot. A composição global é o produto
direto dos operadores locais. A soma aparece no gerador global quando os
operadores atuam em componentes distintos.

Cada domínio guarda:

```text
anchorParentTime
anchorLocalTime
rate
paused
revision
```

O tempo local é calculado apenas quando consultado. Para um domínio não pausado:

```text
localTime = anchorLocalTime
          + (parentTime - anchorParentTime) * rate
```

## Pacotes

### `packages/temporal-runtime`

- `EvolutionResult`: resultados `changed`, `identity`, `fixed-point` e
  `sleep-until`.
- `AnalyticTimeDomains`: relógios locais aninhados, pausa, seek, taxa e
  atribuição de alvo.
- `DependencyVersions`: versões baratas para reativar pontos fixos.
- `TemporalRuntime`: avaliação paralela por fases, prontidão causal e merge determinístico.
- `TemporalTransformGroup`: reúne as transformações de um grupo em um único
  comando, usa o tempo local do domínio e filtra saídas numericamente iguais.
- `TemporalExecutionController`: liga operações prontas ao scheduler visual, sem polling.
- `IncrementalPropertyGraph`: invalidação transitiva e cálculo preguiçoso.

### `packages/renderer-three/RenderDemandScheduler.js`

Centraliza:

- invalidação visual;
- pedido único de quadro;
- licenças de animação contínua;
- temporizadores de despertar;
- listeners de quadro;
- diagnósticos.

### `packages/animation-runtime`

O runtime de animação aceita os novos resultados de evolução. Ao receber
`fixed-point` ou `sleep-until`, libera a licença de quadros. Resultados identidade
não chamam `applyAnimationFrame`.

## Grupos de transformação

Um grupo temporal pode ser registrado por uma extensão sem criar um callback por
objeto. A função do grupo recebe um único tempo local e retorna todas as
transformações que devem ser confirmadas conjuntamente:

```js
import {
  createTemporalTransformGroupOperation
} from "./packages/temporal-runtime/src/index.js";

temporalRuntime.register(createTemporalTransformGroupOperation({
  id: "orbitas-lentas",
  timeDomainId: "slow",
  dependencyIds: ["world", "object:sol:position"],
  evaluate: ({ t, snapshot }) => ({
    transforms: calculateGroupTransforms(snapshot, t)
  })
}));
```

O resultado é um único comando `selection.transform`. Dois grupos podem usar os
mesmos instantes globais e receber tempos locais diferentes. A composição global
é o merge determinístico das operações dos grupos. Se a lista normalizada for
igual à última confirmação, nenhum comando, histórico, atualização de buffer ou
renderização é produzido.

Para uma transformação projetiva ou normalização que se torna estável, registre
`idempotent: true` ou retorne `result.fixedPoint()`. Depois da primeira identidade,
a operação só volta a ser calculada quando uma dependência declarada mudar.

## Comandos públicos

```text
time.domain.create
time.domain.delete
time.domain.rate.set
time.domain.pause
time.domain.resume
time.domain.seek
time.domain.parent.set
time.target.assign
time.dependency.bump
time.operation.wake
time.operation.enable
time.operation.domain.set
time.execution.retry
```

Nesta primeira etapa, domínios e atribuições são estado transitório do runtime do
viewer. Não são gravados no documento do projeto e, por isso, os comandos estão
marcados como `mutates: false`.

Exemplo:

```text
runtime time.domain.create {"id":"slow","rate":0.25}
runtime time.target.assign {"targetId":"box-1","domainId":"slow"}
runtime query time.domain {"id":"slow"}
```

## Consultas públicas

```text
time.status
time.domains
time.domain
time.target.domain
time.operation
time.execution
time.render-demand
```

`time.render-demand` permite confirmar que, durante repouso, não há quadro
pendente nem licença contínua.

## Dependências automáticas

Mudanças confirmadas pelo sandbox incrementam apenas identificadores baratos,
sem percorrer ou comparar buffers de geometria. O runtime emite, conforme os
dados disponíveis no delta:

```text
world
world:revision
object:<id>
object:<id>:exists
object:<id>:transform
object:<id>:position
object:<id>:rotation
object:<id>:scale
object:<id>:<propriedade-superior>
```

Mudanças de seleção e do estado do editor incrementam, respectivamente,
`selection` e `editor`. Operadores em ponto fixo declaram somente as dependências
que realmente observam. Assim, uma alteração em `object:a:position` não desperta
um operador que depende apenas de `object:c:material`.

A comparação das propriedades superiores usa identidade de referência já
presente no delta; arrays de vértices, normais, UVs e índices não são
serializados nem percorridos para decidir o despertar. A recomputação detalhada
continua responsabilidade do grafo incremental do subsistema afetado.

## Semântica de resultados

### Identidade

A operação foi consultada e nada mudou neste instante. Por padrão, ela pode
voltar a mudar no próximo instante e continua elegível enquanto houver demanda
contínua. Quando o registro declara `idempotent: true`, a identidade é tratada
como ponto fixo: o runtime não a consulta novamente até mudar uma dependência
declarada.

### Ponto fixo

A operação chegou a um estado que não muda até uma dependência ser alterada. O
scheduler deixa de consultá-la.

### Dormir até

A operação declara o próximo tempo local relevante. Nenhum polling ocorre antes
desse instante.

### Mudança

A operação retorna patches e eventos. Somente patches reais devem avançar
versões e invalidar consumidores.

## O que esta etapa ainda não faz

- persistir domínios temporais no formato do projeto;
- oferecer painel de edição de domínios no HUD;
- propagar dependências profundas além das propriedades superiores do objeto;
- substituir todos os cálculos derivados antigos pelo grafo incremental;
- executar física ou procedimentos como operadores temporais nativos;
- permitir múltiplas sobreposições de animação simultâneas no renderer atual.

Esses pontos permanecem extensões posteriores. O núcleo e o renderer já deixam
de exigir um loop visual permanente. Extensões recebem `timeDomains`,
`temporalDependencies`, `temporalRuntime` e `temporalExecution` no contexto de
ativação. Uma operação registrada passa a ser executada automaticamente quando
estiver pronta; pontos fixos e operações adormecidas não mantêm quadros ativos.

Nesta etapa, cada mudança temporal é um comando normal do reducer, ou um objeto
`{ command }`. Os comandos do mesmo ciclo são confirmados em ordem determinística,
mas ainda podem produzir entradas separadas no histórico. Operações que precisam
de uma única entrada atômica devem retornar um comando agregado, como
`selection.transform` com todos os objetos do grupo.

## Testes

```bash
node tools/test_event_driven_temporal_runtime.mjs
node tools/test_animation_runtime_event_driven.mjs
python3 tools/audit_event_driven_temporal_runtime.py
```

Os testes verificam repouso visual, domínios aninhados, continuidade temporal,
grafo incremental, identidade, ponto fixo, `sleep-until`, snapshot comum, merge
determinístico, despertar por dependência e execução automática sem polling.

## Critério manual de repouso

Abra o editor, não mova a câmera e não execute animações. No console:

```text
runtime query time.render-demand
```

Depois do primeiro quadro, o resultado esperado contém:

```json
{
  "dirty": false,
  "framePending": false,
  "continuousLeaseCount": 0
}
```

`processedFrames` e `renderedFrames` não devem crescer enquanto o editor
permanece estático.
