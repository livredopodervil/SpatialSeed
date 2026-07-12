# Spatial Seed — semente de continuidade

## Projeto

Navegador/editor espacial modular para Android + Termux + navegador.

## Ambiente

```text
Repositório: ~/SpatialSeed-monorepo
Cópia pública: ~/storage/shared/SpatialSeed-monorepo
Aplicação: http://127.0.0.1:8082/apps/web/
```

Não presumir Node.js ou npm. Python, Git e curl estão disponíveis.

## Estado funcional

- região autoritativa;
- sandbox com undo/redo;
- propostas explícitas;
- renderer Three.js e renderer textual;
- seleção por toque e console;
- seleção múltipla;
- pivôs mediana, limites, ativo e personalizado;
- gizmos de transformação;
- diagnóstico de input;
- painel do desenvolvedor;
- console seguro;
- Object Inspector;
- cor, dimensões e textura com tiling, offset, rotação e wrapping.

## Invariantes

1. Three.js não é estado autoritativo.
2. Seleção, pivô e ferramentas pertencem ao editor.
3. Gizmo, Inspector e console produzem comandos.
4. Undo/redo pertence ao sandbox.
5. Editar pivô não altera o objeto.
6. Atualizações devem ser pequenas, auditáveis e reversíveis.
7. Diagnosticar antes de corrigir.
8. Não pedir grandes edições manuais no celular.
9. Quando etapas dependem entre si, fornecer uma etapa por vez.
10. Sincronizar e verificar hashes antes de testar.

## Fluxo

```bash
cd ~/SpatialSeed-monorepo
git status --short
git diff
bash tools/seedctl sync
bash tools/seedctl verify
bash tools/seedctl serve
bash tools/seedctl seed
```

## Console

Comandos separados por `;` ou quebra de linha:

```text
help
inspect input
inspect selection
list objects
select box-1
select box-1 box-2
clear
pivot median
pivot bounds
pivot active
pivot custom 0 1 0
move 1 0 0
undo
redo
```

## Próxima prioridade

Melhorar gizmos e ferramentas de transformação:

- personalização visual;
- eixo, plano e centro claramente distintos;
- melhor operação touch;
- snapping configurável;
- feedback visual do modo ativo;
- testes pelo console antes da interface.

## Protocolo para nova LLM

1. Ler este arquivo.
2. Pedir `git status --short`.
3. Pedir `bash tools/seedctl verify`.
4. Não gerar código antes de conhecer o estado real.
5. Preservar funcionalidades existentes.
6. Preferir patch mínimo.
7. Documentar decisões.
8. Regenerar esta semente após mudanças importantes.

## Estado Git
```text
```

## Commits recentes
```text
f9202f9 Adiciona benchmark-base e testes automatizados
e4223bb Adiciona salvamento modular de projetos
34fba51 Adiciona substituição limpa do estado do sandbox
d60f65d Trata erros operacionais sem painel fatal
4ec36e6 Revisa interface por comandos e corrige edição de pivô
6428b81 Adiciona camada de comandos, pivô relativo e teste integrado
a1e95e9 Generaliza repetição afim e amplia console espacial
4ae88c1 Adiciona duplicação, repetição e exclusão da seleção
a09931f Adiciona ferramentas de transformação, snapping e vértices
ca3e317 Melhora console, cópia de saídas e semente de continuidade
fb49f91 Adiciona Object Inspector com suporte a materiais e texturas
c680fd4 Adiciona painel do desenvolvedor e console seguro
```

