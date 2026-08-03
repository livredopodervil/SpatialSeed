# Main Proposal: núcleo cristalizado e extensões internas

Status: implementação incremental; baseline, primeira fatia do kernel v2, isolamento diagnóstico, HTTPS canônico e primeira família visual canônica materializados até o build `0047f`, sem merge da branch 0046
Base obrigatória: `d556306c8b921363c26c56f49cb532e8e2e2b0f9` (`origin/main`)  
Fonte de ideias, não de integração: `cfc63ca813ca722e9755b7a23c6d484287e9c289` e o estado local exportado da 0046  
Data da análise: 2026-08-02

## 1. Decisão

O novo `main-proposal` deve reorganizar o sistema em **oito módulos de fronteira**, autocontidos e acíclicos. Cada módulo terá uma única API pública, manifesto declarativo, ciclo de vida explícito, testes próprios e posse inequívoca de seu estado. Arquivos internos não poderão ser importados por outro módulo.

Não haverá merge integral da 0046 nem um segundo sistema de interface coexistindo com o atual. Cada fatia migrada deve substituir o caminho anterior e remover, no mesmo conjunto de mudanças, o código que deixou de ser autoritativo.

A UI deixa de descobrir e adotar DOM existente. Os módulos declaram capacidades, comandos, consultas, eventos, ferramentas, procedimentos e componentes de interface. Uma aplicação seleciona módulos; um perfil organiza componentes; o adaptador web materializa o resultado. Console, interface, scripts e extensões usam o mesmo runtime e os mesmos comandos.

Esta reorganização não inclui incremento funcional. Seu resultado é a mesma aplicação com limites claros, montagem reproduzível e um caminho seguro para extensões definidas pelo usuário.

## 2. Evidência da análise

As duas versões foram reconstruídas separadamente a partir do pacote exportado.

| Verificação | `main` | 0046 |
| --- | ---: | ---: |
| Commit | `d556306c8b92` | `cfc63ca813ca` |
| Relação | base | 14 commits à frente, sem divergência |
| Estado | limpo | 3 modificados + `reports/` não versionado |
| Pacotes em `packages/` | 58 | 64 |
| JavaScript validado por `node --check` | 251/251 | 273/273 |
| Testes reais do runtime | 533/533 | 550/550 |
| Auditoria de entrypoints web | aprovada | aprovada |
| Manifesto PWA | desatualizado | atual, 290 arquivos |

A diferença versionada da 0046 contém 35 arquivos, 7.292 inserções e 75 remoções. Só `apps/web/style.css` recebeu 1.331 linhas. Os seis pacotes novos de UI somam aproximadamente 4.773 linhas JavaScript, enquanto `apps/web/bootstrap/createWebRuntime.js` permaneceu um ponto de composição de 2.340 linhas. Portanto, o aumento não corresponde a uma transferência efetiva de responsabilidade para módulos independentes.

Os pacotes que sustentam famílias procedurais, traços, árvore de recursos, batches de instâncias, renderização Three, referências espaciais e benchmarks têm árvores Git idênticas no `main` e na 0046. Um ensaio com 10.000 membros e 1.000 traços confirmou a mesma forma e o mesmo consumo estrutural:

| Ensaio | Resultado estrutural |
| --- | ---: |
| Família explícita compactada, 10.000 membros | 417.808 bytes estimados; 397.097 bytes JSON |
| Entrada expandida equivalente | 843.107 bytes JSON |
| Batch de 10.000 instâncias | 1 batch; 640.000 bytes de matrizes |
| Bundle de 1.000 traços | 8 chunks; 124.932 bytes estimados |
| Cena de 10.000 objetos | 1.819.009 bytes serializados |

Tempos isolados não devem ser tratados como comparação entre essas branches, pois o código medido é o mesmo e as diferenças observadas são ruído de execução. A identidade das árvores e os invariantes estruturais são a garantia forte neste ponto.

### 2.1 Problemas confirmados

