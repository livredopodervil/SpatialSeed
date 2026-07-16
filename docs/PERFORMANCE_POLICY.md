# Política de desempenho e regressão

> Política P0. Auditada em 16 de julho de 2026. Esta política define como medir
> e interpretar; não transforma números históricos de aparelhos diferentes em
> promessa universal.

## 1. Objetivos

O SpatialSeed deve permanecer responsivo e previsível conforme crescem objetos,
hierarquia, assets e programas. Otimização só é aceita quando preserva a
semântica de comandos, undo/redo, atomicidade, determinismo e separação entre
modelo e renderer.

As perguntas de desempenho são:

1. qual operação ficou mais cara;
2. como o custo escala com a entrada;
3. a mudança é tempo, memória, arquivo, GPU ou quantidade de recursos;
4. a diferença excede a variância do ambiente;
5. a comparação usa o mesmo commit, cenário e protocolo;
6. a otimização muda comportamento observável.

## 2. O que não é benchmark

- duração de `runtime test all`;
- sensação de uma única execução;
- comparação entre aparelhos sem normalização;
- melhor valor escolhido entre muitas tentativas;
- screenshot de FPS sem cenário e janela definidos;
- tempo de download de rede misturado com execução;
- cache quente comparado a cache frio sem declaração.

Testes de correção podem conter watchdog amplo, mas ele não é linha de base.

## 3. Instrumentos existentes

### 3.1 `benchmark scene`

```text
benchmark scene [objetos] [amostras] [transformados]
benchmark history
benchmark compare
benchmark clear
```

Defaults: 1.000 objetos, 5 amostras e 100 transforms. Limites atuais:

| Parâmetro | Mínimo | Máximo |
| --- | ---: | ---: |
| objetos | 1 | 100.000 |
| amostras | 1 | 50 |
| transforms | 1 | 100.000, limitado à cena |

O benchmark usa sandbox isolado e não altera a cena ativa.

Métricas:

| Métrica | O que mede hoje |
| --- | --- |
| `createSceneMs` | criação em memória de caixas legadas |
| `constructSandboxMs` | Region + Sandbox vazios |
| `replaceStateMs` | clones, troca de estado, base limpa e notificação |
| `cloneStateMs` | `Sandbox.getState()` via `structuredClone` |
| `transformOneMs` | dispatch de um transform |
| `transformBatchMs` | dispatch de lote até `transformCount` |
| `undoMs` | restauração por referência do estado anterior |
| `redoMs` | reaplicação do reducer |
| `stringifyMs` | `JSON.stringify` de documento schema 1 sintético |
| `validateMs` | parse JSON + validação do projeto sintético |

Cada resumo contém `min`, mediana, média, máximo e p95. O percentil é
interpolado linearmente na posição `(n-1)*p`.

Limitações atuais:

- não há fase de warm-up automática;
- medições ocorrem em sequência no mesmo event loop;
- cenário contém apenas caixas sem textura, grupo ou instancing documental;
- documento é schema 1, não mede grafo de assets schema 2;
- histórico fica somente em memória, máximo 20 resultados;
- `compare` usa o último resultado anterior com mesmo tipo, objetos e
  transforms, mas não exige mesma quantidade de amostras ou plataforma;
- `serializedBytes` pertence à última amostra.

### 3.2 Métricas da fachada runtime

`SpatialSeedRuntime` mede comandos e queries com `performance.now()` e conserva
até 2.048 amostras por série. O snapshot informa amostras, total, média,
mediana, p95 e máximo. Aqui o p95 usa nearest-rank, diferente da interpolação de
`BenchmarkStatistics`.

Essas métricas ajudam diagnóstico em uso real, mas incluem o trabalho do
comando e podem sofrer viés pela sequência da sessão.

### 3.3 Benchmark da API

```text
runtime benchmark api [iterações]
```

Ele aquece 256 pares de chamadas e compara chamada direta ao registro com
`SpatialSeedRuntime.execute()` sobre um noop. Informa tempo direto, tempo da
fachada, diferença, microssegundos por chamada e razão.

Como o comando é noop, a razão enfatiza custo fixo. Não extrapole a razão para
comandos reais mais caros.

### 3.4 Auditoria de recursos

```text
runtime resources
```

Recursos, lotes, materiais, texturas, referências, caches e Base64 devem ser
analisados junto ao tempo. Uma operação pode manter tempo estável e ainda
duplicar memória ou arquivo.

## 4. Relógio

Medições no navegador DEVEM usar `performance.now()`, cujo relógio é monotônico
dentro da mesma origem temporal. `Date.now()` pode servir para IDs/timestamps,
mas não para duração de benchmark.

Precisão observada não equivale a exatidão: navegador pode reduzir resolução,
e operações muito curtas devem ser repetidas em lote.

