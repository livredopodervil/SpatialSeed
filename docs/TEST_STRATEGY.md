# Estratégia de testes do SpatialSeed

> Política P0. Auditada em 16 de julho de 2026. A lista e a contagem de testes
> não são congeladas neste documento; consulte `runtime test help` e
> `runtime test all` no build efetivamente carregado.

## 1. Objetivos

Os testes devem demonstrar que:

1. comandos preservam invariantes do modelo;
2. UI, console, inspector e scripts convergem para os mesmos contratos;
3. preview não vira estado autoritativo antes do commit;
4. hierarquia preserva relações local/mundial;
5. recursos compartilhados não regressam para duplicação ou vazamento;
6. arquivos e catálogos fazem roundtrip compatível;
7. programa com erro não altera a cena;
8. PWA publica e atualiza o código esperado;
9. regressão visual observada gera cobertura proporcional;
10. teste de correção não é confundido com benchmark.

## 2. Pirâmide adaptada ao projeto

| Nível | Escopo | Estado atual | Finalidade |
| --- | --- | --- | --- |
| função pura | codecs, matemática, canonicalização, estatística | forte | casos-limite rápidos |
| contrato de pacote | registros, stores, hierarchy, workers falsos | forte | invariantes de API |
| integração de runtime | sandbox + comandos + serviços + renderer derivado | forte | fluxos entre camadas |
| integração de plataforma | PWA, picker, localStorage com fakes | parcial | políticas e fallbacks |
| browser real automatizado | DOM, toque, WebGL, service worker, picker | ausente | regressão de plataforma |
| visual/manual | gizmo, bounds, painéis, mobile, cena | necessário | percepção e interação |
| desempenho | benchmark isolado e recursos | parcial | custo e regressão |
| segurança/fuzzing | entradas hostis e capabilities negadas | parcial | falha fechada |

O maior déficit atual é automação end-to-end em navegador real. Testes com
fakes são necessários, mas não substituem lifecycle real de service worker,
WebGL, gesto de usuário ou Chrome Android.

## 3. Harnesses existentes

### 3.1 `TestService`

Comando:

```text
test help
test all
test sandbox|reducer|commands|project
```

É o harness básico da aplicação. Cobre sandbox, reducer, registro de comandos e
roundtrip simples de projeto.

### 3.2 Runtime Test Plugin

Comando:

```text
runtime test help
runtime test nome-da-suite
runtime test all
```

O plugin importa os módulos reais da aplicação e executa testes síncronos no
navegador. O resultado é JSON com `passed`, `failed`, `total`, `durationMs` e
itens individuais.

As famílias atuais incluem:

| Domínio | Suítes atuais |
| --- | --- |
| API e camadas | `runtime-api`, `viewer`, `editor`, `clock`, `simulation` |
| programas | `program-planning`, `program-evaluation`, `program-session`, `procedure-catalog`, `procedure-editor`, `spatial-planning`, `spatial-plan-commit` |
| assets e render | `assets`, `project-assets`, `appearance-runtime`, `normalized-runtime`, `incremental-runtime`, `batch-selection`, `resource-audit`, `render-resource-cache`, `instance-batches`, `batch-material-cache`, `instanced-renderer` |
| hierarquia | `scene-hierarchy`, `hierarchy-reparent`, `hierarchical-render-projection`, `hierarchy-world-commit`, `hierarchy-group`, `hierarchy-group-transform`, `hierarchy-subtree-lifecycle`, `hierarchy-ungroup`, `hierarchy-group-visuals`, `hierarchy-group-surfaces` |
| propriedades e geometria | `property-contract`, `placement-frame`, `geometry-creation`, `geometry-registry` |
| afim e seleção | `affine-math`, `affine-pivot`, `affine-contract`, `affine-repeat`, `selection-ui` |
| arquivo, build e PWA | `build-info`, `file-interop`, `project-files`, `pwa-status`, `ui-configuration` |

Esta tabela é mapa de responsabilidade, não lista autoritativa. Nova suíte deve
aparecer automaticamente em `runtime test help`.

### 3.3 Testes visuais documentados

`docs/tests/` contém roteiros históricos por marco. Eles são evidência útil,
mas não devem virar um segundo catálogo vivo. Um roteiro ainda relevante deve
ser promovido para esta política ou para o checklist de release.

## 4. Estrutura de um bom teste

Cada teste automatizado DEVE:

- ter nome de comportamento, não de método interno;
- construir sua própria fixture ou restaurá-la integralmente;
- conter uma causa principal de falha;
- afirmar estado e ausência de efeito colateral relevante;
- usar dados determinísticos;
- não depender da ordem de outro teste;
- não depender de rede;
- não usar duração estreita como prova funcional;
- deixar claro o contrato público protegido.