1. `apps/web` depende diretamente de quase todo o repositório e `createWebRuntime.js` funciona como composition root, integrador e depósito de detalhes.
2. `packages/plugin-api/ModuleRegistry.js` já registra módulos e capacidades, mas a 0046 acrescenta outro `UiModuleRegistry`. A aplicação de UI liga e desliga descritores locais, não os módulos reais do domínio.
3. Os descritores de UI referenciam IDs de comandos e consultas, mas não validam contrato de argumentos, resultado ou disponibilidade antes da ativação.
4. O designer e o runtime não compartilham uma única instância de documento de layout. O estado local não controla de forma confiável o HUD vivo.
5. O adaptador legado adota DOM e listeners já existentes. Isso preserva o DOM como fonte implícita e impede montagem autônoma.
6. A tentativa local de sincronizar stores por `window`, `CustomEvent` e `localStorage` revela posse de estado indefinida. Essa ponte não deve ser portada.
7. A 0046 cria o ciclo `edit-hud-layout` ↔ `hud-designer`. O `main` já contém o ciclo de produção/testes `apps/web` ↔ `runtime-test-plugin`.
8. Painéis e overlays foram declarados, mas não consumidos integralmente pelo shell; `safeModeModules` foi declarado sem controlar o runtime.
9. Existem implementações paralelas ou abandonadas: `editor-transform-tools` e `world-model` não são alcançados pela aplicação mantida; diretórios antigos na raiz alimentam apenas um protótipo histórico.

## 3. Arquitetura final: oito módulos

“Módulo” aqui significa uma fronteira pública estável, não um arquivo grande. Cada módulo pode ter implementação interna organizada em vários arquivos, mas publica apenas `index.js`, `manifest.js` e seus esquemas versionados.

| Módulo | Responsabilidade exclusiva | Dependências diretas permitidas |
| --- | --- | --- |
| `kernel` | Registro de módulos, comandos, consultas, eventos, capacidades, esquemas, escopos, transações e lifecycle | nenhuma |
| `document` | Documento canônico, identidade, regiões, histórico, seleção persistível, projetos, assets, hierarquia, propriedades e snapshots/deltas | `kernel` |
| `procedural` | AST afim, linguagem, catálogos de procedimentos, planos, famílias, traços, receitas compactas e árvore virtual de recursos | `kernel`, `document` |
| `authoring` | Ferramentas e sessões de edição, seleção operacional, transformações, mesh, planar, paths, medição e placement | `kernel`, `document` |
| `viewer` | Sessões locais, câmeras, animação, interação e portas abstratas de apresentação | `kernel`, `document` |
| `renderer-three` | Projeção Three, cache, materiais, outlines, instancing e batches; nunca estado autoritativo | `kernel`, `document`, `viewer` |
| `interface` | Contratos de componentes, definição de aplicação, perfil de workspace/layout e compositor puro | `kernel` |
| `platform-web` | Composition root, DOM, PWA, arquivos do navegador, persistência local, workers e montagem visual | os sete módulos anteriores |

Regras obrigatórias:

- o grafo é acíclico e verificado automaticamente;
- dependência entre módulos ocorre pela API pública ou por uma capability injetada, nunca por import interno;
- somente `platform-web` conhece DOM, `window`, storage e service worker;
- somente `renderer-three` conhece Three.js;
- somente `document` altera o estado autoritativo, sempre por comando/transação;
- testes e diagnósticos não são dependências do runtime de produção;
- o entrypoint web importa apenas `platform-web` e dados de configuração.

## 4. Contrato canônico de módulo

O `ModuleRegistry` existente deve evoluir para `spatial-seed-module-v2`; não deve surgir um registro paralelo para UI. O manifesto é dado serializável e inspecionável. Handlers de módulos embutidos ficam no factory confiável, separados do manifesto.