## 5. Registro obrigatório

Toda linha de base comparável DEVE registrar:

```text
dateTime:
timezone:
commit:
branch:
build:
dirtyWorktree:
deviceModel:
cpu/chipset (se conhecido):
ram (se conhecida):
os/version:
browser/version:
mode: aba | PWA | local
origin: localhost | Pages | offline
power: bateria | carregando
thermalState/observação:
backgroundApps/observação:
scenario:
parameters:
warmup:
independentRuns:
rawResults:
notes:
```

Sem commit, build, aparelho, navegador e parâmetros, o resultado é diagnóstico,
não baseline.

## 6. Protocolo padrão para Android

1. feche sessões antigas do app;
2. confirme build e commit;
3. deixe o aparelho estabilizar termicamente;
4. registre se está carregando e nível aproximado de bateria;
5. evite download, gravação de tela e apps pesados em segundo plano;
6. abra a mesma modalidade em todas as rodadas;
7. execute uma rodada de warm-up e descarte-a;
8. execute ao menos 10 amostras por benchmark de cena;
9. repita o conjunto em pelo menos 3 novas cargas da página quando a decisão for
   importante;
10. conserve todos os resultados, não apenas o melhor;
11. repita a baseline e o candidato intercalados quando possível;
12. espere resfriamento se a tendência piorar a cada rodada.

Como o histórico atual some ao recarregar, copie JSON bruto para um arquivo de
evidência até existir persistência automática.

## 7. Cenários canônicos

### 7.1 Estado básico

```text
benchmark scene 100 10 100
benchmark scene 1000 10 100
benchmark scene 5000 10 100
```

O primeiro evidencia custo fixo; os demais revelam inclinação. Use 10.000 ou
mais apenas quando memória e temperatura permitirem.

### 7.2 Propriedades

Medir separadamente:

- alteração de cor compartilhada;
- cor por instância em 1.000 e 10.000 objetos;
- texture transform sem troca de textura;
- textura nova e textura já internada;
- inspector com seleção única e múltipla.

### 7.3 Hierarquia

Comparar a mesma quantidade de objetos em:

1. seleção plana;
2. um grupo de um nível;
3. grupos aninhados;
4. preview e commit de translate/rotate/scale;
5. duplicate, delete e ungroup.

O custo de um grupo de um nível DEVERIA ser da mesma ordem da seleção canônica
equivalente. Diferença deve ser atribuída a traversal, bounds, projeção ou
reconstrução, não apenas descrita como “lenta”.

### 7.4 Geometria e renderer

Registrar objetos lógicos, instâncias, batches, geometrias, materiais, texturas,
draw calls e tempo de frame. Compare famílias com complexidade de segmentos
declarada.

### 7.5 Scripts

Separar:

- criação/retomada de Worker;
- criação do Compartment/sessão;
- cálculo puro;
- geração de intenções;
- validação do plano;
- dry-run;
- intern de aparências;
- dispatch agregado;
- projeção do renderer.

O timeout de 5 s é limite de segurança, não orçamento desejável. Produções
interativas deveriam manter o trabalho principal abaixo de um frame quando
possível e mover preparação pesada para fronteiras canceláveis.

### 7.6 Arquivos

Medir bytes, stringify, parse, validação, import de assets, normalização,
`replaceState` e reconstrução visual. Cenas padrão:

- sem textura;
- uma textura compartilhada por famílias diferentes;
- várias transformações UV;
- grupos aninhados;
- muitas instâncias lógicas;
- arquivo legado schema 1.

## 8. Estatística e interpretação

### 8.1 Resumo

Mediana é o centro operacional primário por ser menos sensível a outliers. P95
expõe cauda percebida. Média ajuda a identificar custo agregado, mas não deve
ser o único resumo.

Sempre reporte `n`, mínimo, mediana, média, p95 e máximo. Para decisão de release
importante, conserve amostras brutas.

### 8.2 Variação percentual

```text
changePercent = 100 * (candidate - baseline) / baseline
```

Quando baseline é próxima de zero, percentual é instável. Exija também diferença
absoluta e, para micro-operação, aumente iterações.

### 8.3 Fontes de variância

- JIT e warm-up;
- garbage collection;
- alocação e layout de memória;
- tarefas do event loop;
- GPU e compilação de shader;
- cache frio/quente;
- throttling térmico e energético;
- resolução do timer;
- abas, gravação e rede em segundo plano;
- ordem dos experimentos.

Por isso, muitas amostras dentro de uma única página não substituem execuções
independentes.

### 8.4 Confiança

O runner atual não calcula intervalo de confiança. Até essa capacidade existir,
uma diferença pequena deve ser descrita como inconclusiva e repetida. Não use
três casas decimais como sinal de certeza estatística.

## 9. Limiares provisórios de alerta

