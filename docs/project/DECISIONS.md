# Registro de decisões do SpatialSeed

> Documento vivo. Auditado em 24 de julho de 2026 até o marco `0028e`.
> Este arquivo registra decisões duráveis, não detalhes passageiros de build.

## Como ler

Cada decisão possui um identificador estável, estado, decisão, motivação e
consequências. Os estados usados são:

- **vigente:** deve orientar novas mudanças;
- **implementada:** vigente e já representada no código;
- **planejada:** aceita, mas ainda incompleta;
- **superada:** preservada apenas para explicar a evolução.

## D-001 — Estado lógico independente do renderer

**Estado:** implementada.

Objetos, grupos, aparências e seleção não são definidos por `Mesh`,
`InstancedMesh`, `Object3D` ou qualquer backend visual. Three.js é uma projeção
substituível do estado lógico.

**Motivação:** permitir múltiplos viewers, renderização textual, testes sem GPU,
serialização estável e troca futura de backend.

**Consequências:** proxies e objetos auxiliares do renderer são transitórios;
IDs visuais não substituem IDs do mundo; otimizações gráficas não podem mudar a
semântica dos objetos.

## D-002 — Arquitetura orientada a comandos

**Estado:** implementada.

Toda mutação editorial deve existir uma vez na camada pública de comandos. GUI,
Inspector, console, automação e programas chamam essa camada em vez de alterar
o sandbox diretamente.

**Motivação:** uma única fonte de comportamento, reutilização entre superfícies,
histórico coerente e testes sem interação visual.

**Consequências:** uma função disponível apenas na interface é incompleta;
botões não são APIs; queries e eventos permanecem separados dos comandos.

## D-003 — Região, sandbox e viewer são níveis distintos

**Estado:** implementada localmente; distribuição remota planejada.

A região representa o estado publicável; o sandbox contém a edição local e seu
histórico; o viewer mantém somente estado de apresentação.

**Motivação:** impedir que previews, gestos e desfazer local contaminem uma
futura autoridade compartilhada.

**Consequências:** undo/redo não é global; publicar uma proposta deverá ser uma
operação explícita; navegação de câmera nunca altera o mundo.

## D-004 — Preview não é commit

**Estado:** implementada.

Transformações interativas podem produzir previews no renderer, mas somente o
resultado final confirmado gera comando e histórico.

**Motivação:** eficiência visual, atomicidade e ausência de centenas de eventos
persistentes durante um arraste.

**Consequências:** cancelar restaura a projeção sem comando; renderer e editor
devem suportar sessões transacionais.

## D-005 — Geometrias e propriedades entram por registros

**Estado:** implementada.

`GeometryRegistry` e `PropertyRegistry` descrevem famílias, campos, tipos,
limites e normalização. Painéis e console consultam os mesmos descritores.

**Motivação:** acrescentar capacidades sem espalhar condicionais por renderer,
Inspector e gramática textual.

**Consequências:** novos providers precisam de contrato e testes; a UI não deve
codificar listas autoritativas paralelas.

## D-006 — Aparências e assets são normalizados

**Estado:** implementada.

Objetos referenciam `appearanceId`; aparências referenciam materiais, texturas e
transformações de textura. Conteúdo repetido é compartilhado e contado por
referência.

**Motivação:** evitar Base64 e materiais duplicados, reduzir memória e permitir
cache coerente entre objetos e lotes.

**Consequências:** importação valida referências; alterações de aparência
invalidam caches de forma explícita; o formato normalizado não deve voltar a
embutir recursos em cada objeto.

## D-007 — Instanciamento é otimização, não identidade

**Estado:** implementada.

Objetos lógicos continuam individuais mesmo quando são projetados num
`THREE.InstancedMesh`. A chave de lote deriva de geometria e aparência
compatíveis, não da identidade editorial.

**Motivação:** cenas grandes com poucos draw calls sem sacrificar seleção,
propriedades ou histórico por objeto.

**Consequências:** picking resolve `instanceId` para objeto lógico; slots podem
ser reutilizados; cor por instância não deve necessariamente trocar o lote.

## D-008 — Grupos usam transformações locais

**Estado:** implementada para hierarquia editorial.

Filhos mantêm transform local em relação à âncora do grupo. Reparenting,
desagrupamento e commits mundiais convertem matrizes sem deriva visível.

**Motivação:** grupos aninháveis, pivô compartilhado e preservação das relações
internas durante transformações externas.

**Consequências:** o renderer calcula transforms mundiais por projeção; excluir
ou duplicar um grupo opera sobre a subárvore; ciclos e pais ausentes são
rejeitados.

## D-009 — Repetição afim possui semântica matemática explícita

**Estado:** implementada.