```js
export const manifest = Object.freeze({
  manifestVersion: "spatial-seed-module-v2",
  id: "spatialseed.procedural",
  version: "1.0.0",
  requires: {
    modules: ["spatialseed.kernel", "spatialseed.document"],
    capabilities: ["document.commands.v1", "document.queries.v1"]
  },
  provides: {
    capabilities: ["procedural.catalog.v1", "procedural.plans.v1"]
  },
  contributes: {
    commands: [{
      id: "procedural.family.create",
      args: "schema:procedural.family.create-args@1",
      result: "schema:command.result@1",
      effect: "document"
    }],
    queries: [{
      id: "procedural.catalog.list",
      args: "schema:catalog.filter@1",
      result: "schema:procedural.catalog-page@1"
    }],
    events: [{
      id: "procedural.catalog.changed",
      payload: "schema:catalog.delta@1"
    }],
    catalogs: [{
      id: "spatialseed.procedural.catalog.builtin",
      kind: "procedures",
      apiVersion: "spatial-seed-procedure-catalog-v1"
    }]
  },
  permissions: []
});

export function createModule(scope) {
  return {
    activate() {
      return {
        capabilities: {
          "procedural.catalog.v1": catalogPort,
          "procedural.plans.v1": planPort
        },
        contributions: {
          catalogs: {
            "spatialseed.procedural.catalog.builtin": builtinCatalog
          }
        }
      };
    },
    dispose() {}
  };
}
```

O manifesto e os payloads executáveis permanecem separados. O manifesto pode
ser clonado, congelado e inspecionado sem carregar handlers; o resultado de
`activate` deve fornecer exatamente as capabilities e contribuições declaradas,
sem chaves implícitas. A implementação vigente e seus limites estão descritos
em [`MODULE_V2.md`](MODULE_V2.md).

O kernel deve validar, antes de qualquer efeito:

1. versão e forma do manifesto;
2. IDs únicos e namespaces;
3. grafo de dependências e capabilities requeridas;
4. esquemas de entrada, saída e eventos;
5. referências entre UI, comandos, consultas, ferramentas e procedimentos;
6. permissões da aplicação;
7. compatibilidade de versões.

A ativação monta um registro candidato imutável, valida tudo e só então troca o runtime ativo. Falha em qualquer módulo aborta a operação completa e dispõe o escopo candidato em ordem inversa. Não há estado parcialmente ativado, listener órfão ou módulo “meio desabilitado”.

## 5. Quatro documentos diferentes, sem sobreposição

| Documento | Contém | Não contém |
| --- | --- | --- |
| `ProjectDocument` | mundo, regiões, objetos, famílias, traços, assets, histórico e referências persistentes | layout pessoal, DOM, handlers |
| `ExtensionCatalog` | extensões disponíveis, versões, procedência, schemas e fontes de procedimentos | instâncias ativas, estado do mundo |
| `ApplicationDefinition` | módulos habilitados, permissões e IDs dos perfis escolhidos | coordenadas do HUD, comandos sobrescritos, handlers |
| `UiProfile` | componentes referenciados, visibilidade, zona, ordem, tamanho e posição responsiva | ativação de módulo, regra de domínio, efeito persistente |

Estado efêmero de sessão — foco, hover, drag em andamento, preview e câmera transitória — permanece fora desses quatro documentos. Só vira persistente por comando explícito.

Essa separação corrige a contradição da 0046 em que perfil de layout também passou a carregar ativação e overrides de comandos.

## 6. Interface declarativa e montagem autônoma

Um componente de interface é descrição, não elemento DOM nem callback:

```js
{
  id: "authoring.transform.move",
  kind: "toggle",
  label: "Mover",
  icon: "transform-move",
  action: {
    command: "authoring.tool.activate",
    arguments: { toolId: "transform.translate" }
  },
  state: {
    query: "authoring.tool.status",
    arguments: { toolId: "transform.translate" },
    activeWhen: { path: "state.active", equals: true }
  },
  sizing: {
    min: [1, 1],
    preferred: [1, 1],
    max: [4, 2]
  },
  placementHint: {
    zone: "primary-tools",
    priority: 40
  }
}
```

O fluxo único é:

1. `ApplicationDefinition` seleciona módulos reais.
2. O kernel resolve e valida todos os catálogos.
3. `interface` compõe uma árvore de UI a partir dos descritores disponíveis e do `UiProfile` ativo.
4. O grid puro resolve `push`, `swap` ou `reject` sem tocar o DOM.
5. `platform-web` materializa a árvore com factories canônicas de widgets.
6. A UI executa comandos e consultas pelo runtime; eventos atualizam bindings.
7. Designer e HUD vivo recebem a mesma instância de `UiProfileStore`; preview usa uma transação descartável sobre esse documento.