Estes limiares são política de triagem, **não gate implementado**:

| Sinal comparável | Ação |
| --- | --- |
| mediana +10% e +0,5 ms | repetir em 3 cargas; investigar se persistente |
| p95 +20% e +1 ms | investigar cauda e GC/event loop |
| tempo >2x | bloquear merge até explicação ou aceite explícito |
| draw calls, batches ou materiais aumentam na mesma cena | investigar sempre |
| bytes de arquivo +10% e +100 KiB | auditar duplicação/expansão |
| crash, fechamento da aba ou timeout | regressão crítica independentemente da mediana |

Para operações que determinam frame interativo, alvos informativos:

- abaixo de 16,7 ms para sustentar 60 Hz;
- abaixo de 33,3 ms para sustentar 30 Hz;
- trabalho longo deve ser fatiado, cancelável ou tirado do hot path.

Esses são orçamentos de frame, não garantias atuais do produto.

## 10. Histórico durável

O histórico deve evoluir para um artefato versionado ou armazenamento exportável
com schema explícito. Formato recomendado:

```csv
date,commit,build,device,os,browser,scenario,objects,transforms,samples,
metric,median_ms,p95_ms,mean_ms,min_ms,max_ms,serialized_bytes,notes
```

Regras:

- uma linha por métrica e execução agregada;
- amostras brutas em JSON separado quando decisão for relevante;
- unidades no nome do campo;
- nenhuma célula `PREENCHER` em baseline publicada;
- baseline nova não apaga a anterior;
- resultado de worktree dirty deve ser marcado;
- números de conversa só viram baseline depois de registrados com metadados.

Os CSVs atuais em `docs/performance/` são históricos e possuem cobertura
desigual. Devem ser migrados, não tratados como série uniforme.

## 11. Política para otimizações

Uma otimização DEVE:

1. identificar hot path e hipótese;
2. acrescentar benchmark ou diagnóstico reproduzível;
3. preservar testes de correção;
4. comparar baseline e candidato no mesmo protocolo;
5. medir recurso secundário relevante;
6. evitar cache global sem ciclo de vida/invalidacão;
7. manter lógica fora do renderer;
8. documentar trade-off de memória, complexidade e precisão;
9. ter fallback correto antes de atalho rápido;
10. ser revertível por commit.

Não aceite reduzir validação, atomicidade ou isolamento para vencer um
microbenchmark sem decisão arquitetural explícita.

## 12. Gargalos conhecidos e hipóteses

Linhas históricas indicam crescimento aproximadamente linear de parse/validate,
`replaceState` e clonagem integral. O código confirma causas plausíveis:

- `Sandbox.getState()` clona toda a cena;
- `replaceState` clona entrada e, quando clean, clona novamente para base;
- o benchmark valida JSON completo a cada amostra;
- documento atual expande objetos procedurais;
- Base64 é armazenado no JSON e processado integralmente;
- hierarquia exige projeção mundial e bounds de subárvore.

Essas são hipóteses sustentadas por código e medições históricas, não licença
para otimizar sem perfil atual.

## 13. Roadmap de instrumentação

1. persistir/exportar histórico comparável;
2. registrar commit/build/plataforma automaticamente;
3. warm-up e execuções independentes assistidas;
4. benchmark schema 2 com assets;
5. benchmark de grupo versus seleção;
6. decomposição de custo do plano SES;
7. frame-time e long tasks;
8. memória JS/GPU quando APIs permitirem;
9. intervalos de confiança/efeito;
10. cenário de arquivo compacto por protótipo/instância.

## 14. Referências

- [W3C High Resolution Time](https://www.w3.org/TR/hr-time-3/)
- [W3C User Timing](https://www.w3.org/TR/user-timing/)
- [Kalibera e Jones, *Rigorous Benchmarking in Reasonable Time*](https://kar.kent.ac.uk/33611/)
- [Barrett et al., *Virtual Machine Warmup Blows Hot and Cold*](https://kclpure.kcl.ac.uk/portal/files/146297329/Virtual_Machine_Warmup_Blows_BARRET_Acc11Aug2017Epub12Oct2017_GOLD_VoR_CC_BY_.pdf)
- [`PERFORMANCE_BASELINE.md`](PERFORMANCE_BASELINE.md), histórico do build 0017
- [`TEST_STRATEGY.md`](TEST_STRATEGY.md)

## 15. Fontes no repositório

- `packages/benchmarks/src/BenchmarkRunner.js`
- `packages/benchmarks/src/BenchmarkStatistics.js`
- `packages/runtime-api/src/RuntimeMetrics.js`
- `packages/runtime-api/src/SpatialSeedRuntime.js`
- `packages/core/src/Sandbox.js`
- `packages/resource-audit/src/`
- `docs/performance/`