A repetição canônica usa uma matriz delta:

```text
M(n+1) = ΔM · M(n)
```

Expressões paramétricas usam AST própria, variáveis autorizadas e convenções
angulares explícitas.

**Motivação:** determinismo, segurança, independência de `eval` e capacidade de
testar precedência, unidades e contratos de índice.

**Consequências:** a linguagem afim não é JavaScript; mudanças de sintaxe exigem
compatibilidade ou migração documentada.

## D-010 — JavaScript vive acima do runtime espacial

**Estado:** implementada.

Programas JavaScript executam em Worker e `Compartment` SES. Não recebem runtime,
sandbox, renderer, DOM, rede ou arquivos. Funções matemáticas, gerador aleatório
determinístico, `print`, snapshot clonado e capacidades espaciais são fornecidos
explicitamente.

**Motivação:** oferecer variáveis, funções, objetos e controle de fluxo sem
entregar autoridade irrestrita sobre a aplicação.

**Consequências:** programas são síncronos e têm timeout, orçamento e fronteira
`structuredClone`; uma falha encerra a sessão do Worker; o isolamento ainda não
equivale a uma auditoria formal de segurança.

## D-011 — Programas produzem planos antes de alterar a cena

**Estado:** implementada.

`spatial.create` emite intenções serializáveis. `plan commit` valida revisão,
capabilities, geometrias, posições, cores e orçamento, simula o reducer e só
então publica uma transação atômica.

**Motivação:** cancelar, falhar ou terminar um programa sem deixar estado
parcial; permitir revisão humana e um único item de undo.

**Consequências:** um plano obsoleto é rejeitado; handles do programa só recebem
IDs reais no commit; `plan discard` não produz efeito.

## D-012 — Catálogos armazenam fonte, não execução

**Estado:** implementada.

Procedimentos são funções nomeadas em um catálogo textual versionado. Importar,
editar ou persistir uma definição nunca executa código. `procedure run` envia a
fonte ao mesmo Worker SES e mantém o ciclo de plano e commit.

**Motivação:** bibliotecas compartilháveis e editáveis sem criar uma via de
autoridade paralela.

**Consequências:** `merge` rejeita conflitos atomicamente; `replace` exige
confirmação na interface; projeto espacial e catálogo são arquivos distintos.

## D-013 — Distribuição web estática sem build obrigatório

**Estado:** implementada.

`apps/web/`, `packages/` e `vendor/` são publicados diretamente. Dependências
necessárias em runtime são vendorizadas; Node/npm não são requisitos para usar
ou desenvolver o cliente atual.

**Motivação:** execução simples no Termux, GitHub Pages transparente e ausência
de artefatos compilados divergentes da fonte.

**Consequências:** caminhos relativos e import maps são parte do contrato de
distribuição; um servidor HTTP continua necessário; arquivos estáticos novos
devem entrar no manifesto PWA.

## D-014 — PWA guarda o aplicativo, não substitui arquivos de projeto

**Estado:** implementada.

O service worker permite abrir o cliente offline após o primeiro carregamento.
Salvar/Abrir permanece a persistência portátil da cena.

**Motivação:** evitar a falsa promessa de que instalar o PWA protege o trabalho
do usuário.

**Consequências:** recuperação automática local é uma etapa futura; limpeza de
dados do navegador pode remover preferências e catálogos locais; o rodapé deve
mostrar diferenças entre publicação e cache controlador.

## D-015 — Documento e transporte de arquivo são separados

**Estado:** implementada.

`ProjectService` produz e consome documentos; `BrowserProjectFileGateway` decide
entre File System Access API e fallback de seletor/download.

**Motivação:** manter regras de projeto fora do DOM e sobreviver às limitações
do Chrome Android instalado.

**Consequências:** bloqueio de picker nativo desativa essa via durante a sessão;
cancelamento não altera o projeto; **Novo** descarta a referência anterior.

## D-016 — Interface inicial é declarativa

**Estado:** implementada.

Ordem dos controles, menus, painéis, layout da barra, zona de saída do modo cena
e tamanho inicial do gizmo vêm de `apps/web/config/ui.default.json`.

**Motivação:** reorganizar a apresentação sem mover lógica de domínio ou editar
vários módulos.

**Consequências:** preferências locais têm precedência sobre defaults; o
manifesto referencia controles existentes, não comandos internos.

## D-017 — Build possui uma fonte autoritativa explícita

**Estado:** implementada.

Versão, build e canal são carregados de `apps/web/build-info.json`. HTML não
mantém uma etiqueta estática concorrente.

**Motivação:** eliminar diagnósticos contraditórios e caches aparentemente
novos executando módulos antigos.