`index.html` deve terminar como shell mínimo, com pontos de montagem e recursos de boot. Nenhum controle funcional fica codificado estaticamente para depois ser “adotado”. Componentes compostos especiais usam um `rendererId` confiável registrado por `platform-web`; extensões de usuário não injetam HTML ou JavaScript.

Adapters legados podem existir apenas como portas temporárias de migração sobre
registros, comandos e estados explicitamente injetados. Eles nunca descobrem
capacidades lendo a estrutura DOM. Cada adapter é removido quando sua fonte
passa a contribuir nativamente os mesmos descritores e o último consumidor
antigo é convertido.

## 7. Console, catálogos e extensões do usuário

O console deve apenas expor os mesmos comandos e consultas canônicos:

```text
module list
module describe spatialseed.procedural
application list
application use modeling
ui component list --module spatialseed.authoring
ui profile validate compact-mobile
ui profile use compact-mobile
extension validate ./minha-extensao.json
extension install ./minha-extensao.json
extension remove minha.extensao
```

Há dois níveis deliberadamente diferentes:

1. **Módulo embutido confiável**: distribuído com o aplicativo; possui factory JavaScript e capabilities mínimas explicitamente injetadas.
2. **Extensão interna do usuário**: manifesto declarativo, catálogos e procedimentos na linguagem já existente; executa no worker SES, produz plano, passa por validação e só então faz commit pelos comandos permitidos.

Uma extensão de usuário pode acrescentar procedimentos, formulários derivados de schemas, ferramentas compostas, atalhos e perfis. Ela não recebe DOM, Three.js, `window`, storage, sandbox mutável nem referências internas. Se uma capacidade nova exigir código nativo, ela primeiro entra como módulo embutido versionado; só depois pode ser declarada por extensões.

## 8. O que aproveitar da 0046

| Elemento | Decisão | Condição |
| --- | --- | --- |
| IDs estáveis e descritores tipados de componentes | preservar e simplificar | integrados ao manifesto v2 e validados contra o runtime |
| Vocabulário de kinds e sizing | preservar | uma única representação canônica, sem aliases permanentes |
| Grid determinístico com `push/swap/reject` | portar com testes | função pura dentro de `interface` |
| Separação conceitual aplicação/perfil | preservar | aplicação ativa módulos; perfil contém somente layout |
| Diagnóstico de referências ausentes | preservar | erro de validação antes da ativação; fallback apenas em safe mode explícito |
| Preview sem commit | preservar | transação sobre o mesmo store do HUD vivo |
| Designer de layout | reimplementar sobre a API final | sem conhecer DOM adotado ou stores globais |
| Adapters de capacidades atuais | usar temporariamente | fontes explícitas, sem DOM nem estado próprio; remover por família migrada |

## 9. O que não portar

- os seis pacotes da 0046 como um subsistema paralelo;
- `UiModuleRegistry` separado de `ModuleRegistry`;
- ativação local que não muda os módulos reais do domínio;
- descoberta/adopção permanente de controles DOM;
- listeners e handlers guardados junto de descritores;
- sincronização por `window`, `CustomEvent`, storage ou observadores globais;
- overrides de comandos e ativação dentro de perfil de layout;
- reexport que cria o ciclo layout ↔ designer;
- CSS acumulado de forma integral;
- painéis, overlays ou safe mode declarados sem implementação end-to-end;
- correções visuais que não passem por documento, policy e renderer canônicos.

## 10. Migração sem sistemas paralelos

Cada etapa abaixo termina com o sistema executável e com remoção do caminho substituído.

### Etapa 0 — congelar a linha de base

- adicionar o benchmark reproduzível de famílias, traços, árvore virtual, batches e cena de 10.000 objetos;
- registrar medidas do commit base e limites relativos;
- corrigir o manifesto PWA já desatualizado no `main` sem mudança funcional;
- adicionar auditoria de imports, ciclos e fronteiras;
- manter um único mapa de equivalência entre pacote atual e módulo de destino.