## Hashes
```text
f839a20db607088863ea786c2f4c9936f22673bb8627fdc58ec238077d70d8af  apps/web/index.html
82f50b55ad7cb51fd755c51b6d00ef00b791500411af1b21c3514ab8cb544087  apps/web/main.js
e89bd84df059c95cddb78ba7cfa68b545a7f97d0b2ee27c6fe6d1d93adf1fcf6  apps/web/style.css
e7925cba112f0436ffe6d7a8f6169c2ea37cdf41dad7042f42ca1dba5f3c5b1b  docs/ALGORITHMS.md
f68290a6ae7abfb37bceea7c0957d14c18923a52c6a8db132eb5df5563cc8a46  docs/ARCHITECTURE.md
5ae70ccff501cc262c69dff3af9f499ec809f873b50134b415eeb8f33252c9cb  docs/BENCHMARKS_AND_TESTS.md
96e11037b6277483e710567c61003e8ce8ce2ccde69b004ffc5dd67de527edbc  docs/COMMAND_ARCHITECTURE.md
5990722a26e35e5ceb0b4fbeed81f6ac3af6bd54435dbd6c976d7ad275f0f110  docs/CONSOLE_SPATIAL.md
7e99b1f6ea957c21ae07a834214239604b030844bf073ea49837c3d487c7a574  docs/DEPENDENCIES.md
699cab48af8f63ecdff1904edfe5ff44f13061aac3563ab1d8c7c27d10421f97  docs/DEVTOOLS.md
7f8b4f3e2b6b2f71d8c9a37411408ea4cbe67ce07e8ab13fdba699125d2faf96  docs/PIVOT.md
908727a5faff5bac6a0fe13cc968f78d7bab3740a048f63208776ee1d5378ebe  docs/PROJECT_FILES.md
86ffffe82ecc411ed677404627df307b44c2065ed8de5beeb73b393ac32d1432  docs/PROJECT_SEED_TEMPLATE.md
d9193c917692137ab25cb105b62ceeabced9e98673459100afc1701b0eab1a83  docs/SELECTION.md
23da419a69a10041ee98c04a3a81717079dc1e6738e76a106bff9a00cf3a2091  docs/SELECTION_OPERATIONS.md
4cbe6d4e75c6449ab1d6f5a8a94ab8a1d0a2f643dbbd410d7bc411c860b8bb42  docs/TRANSFORM_TOOLS.md
9b51626651c6a7cc8abce2ae361f05e55ecd78be2bfb7dcd98c7a937cb445e1a  docs/UI_COMMAND_REVIEW.md
288a146b7bab7c6e617a9ca2dd29dfe78a33a3a21dba237e8fad1b59089ad292  docs/WORKFLOW.md
f06163ef641bcea280dd46fcd99803b6e34d2e7f55925a2439d348de55bc034a  packages/benchmarks/src/BenchmarkRunner.js
1f5811a3b308c9580390085630a3d03766fca63e7d474d7d20f48adb688dfc7c  packages/benchmarks/src/BenchmarkStatistics.js
7a8a6cb05a3d519bf874dfd51038047016f62aed201e247a3e159f611fd09e03  packages/benchmarks/src/SceneFactory.js
54ddd0830846408423b78b4ca11c50cf6ce386ed0257573fcf80067af8c7ad3d  packages/core/src/EventBus.js
ae696994ef2d9a064fc4842b5531fec77c1e3454a864133eed6e2caa911646e7  packages/core/src/Region.js
786bcdda7edc4e30efbe1699e4d2ac7edd9a67bc9416d57a8c37b42ba31e877f  packages/core/src/Sandbox.js
5631e2fe9227e975539da7388b8bbed84c1fc0d1293838822aed90825229fd38  packages/devtools/src/DevConsole.js
09c4faa7c896075b1d14f70369622cc8ad558955917fb0b80833d9ac0f8495ba  packages/editor-commands/src/CommandRegistry.js
ebbbcf5693b228ebc4aa2ba35f22e892d74ee28b4f0ca22e1975a56bb71c82ee  packages/editor-commands/src/EditorCommands.js
ce85e56d724488dd145163c6affc0c426fec995396c433633b2349ff04c61eaa  packages/editor-core/src/EditorState.js
bd45e20f924efdba38615a320b01fc4723981d1f0af30e77a0ef8032274de7fc  packages/editor-core/src/Selection.js
63fdfee2c3028321719e551d708f954768314577f27a2638136947d5e399fdc2  packages/editor-transform-tools/src/TransformToolPanel.js
c375f6adc40861769866325fc9cf6cef15137b961063643517811747df9fe07b  packages/object-inspector/src/ObjectInspector.js
aca2be0743f9f08da08391d3dacc95ff411cc57d94df4e93106784fb2cc91ab7  packages/plugin-api/src/ModuleRegistry.js
53077f437f782f787b7a234241071f42fdfa5e29d7654fce5490f2e2710e0747  packages/project-files/src/ProjectSerializer.js
4cb7f8bfc834fbcf4fb68032d181a2f03813f8ed6c6d7f4953da9a0d010573ac  packages/project-files/src/ProjectService.js
09a63a056af09777335fd7e351e7ab17d0af51a6611cd18c5d6e021b7073e643  packages/project-files/src/ProjectValidator.js
655c9546834ced5c5e2dc684e3b2426ef7420edcfe87d7016d9c15f8f1744560  packages/region-box/src/reducer.js
a3cca9a6619a5a8bf15ce543c8d8ed5402c73d7a369335619cb62674415d457e  packages/renderer-outline/src/OutlineRenderer.js
cc2ff51ed060109d655d65530532c21a8cf25397ef7ea4ca571e60f41977621a  packages/renderer-three/src/ThreeRegionRenderer.js
e7e6a65d4b1188a9791939d0e3a6bb010baf46a5aa714e0e94944712e49b4dfe  packages/selection-operations/src/SelectionOperations.js
99a0678c071ae0adeacdc29a500b57fc5bda4fa6ca605fd09c5f3f5a4f36d184  packages/tests/src/Assertions.js
5ac4fced1010fe697de591060024d277a50571e6153f36c33900db6274e44004  packages/tests/src/TestRunner.js
38d755b1801ef9c7b31415368a10f1d5450171ba514e0ca4ffb84962c390400c  packages/tests/src/TestService.js
67f9a8716ed9c5f0ad68f35dc0ff60c69e12f771a495e04d7ce8ffdc9d2203dd  tools/make-project-seed.sh
ed77e2e71945ac9a0eaa0f1aee3a22d2f2926b9947f500c2abe692cf9aa81073  tools/no_cache_server.py
4ab4718f15240498e96817544ef39174055ca8a307c0fb8401f8794991e5048b  tools/seedctl
```