Exemplo de nome adequado:

```text
"plano obsoleto não altera sandbox nem aparências"
```

## 5. Fixtures e isolamento

### 5.1 Sandbox

Testes de domínio devem criar `Region` e `Sandbox` próprios. Não devem usar a
cena ativa do usuário. `BenchmarkRunner` segue a mesma regra.

### 5.2 Identidade

Use IDs estáveis na fixture quando a identidade faz parte da asserção. Injete
`createId` determinístico quando testar commit espacial. Evite depender de
`crypto.randomUUID()` no valor esperado.

### 5.3 Tempo e Workers

Timeouts, callbacks e envelopes devem ser testados com Worker e timer falsos.
Browser real precisa de teste separado para término efetivo do Worker.

### 5.4 Armazenamento e arquivos

`localStorage`, URL, Blob, DOM e pickers devem ser injetados por portas/fakes em
teste contratual. Teste de plataforma deve usar a API real e gesto real.

### 5.5 Renderer

Testes de lógica devem afirmar projeção, lotes e recursos sem exigir pixel.
Bounds, outline, gizmo, oclusão e navegação também precisam de verificação
visual ou screenshot automatizado futuro.

## 6. Matriz de invariantes

| Invariante | Cobertura mínima |
| --- | --- |
| reducer não muta entrada | função pura + referência |
| comando inválido não cria histórico | integração de sandbox |
| no-op não cria histórico | propriedade/comando |
| lote é atômico | uma atualização inválida entre válidas |
| preview não publica | editor session + renderer preview |
| commit publica uma vez | contagem de dispatch/undo |
| seleção não referencia ausente | delete/duplicate/group/undo |
| reparent preserva mundo | matriz antes/depois, aninhamento |
| grupo opera como subárvore | transform, duplicate, delete, ungroup |
| aparência igual é compartilhada | IDs, referências e cache |
| cor de instância não troca lote | batch e renderer |
| superfície aberta é double-sided | render profile + visual |
| arquivo faz roundtrip | schema 1 e 2, grupos, texturas |
| programa falha fechado | erro, timeout, cancelamento, orçamento |
| plano exige revisão atual | conflito antes do commit |
| PWA denuncia controlador antigo | build publicado/controlador |

## 7. Cobertura exigida por tipo de mudança

### 7.1 Novo comando

1. caso feliz;
2. argumentos inválidos;
3. alvo ausente;
4. no-op;
5. undo/redo;
6. superfície de console/UI quando houver;
7. mudança incremental reportada ao renderer.

### 7.2 Nova propriedade

1. descriptor e codec;
2. valor uniforme e misto;
3. suporte parcial na seleção;
4. set/unset;
5. lote atômico;
6. no-op;
7. aparência/instância conforme escopo;
8. console e inspector pela mesma via.

### 7.3 Nova geometria

1. normalize, key e create;
2. mínimos, defaults e valores inválidos;
3. topologia aberta/fechada;
4. bounds e pivô;
5. instancing e seleção;
6. criação por painel, console e `spatial`;
7. série afim;
8. save/open.

### 7.4 Hierarquia

Teste pelo menos profundidades 0, 1 e 2; seleção que contém ancestral e
descendente; transform combinado; pivot custom; duplicate/delete; undo/redo;
ungroup; roundtrip; e custo visual comparável à seleção canônica.

### 7.5 Arquivo/schema

Use fixtures versionadas e imutáveis. Toda migração precisa:

- arquivo válido anterior;
- arquivo válido atual;
- campo ausente;
- referência ausente;
- ID duplicado;
- asset adulterado;
- hierarquia cíclica;
- arquivo grande em limite e acima do limite quando cotas existirem;
- prova de que falha não destrói projeto ativo.

### 7.6 Runtime de programas

Cobertura obrigatória:

- cálculo e programa;
- persistência explícita e local temporário;
- random determinístico;
- resultado/argumento não clonável;
- Promise rejeitada;
- timeout/cancelamento e geração nova;
- protocolo/runId/baseVersion incompatíveis;
- capability/comando/geometria negados;
- orçamento de fonte, saída e comandos;
- plano pendente, descarte, commit e conflito;
- importação de catálogo sem execução.

## 8. Teste visual e de interação

Uma mudança visual só está validada quando observada no tamanho e dispositivo
relevantes. Registre:

```text
build, commit, aparelho, SO, navegador, viewport/zoom, orientação, passos,
resultado esperado, resultado observado, screenshot quando útil
```

Matriz mínima:

- Android retrato e paisagem;
- toque e teclado virtual;
- Chromium desktop com mouse/teclado quando disponível;
- PWA standalone e aba normal;
- zoom comum e viewport estreito;
- cena vazia, pequena e densa.

