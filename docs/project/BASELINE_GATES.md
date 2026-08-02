# Gates da reorganização do `main-proposal`

Status: implementado no incremento `0047a`
Escopo: linha de base estrutural, sem alteração dos algoritmos de domínio

## Objetivo

A reorganização só pode avançar se cada incremento mantiver o comportamento,
os formatos compactos e a capacidade de executar o aplicativo sem depender de
Node.js ou de um processo de build. Os gates abaixo transformam esse requisito
em verificações reproduzíveis e monotônicas.

## Gate arquitetural

O mapa canônico entre os componentes atuais e os oito módulos de destino é
[`MODULE_MIGRATION_MAP.json`](MODULE_MIGRATION_MAP.json). Nenhum segundo mapa
de equivalência deve ser mantido em documentação, código ou configuração.

Execute:

```bash
python3 tools/audit_architecture.py
```

O auditor resolve imports ES relativos, constrói o grafo de componentes e
verifica APIs públicas, ciclos, imports profundos, dependências incompatíveis
com o grafo final, acesso a DOM/Three.js, dependências de diagnóstico no boot e
componentes não alcançados pela aplicação mantida.

`tools/architecture-debt-baseline.json` contém o conjunto exato de achados já
existentes quando o gate foi criado. Ele não transforma esses achados em
arquitetura aceita: apenas impede que apareça um novo. Um achado removido não
precisa ser restaurado e deve ser retirado da baseline no mesmo incremento que
o elimina. `--write-baseline` só pode ser usado após revisar a lista completa;
não deve aceitar dívida nova para fazer o gate passar.

## Gate de desempenho e compacidade

No console do SpatialSeed, execute:

```text
runtime test performance-baseline
benchmark compact 10000 1000 5
```

O benchmark usa um sandbox isolado e mede, numa única escala canônica:

- família explícita compacta de 10.000 membros;
- lote instanciado de 10.000 membros;
- bundle segmentado de 1.000 traços;
- página virtual de 25 recursos numa família de 10.000 membros;
- cena lógica e serialização de 10.000 objetos.

Os limites estruturais são definidos uma única vez em
`packages/benchmarks/src/CompactRuntimeBenchmark.js`. O resultado inclui `gates.ok` e
cada verificação individual. Contagens, chunks e bytes não podem aumentar sem
decisão arquitetural explícita.

Tempos não usam teto absoluto, pois variam por aparelho, navegador, aquecimento
e concorrência. Para comparar uma mudança de custo, execute base e candidato
intercalados, com cinco amostras em cada rodada e o mesmo cenário. A mediana não
pode regredir mais de 10% e o percentil 95 (`p95`) não pode regredir mais de
15%. `benchmark compare` só compara execuções com a mesma chave de escala.

O snapshot histórico que originou os limites está em
[`MAIN_PROPOSAL_BASELINE_0047A.json`](../performance/MAIN_PROPOSAL_BASELINE_0047A.json).

## Gate estático e PWA

Execute também:

```bash
git diff --check
python3 tools/audit_web_entrypoints.py
python3 tools/generate_pwa_precache.py --check
```

O manifesto de precache é gerado deterministicamente. Se um recurso estático
for acrescentado ou removido, regenere-o com
`python3 tools/generate_pwa_precache.py` e revise a diferença.

## Critério para iniciar o kernel v2

A etapa seguinte só começa com todos os gates acima verdes, a suíte completa do
runtime sem regressão e o aplicativo validado visualmente no ambiente do autor.
O kernel v2 deverá então remover achados da baseline; não poderá apenas movê-los
para novos caminhos ou acrescentar uma ponte paralela.