Critério de saída: baseline repetível, testes verdes e nenhuma mudança de comportamento.

### Etapa 1 — kernel v2 e composition root

- evoluir `plugin-api` + `runtime-api` + `editor-commands` para o contrato canônico;
- fazer os registries existentes contribuírem por manifesto, sem reescrever seus algoritmos;
- extrair de `createWebRuntime.js` somente a composição e a injeção de dependências;
- retirar testes/diagnósticos das dependências de produção e quebrar o ciclo com `apps/web`.

Critério de saída: os mesmos comandos e testes, um grafo acíclico e boot pelo registro único.

### Etapa 2 — documentos de aplicação e interface

- criar `ApplicationDefinition`, `UiProfile` e compositor puro dentro de `interface`;
- portar os contratos úteis e o grid da 0046, sem DOM e sem designer;
- montar uma primeira fatia vertical pequena — histórico/seleção ou troca de ferramenta — a partir do catálogo;
- remover do HTML e de `EditHud` exatamente os controles dessa fatia.

Critério de saída: a fatia nasce do descritor, aparece no HUD, funciona pelo console e não possui caminho legado alternativo.

### Etapa 3 — HUD completo e designer

- migrar por famílias coerentes de controles;
- reaproveitar uma única factory por kind;
- conectar HUD vivo e designer ao mesmo profile store injetado;
- para cada família migrada, apagar markup, listener, query DOM e CSS que perderam função;
- remover o conversor legado ao concluir a última família.

Critério de saída: `index.html` é shell; a interface inteira é reproduzível a partir de aplicação + perfil + catálogos.

### Etapa 4 — extensões internas

- integrar `ExtensionCatalog` ao `ProcedureCatalog` e ao worker SES existentes;
- implementar validar/importar/exportar/ativar/desativar via comandos;
- gerar formulários de procedimentos pelos schemas;
- adicionar permissões e rollback atômico.

Critério de saída: uma extensão declarativa criada pelo usuário acrescenta procedimento e UI sem editar o core e sem acesso direto a DOM ou documento mutável.

### Etapa 5 — consolidação física e remoção legada

- consolidar os pacotes internos sob os oito módulos, mantendo APIs públicas explícitas;
- remover `editor-transform-tools`;
- extrair apenas invariantes úteis de `world-model` para `document` e remover o modelo paralelo;
- mover os diretórios antigos da raiz para o protótipo histórico que ainda os usa, ou arquivar o protótipo inteiro;
- remover arquivos, aliases, CSS e documentação que descrevam rotas inexistentes;
- reduzir `apps/web` a boot e adapters de plataforma.

Critério de saída: não há pacote sem consumidor, ciclo, API duplicada, adapter de migração nem fonte concorrente de verdade.

## 11. Gates de integração

Nenhuma etapa entra no `main-proposal` sem todos os gates aplicáveis:

### Correção

- `git diff --check` sem erros;
- `node --check` em todo JavaScript;
- auditoria de entrypoints e precache atual;
- suíte real do runtime sem regressão;
- testes dos manifests, schemas, resolução de dependências, ativação atômica e dispose;
- teste provando equivalência entre console, UI e script para o mesmo comando;
- teste provando que preview não altera o documento persistente.

### Arquitetura

- zero ciclos no grafo de módulos;
- zero import profundo entre módulos;
- zero acesso a DOM fora de `platform-web`;
- zero acesso a Three.js fora de `renderer-three` e adapters aprovados;
- zero mutação persistente fora de comandos/transações;
- zero componente de UI com handler, elemento ou callback serializado;
- zero pacote mantido sem consumidor explícito.

### Performance

- os formatos compactos de famílias e traços não são expandidos pela composição de UI;
- 10.000 membros continuam em um batch quando compartilham geometria/material;
- paginação virtual de 10.000 recursos materializa apenas a página solicitada;
- autofusão visita no máximo os candidatos definidos pelo índice atual;
- contagens, chunks, bytes estimados e bytes serializados não aumentam sem decisão arquitetural registrada;
- mediana de cinco execuções intercaladas `base/candidato`, na mesma máquina, não pode regredir mais de 10% nos benchmarks críticos; p95 não pode regredir mais de 15%;
- nenhuma interação de ponteiro ou troca de ferramenta pode introduzir varredura proporcional ao número total de objetos passivos.