Verifique toolbar, painéis, retorno do modo cena, resize persistente, seleção,
gizmo, bounds, outlines, texturas e mensagens de erro.

## 9. Quando automatizar uma regressão visual

Uma regressão visual deve ganhar teste automático quando puder ser expressa
como estado, geometria, bounds, layout ou classe CSS determinística. Exemplos:

- gizmo deve seguir pivot mundial: teste numérico;
- superfície aberta deve ser double-sided: teste de render profile;
- painel não deve cobrir toolbar: teste de retângulos DOM futuro;
- outline deve acompanhar grupo: teste de bounds + screenshot futuro.

Diferenças puramente perceptuais podem permanecer em roteiro visual, mas devem
ter screenshot de referência e tolerância definidas antes de automatização.

## 10. Flakiness

Não há política de “retry até passar”. Um teste instável é defeito do teste, da
API ou do produto.

Ao encontrar flake:

1. registre seed, ordem, build e plataforma;
2. execute a suíte isolada e depois `all`;
3. elimine dependência de relógio, cache, ordem ou estado global;
4. injete timer/ID/Worker quando possível;
5. se a instabilidade for da plataforma, separe teste contratual e E2E;
6. não aumente timeout sem localizar a fonte da variância.

## 11. Testes lentos

O runner atual é síncrono. Uma suíte não deve bloquear longamente a interface.
Testes de grande escala e medições pertencem ao benchmark, não a `runtime test
all`. Guardas amplas de disponibilidade podem existir, mas não devem ser
comparadas entre builds como métrica.

Quando E2E assíncrono for introduzido, ele deve ter processo/harness separado,
timeout explícito e saída legível por máquina.

## 12. Segurança

Além dos casos funcionais, releases com runtime de código devem testar
negativamente:

- tentativa de acessar DOM, rede e runtime;
- import dinâmico e assincronismo;
- mutação de intrínsecos compartilhados;
- mensagens forjadas/tardias;
- payload profundo, enorme, cíclico ou não clonável;
- catálogo que contém fonte hostil mas não é executado ao importar;
- arquivo que referencia asset inexistente ou content ID adulterado.

Fuzzing ainda não existe e é prioridade registrada no modelo de segurança.

## 13. Dispositivos e navegadores

| Classe | Papel |
| --- | --- |
| Chrome Android + Termux HTTP local | ambiente primário de desenvolvimento |
| Chrome Android PWA no Pages | distribuição primária atual |
| Chromium desktop | compatibilidade e picker nativo |
| Firefox/Safari | exploração; resultado deve ser registrado sem promessa implícita |

Capacidade deve ser detectada, não inferida do nome do navegador.

## 14. Gate de merge

Antes de integrar ao `main`:

- [ ] suíte diretamente afetada passa;
- [ ] `runtime test all` passa;
- [ ] teste visual proporcional passa;
- [ ] arquivos/PWA/plataforma são testados quando afetados;
- [ ] regressão corrigida recebeu teste que falharia antes;
- [ ] não há teste desabilitado ou erro apenas escondido;
- [ ] documentação e ajuda correspondem ao comportamento;
- [ ] desempenho foi medido quando o hot path mudou.

O resultado deve registrar commit/build e plataforma. A contagem total pode ser
copiada para o relato da release, mas não para documento vivo.

## 15. Dívidas de infraestrutura

1. runner E2E em navegador real, idealmente WebDriver/Playwright ou equivalente;
2. execução automatizada em CI;
3. fixtures versionadas de `.spatialseed`;
4. screenshots/reftests para UI e renderer;
5. testes cross-browser;
6. fuzzing e property-based testing;
7. relatório JUnit/JSON persistente;
8. coverage de código como diagnóstico, não meta cega;
9. teste de instalação/upgrade real de service worker;
10. teste de memória e crash em cenas/texturas grandes.

## 16. Referências

- [Web Platform Tests: desenho de suítes curtas e autocontidas](https://web-platform-tests.org/test-suite-design.html)
- [WPT runner: execução em navegador normal e saída legível por máquina](https://web-platform-tests.org/tools/wptrunner/docs/design.html)
- [NIST SP 800-218: revisão e teste de software](https://csrc.nist.gov/pubs/sp/800/218/final)
- [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md)
- [`SECURITY_MODEL.md`](SECURITY_MODEL.md)

## 17. Fontes no repositório

- `packages/tests/src/`
- `packages/runtime-test-plugin/src/RuntimeLayerTests.js`
- `packages/runtime-test-plugin/src/RuntimeTestPlugin.js`
- `docs/tests/`
- `docs/performance/`