**Consequências:** imports ainda podem usar query strings de cache, mas o rótulo
humano vem do manifesto; PWA informa também o build do controlador efetivo.

## D-018 — Testes e desempenho são superfícies do runtime

**Estado:** implementada; política comparativa ainda incompleta.

Testes arquiteturais e benchmarks são executáveis pelo console no mesmo cliente
que usa os módulos reais. Benchmarks de cena usam sandbox isolado.

**Motivação:** validar no Android/navegador e acompanhar regressões sem uma
infraestrutura de build obrigatória.

**Consequências:** mudanças estruturais exigem `runtime test all`; alterações de
desempenho precisam registrar dispositivo, build, cenário e distribuição, não
apenas duração total da suíte.

## D-019 — Desenvolvimento por branches e patches auditáveis

**Estado:** vigente.

Cada incremento usa branch `feature/NNNN-*`, commits pequenos, teste antes da
integração e patches aplicáveis no Termux. A autoria é de Rogério Duarte; ajuda
automatizada pode aparecer como `Assisted-by: OpenAI Codex`.

**Motivação:** aprendizado, revisão local, propriedade intelectual e reversão
sem operações destrutivas.

**Consequências:** assistentes não fazem push autônomo; o usuário aplica, testa e
publica; hashes temporários podem diferir após `git am`, e o hash do repositório
publicado torna-se o identificador canônico.

## D-020 — Recuperação local preservará apenas commits editoriais

**Estado:** planejada.

A futura recuperação em IndexedDB deve gravar comandos confirmados, de forma
atômica, versionada e postergada. Previews nunca serão persistidos. Blobs grandes
podem migrar para OPFS.

**Motivação:** recuperar acidentes sem confundir cache local com formato
portátil ou salvar estados transitórios.

## D-021 — Persistência compacta será retrocompatível

**Estado:** planejada.

O formato atual deve continuar abrindo enquanto novas versões passam a
preservar protótipos, instâncias, hierarquias ou receitas sem expandir toda
estrutura procedural.

**Motivação:** evitar arquivos de megabytes para cenas que podem ser descritas
por poucos parâmetros, sem perder projetos existentes.

## D-022 — Autoridade regional precede a tecnologia de convergência

**Estado:** planejada.

Colaboração distribuída preservará a região como domínio de autoridade. Antes
de escolher CRDT, OT ou protocolo próprio, o projeto definirá um envelope de
operação, causalidade, matriz de conflitos geométricos e política de publicação.

**Motivação:** convergência de estruturas replicadas não garante validade
geométrica, autorização ou intenção correta. Yjs e Automerge são candidatos de
implementação, não partes antecipadas do modelo canônico.

**Consequências:** transporte, merge e autoridade permanecem substituíveis;
provas devem convergir a um hash canônico e incluir conflitos semânticos; detalhes
da biblioteca escolhida não devem vazar para o formato `.spatialseed`.

## D-023 — Isolamento de scripts possui backend substituível

**Estado:** implementada para Worker + SES; avaliação de QuickJS/WASM planejada.

Scripts e futuros plugins dependem de uma fronteira comum de capabilities,
orçamento, interrupção e valores serializáveis. Worker + SES permanece vigente
para programas planejadores. QuickJS/WASM será comparado como backend adicional
para código de terceiros com threat model mais severo.

**Motivação:** a segurança depende da autoridade concedida e de toda a ponte
host–guest, não apenas da VM. Uma troca prematura perderia compatibilidade,
depuração e desempenho sem comprovar redução suficiente de risco.

**Consequências:** nenhum backend recebe DOM, renderer ou sandbox; a escolha
exige corpus comum, benchmark mobile, testes negativos e registro da versão do
executor; SES não será removido por analogia com implementações históricas de
Realms.

## D-024 — Gramáticas procedurais crescem a partir de operadores do domínio

**Estado:** planejada.

O SpatialSeed adotará conceitos de gramáticas de forma — escopo orientado,
`split`, repetição, componentes, extrusão e regras — como operadores próprios
sobre planos e identidades geométricas. Não adotará agora uma linguagem CGA
completa nem acoplará o modelo canônico a uma engine externa.

**Motivação:** os operadores dependem de curvas, perfis e topologia estável. Sua
semântica pode ser testada primeiro pela API espacial e orquestrada pelo runtime
JavaScript antes de justificar uma nova sintaxe.

**Consequências:** receitas devem ser determinísticas, inspecionáveis e
compactas; geração continua passando por plano e commit; gramática textual só
entra depois que os operadores forem independentes da superfície linguística.

As premissas, provas de conceito e custos destas três decisões estão detalhados
em [`STRATEGIC_ARCHITECTURE_REVIEW.md`](STRATEGIC_ARCHITECTURE_REVIEW.md).

