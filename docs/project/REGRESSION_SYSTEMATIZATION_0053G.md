# Sistematização de regressões e alcance — 0053g

## Objetivo

Este incremento estabiliza as regressões observadas depois da migração para
objetos compactos, `InstanceGraph` e projeções por ocorrência. Ele também cria
uma base reproduzível para separar, em um incremento posterior, o runtime
efetivamente usado dos protótipos e diagnósticos que ainda vivem no mesmo
repositório.

O incremento **não remove código**. A análise de alcance é um inventário para
revisão, não uma prova de que um arquivo pode ser apagado ou extraído.

## Proveniência

| Campo | Valor |
| --- | --- |
| Snapshot de entrada | `spatialseed-0053f-current.tar.gz` |
| SHA-256 do snapshot | `e4505206dce38d4a7f8cf5aa323bb93d041bf7c827e4ecd3965b2c02ab51d6e5` |
| Build de entrada | `20260808-0053f` |
| Canal de entrada | `feature/0053f-compiled-replica-architecture` |
| Build estabilizado | `20260808-0053g` |
| Canal estabilizado | `feature/0053g-regression-systematization` |
| Conteúdo do snapshot | 612 arquivos; sem metadados Git; caminhos validados antes da extração |

## Reprodução inicial

A suíte exibida no navegador possuía 577 testes: 547 aprovados e 30 falhos.
A execução equivalente em Node reproduziu os mesmos 30 problemas de produto ou
contrato e acrescentou uma falha ambiental: o teste do Inspector depende de
`document`. Assim, o resultado em Node foi 546 aprovados e 31 falhos; a falha
adicional não era regressão do runtime.

Os defeitos não formavam uma única falha. Eles se concentravam nas fronteiras
alteradas pela arquitetura compacta: identidade de módulos ES, materialização
do estado, hierarquia por ocorrência, semântica temporal e baselines que ainda
descreviam a representação anterior.

## Matriz causal

| Área | Causa observada | Tratamento em 0053g | Estado |
| --- | --- | --- | --- |
| Identidade de módulos | O mesmo reducer era carregado por URLs com queries de build diferentes, criando identidades ES distintas. | `RegionBoxModule` e seu índice público agora exportam a mesma instância de `boxRegionReducer`; imports do incremento foram alinhados. | corrigida e coberta |
| Checkpoints e serialização | O shell persistente baseado em `Proxy` atravessava uma fronteira que exige `structuredClone`. | `getBaseState()` materializa um checkpoint clonável. `getState()` continua sendo a leitura rápida e não clonável; `materializeState()` explicita a conversão quando necessária. | corrigida e coberta |
| Ordem de descendentes | A travessia legada retornava BFS onde os consumidores dependiam de pré-ordem DFS estável. | A compatibilidade usa DFS iterativa, preservando ordem documental. | corrigida e coberta |
| Grupos compactos | Consultas e testes ainda tratavam ocorrências projetadas como objetos materializados e ignoravam raízes autoritativas do `InstanceGraph`. | `listObjectChildren()` reconhece nós compactos; testes usam APIs por ocorrência e projeção, e duplicação conta raízes lógicas. | corrigida e coberta |
| Grupo de grupos no preview | Uma raiz compacta podia aparecer sem filhos, impedindo que o índice de preview encontrasse membros aninhados. | A enumeração compacta foi corrigida e `ReplicaRenderIndex` ganhou cenário de grupo aninhado com três membros de preview e uma folha renderizável. | código/teste corrigidos; gesto no navegador pendente |
| Relógio compartilhado | O `timeSource` era calculado, mas não chegava ao descritor sincronizado; a animação usava um passo local. | O comando compartilhado encaminha a fonte temporal ao runtime. | corrigida e coberta |
| Animação após mover/girar/escalar | Qualquer edição da cena encerrava a animação e a camada visual mantinha o pivô capturado antes da edição. | Edições TRS invalidam a assinatura, acordam e rebaseiam a camada sobre o pivô canônico atual. Exclusão encerra apenas a ocorrência afetada; substituição integral da cena encerra todas. | corrigida e coberta |
| Schema, rótulo e benchmark | Testes e textos ainda esperavam schema, rótulo PWA e tamanho serializado anteriores à compactação. | Expectativa de schema 4, rótulo preciso de cache e baseline `compact-runtime-baseline-v2-instance-graph`, com o acréscimo de 65 bytes documentado. | atualizada e coberta |
| Fronteiras de pacote | Imports profundos e mapa de migração incompleto mascaravam dependências reais. | Índices públicos foram adicionados a `core` e `renderer-three`; o mapa cobre os 62 pacotes e a auditoria arquitetural foi recalculada sem dívida nova. | corrigida e auditada |

## Semântica temporal recuperada

Uma transformação editorial muda a base canônica; ela não deve ser
interpretada como pedido implícito para parar uma animação relativa. O runtime
agora distingue três eventos:

1. edição TRS: rebaseia e continua;
2. exclusão: encerra somente as instâncias removidas;
3. substituição integral do documento: encerra os transientes temporais.

No renderer, a transformação relativa avaliada é conjugada do pivô capturado
para o pivô canônico atual antes de compor o overlay. Isso impede o salto ou a
interrupção observados ao mover um objeto animado.

## Âncoras vinculadas e esqueleto: lacuna explícita