### Interface

- validação visual desktop e mobile;
- navegação por teclado, foco visível, nomes acessíveis e redução de movimento;
- drag/resize sem interceptação global e com cancelamento seguro;
- troca de aplicação e perfil refletida no HUD vivo, não apenas no preview;
- safe mode é um caminho testado de ativação real, não apenas um campo de configuração.

## 12. Regra de sincronismo

O branch nasce exclusivamente do hash indicado no cabeçalho. Toda mudança deve ser pequena, revisável e acompanhada de:

1. hash pai explícito;
2. diff sem arquivos gerados acidentalmente;
3. comandos de validação e resultados;
4. impacto nos gates de performance;
5. lista exata do legado removido;
6. novo hash do commit.

Não haverá push, merge, rebase ou atualização remota automática. Se o `origin/main` avançar, a nova base será comparada conscientemente; o branch não será “atualizado” por mistura silenciosa. O sincronismo entre ambientes será feito por commits/patches identificados por hash e aplicados na mesma ordem.

## 13. Sequência inicial de incrementos

O incremento `0047a` contém somente a etapa zero: benchmark e auditoria
arquitetural versionados, mapa único de migração, correção do precache e gates
monotônicos. Seus procedimentos estão em
[`BASELINE_GATES.md`](BASELINE_GATES.md).

O incremento `0047b` contém somente:

1. contrato `module-v2` com validação e ativação atômica;
2. adaptação do módulo de região e do catálogo inicial de experimentos, sem
   reescrever seus algoritmos;
3. testes de rollback, ordem de descarte e referências inválidas.

O incremento `0047c` contém somente:

1. API pública `platform-web` para os adapters antes internos a `apps/web`;
2. definições separadas de aplicação normal e diagnóstico;
3. carregamento e rollback de extensões confiáveis antes da publicação do
   runtime;
4. remoção de testes, benchmarks e auditorias do grafo e precache de produção.

O ciclo `apps/web` ↔ `runtime-test-plugin` foi removido: nenhuma das duas
arestas permanece e o perfil diagnóstico conserva os mesmos comandos por
composição explícita.

O incremento `0047d` tornou `tools/no_cache_server.py` o servidor HTTPS
canônico do checkout atual e corrigiu a normalização de raiz e escopo do
Service Worker.

O incremento `0047e` contém somente:

1. fachada canônica serializável de capacidades de autoria;
2. adapters explícitos para modos de transformação e `EditToolRegistry`, sem
   duplicar estado, transação ou algoritmo;
3. IDs estáveis para mover/girar/escalar e presets distintos para desenhar tubo
   ou distribuir ao desenhar;
4. comandos, consultas e console `authoring.tool.*`, mais testes de equivalência
   e idempotência.

O incremento não reorganiza visualmente o HUD. A próxima fatia deve usar esse
catálogo numa família visual real e remover os bindings hardcoded equivalentes,
priorizando fluidez humana e disponibilidade procedural em vez de modularização
sem efeito perceptível.

O incremento `0047f` contém a primeira projeção visual dessa porta:

1. descritores v2 com papéis de entrada e reset canônico de parâmetros;
2. cinco intenções `draw.*` sobre o mesmo capturador de caminho/perfil;
3. HUD de autoria por desenho e painel genérico de parâmetros alimentados pelo
   catálogo, sem descoberta pelo DOM;
4. transformação e as operações topológicas já catalogadas encaminhadas por
   `authoring.tool.*` nas superfícies migradas;
5. planos imutáveis para sweep desenhado, extrusão de perfil e revolução, com
   preview e commit pela autoridade existente.

O `mesh.inset` triangular permanece fora da captura por contorno: sua
implementação atual aceita apenas `amount`. A fronteira canônica já possui o
papel `boundary`, mas ele somente será conectado quando o núcleo topológico
implementar o recorte planar correspondente.