## D-025 — Experimentos são definições declarativas que produzem planos

**Estado:** implementada internamente.

Um experimento registra identidade, parâmetros tipados e fonte de programa. O
host gera a interface a partir dos descritores e executa a fonte pelo runtime de
programas. O experimento não fornece DOM, CSS, handlers ou nomes arbitrários de
comandos e não altera a cena durante a geração.

**Motivação:** permitir laboratórios reutilizáveis por painel e console sem
instalar um segundo sistema de plugins nem conceder autoridade visual ao código
do experimento.

**Consequências:** a mesma definição deve produzir o mesmo plano para os mesmos
parâmetros, seed, snapshot e revisão; somente o commit explícito altera o
sandbox; a API ainda é interna e não autoriza JavaScript externo.

## D-026 — Ações de interface possuem identidade semântica

**Estado:** implementada.

Botões e atalhos identificam ações estáveis em `UiActionRegistry`. A ação
encaminha intenção para comandos e serviços existentes; não se torna uma nova
camada de domínio. Layout, menus, painéis e preferências continuam descritos
pelo manifesto e pelos compositores anteriores.

**Motivação:** impedir handlers de teclado paralelos, permitir configuração e
detecção de conflitos e preparar extensões da interface sem duplicar operações.

**Consequências:** campos textuais retêm seu próprio teclado; contextos de
atalho são explícitos; reorganizar a barra não muda a semântica; futuros
editores de atalhos e workspaces devem editar os mesmos identificadores.

## D-027 — Animação de preview é overlay efêmero e restaurável

**Estado:** implementada para transformações e cores.

O runtime temporal captura alvos, compila expressões e projeta matrizes e cores
temporárias sobre o renderer em passo fixo. Pausar conserva o instante; parar
restaura o estado canônico. O overlay não altera sandbox, histórico nem arquivo
`.spatialseed`.

**Motivação:** provar tempo, presets e composição por objeto sem decidir
prematuramente o formato persistente de clips, eventos ou scripts anexados.

**Consequências:** mudanças editoriais invalidam ou restauram a projeção
temporal; materiais não são recriados por quadro; persistência futura exige um
contrato próprio e não pode serializar acidentalmente o cache visual.

## D-028 — Escopo de grupo e lote procedural são explícitos e atômicos

**Estado:** implementada no Inspector e na animação.

Uma operação pode tratar raízes selecionadas como unidades rígidas ou expandir
grupos aninhados em objetos renderizáveis. Expressões de propriedade são
compiladas uma vez, avaliadas e normalizadas para todos os alvos antes de um
único comando.

**Motivação:** seleções hierárquicas têm dois significados legítimos e não podem
ser expandidas silenciosamente. Lotes procedurais precisam da mesma garantia de
atomicidade das edições literais.

**Consequências:** falha em qualquer alvo rejeita o lote inteiro; a ordem de
`i` e `u` é determinística; grupos lógicos não recebem propriedades visuais ao
usar escopo renderizável; animações diferentes por objeto são compostas em
faixas sem transformar o grupo numa lista informal de meshes.

## Decisões superadas ou rejeitadas

- **Build hard-coded no HTML:** superado por `build-info.json`.
- **Lógica própria no Inspector ou no console:** rejeitada em favor dos mesmos
  comandos e registros.
- **Aplicação mantida na raiz do repositório:** superada; a aplicação atual é
  `apps/web/`; arquivos da raiz são históricos.
- **PWA como persistência automática da cena:** rejeitada; offline e documento
  de projeto são responsabilidades diferentes.
- **Grupo como seleção persistida sem transform local:** superada pela hierarquia
  de entidades com âncora.
- **JavaScript com acesso direto ao runtime:** rejeitada; programas planejam por
  capacidades restritas.
- **CRDT como substituto automático da autoridade regional:** rejeitada;
  convergência e autoridade são responsabilidades distintas.
- **QuickJS/WASM como troca imediata e obrigatória de SES:** rejeitada; será um
  backend candidato condicionado a threat model e benchmark.
- **Compatibilidade integral com CGA antes de topologia e operadores próprios:**
  rejeitada no horizonte próximo.

## Processo para novas decisões

Uma decisão deve entrar aqui quando alterar uma fronteira durável: autoridade,
formato, API, semântica, segurança, persistência, distribuição ou workflow. Uma
mudança de botão, cor ou número de build não é uma decisão arquitetural.

Ao registrar:

1. atribua novo identificador;
2. declare estado e motivação;
3. descreva consequências e incompatibilidades;
4. aponte testes ou especificações relacionados;
5. marque explicitamente a decisão anterior como superada, sem apagar o
   histórico.