O kernel já persiste `anchorRef` por meio do comando
`selection.anchor.set`, inclusive pelo console:

```text
anchor reference <object-id> [x y z]
```

Hoje essa referência resolve um pivô para operações de seleção. Ela **não**
forma uma restrição cinemática, não propaga transformações entre juntas e não é
consumida pelo renderer ou pelo runtime temporal como um esqueleto. Também não
existe uma superfície de autoria de ossos/juntas.

Portanto, animar um esqueleto por âncoras vinculadas continua sendo uma
capacidade ausente, não uma regressão considerada resolvida. O próximo desenho
precisa definir, antes da UI:

- grafo e autoridade das juntas;
- regras de propagação e detecção de ciclos;
- relação entre pivô, hierarquia de ocorrência e transformação relativa;
- serialização/migração;
- avaliação temporal e política de edição durante playback.

## Alcance estático e candidatos

`tools/analyze_reachable_surface.py` percorre imports JavaScript próprios a
partir de duas raízes de produção (`apps/web/boot.js` e
`apps/web/service-worker.js`) e da raiz explícita de diagnósticos. O resultado
determinístico está em `REACHABILITY_MANIFEST_0053G.json`.

| Classe | Arquivos | Componentes informados pelo manifest |
| --- | ---: | ---: |
| Closure de produção | 287: 286 próprios + `vendor/ses/ses.umd.min.js` | 64 |
| Diagnóstico alcançável | 19 | 8 |
| Não referenciado pelas raízes | 25 | 3 componentes de papel produtivo, além de diagnósticos e arquivos isolados |
| Total JavaScript próprio | 330 | — |
| Imports próprios não resolvidos | 0 | — |

As classes de arquivos próprios são disjuntas: 286 de produção + 19 de
diagnóstico + 25 não referenciados = 330. O total da closure de produção é 287
porque inclui também o runtime vendorizado do SES.

Os 25 arquivos fora das raízes se distribuem assim:

| Grupo de revisão | Arquivos | Disposição atual |
| --- | ---: | --- |
| `editor-transform-tools`, `object-picking`, `world-model` | 11 | confirmar adoção ou retirar da futura closure de produção |
| `edit-contracts`, `mesh-geometry-audit`, `preview-contracts`, `render-contracts` | 10 | manter fora de produção até adoção explícita; preservar enquanto úteis como diagnóstico/contrato |
| catálogo antigo de experimentos e três protótipos de renderer | 4 | revisar chamadas dinâmicas e histórico antes de qualquer remoção |

“Não referenciado” significa apenas “ausente das raízes mantidas pela análise
estática”. Nomes de recursos calculados, registros em runtime, HTML, CSS, JSON,
WASM, vendors e demais assets não JavaScript exigem outra passagem.

## Processo seguro para o módulo autônomo

A extração posterior deve ser uma cópia derivada de uma allowlist, nunca uma
limpeza destrutiva da base atual. A sequência proposta é:

1. congelar o manifest deste incremento e classificar manualmente cada um dos
   25 candidatos;
2. ampliar o analisador para HTML/CSS/JSON, workers, imports calculados,
   registries de capacidades e assets;
3. executar os fluxos do navegador — boot online/offline, PWA, abertura e
   salvamento de projeto, grupo de grupos, seleção e animação durante edição;
4. definir os entrypoints públicos do módulo e impedir imports profundos;
5. copiar a closure aprovada para um diretório/pacote novo, preservando IDs,
   schemas e migrações;
6. executar os mesmos fixtures semânticos, gates de arquitetura e benchmarks
   em ambas as formas;
7. somente depois discutir remoção ou arquivamento do que ficou fora.

Esse processo separa duas perguntas que não devem ser confundidas: “o runtime
atual alcança este arquivo?” e “podemos removê-lo sem perder uma capacidade ou
um formato histórico?”.

## Gates reproduzíveis

Comandos canônicos do incremento:

```bash
node tools/run_runtime_regressions.mjs
python3 tools/run_standalone_regressions.py
python3 tools/run_current_gates.py
python3 tools/analyze_reachable_surface.py --check
```

Resultado consolidado em 8 de agosto de 2026:

| Gate | Resultado |
| --- | --- |
| Runtime compatível com Node | 579/579; um teste DOM-only separado |
| Testes standalone | 19/19 |
| Agregador atual | 11/11 |
| Suite esperada no navegador | 580 testes; execução manual final ainda pendente |
| Manifest PWA | 333 entradas, consistente com o build 0053g |
| Arquitetura | 140 achados aceitos, zero novos e dez itens de dívida removidos |
| Alcance | 286 próprios de produção + 1 vendor, 19 de diagnóstico, 25 não referenciados, zero imports não resolvidos |

Auditorias históricas cujo próprio contrato exige builds 0051, 0052 ou 0053f
não fazem parte de `run_current_gates.py`: elas são snapshots de proveniência e
falham corretamente quando executadas contra 0053g. O agregador atual inclui
os gates reutilizáveis e a auditoria específica deste incremento.

## Pendências antes de declarar fechamento no navegador

- executar os 580 testes dentro do navegador;
- repetir manualmente o gesto de preview de grupo de grupos;
- mover, girar e escalar um objeto durante playback e observar continuidade;
- confirmar atualização PWA entre 0053f e 0053g;
- tratar o esqueleto por âncoras como feature separada, com contrato próprio.
