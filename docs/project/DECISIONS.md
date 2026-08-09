# Registro de decisões do SpatialSeed

> Documento vivo. Auditado em 8 de agosto de 2026 até o marco `0053g`.
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
distribuição; uma origem servida continua necessária; arquivos estáticos novos
devem entrar no manifesto PWA. O fluxo HTTPS local atual é definido por D-047.

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

## D-020 — Recuperação local preserva apenas commits editoriais

**Estado:** implementada para checkpoints e comandos no IndexedDB.

A recuperação em IndexedDB grava um checkpoint limpo e a sequência vigente de
comandos confirmados, de forma versionada, postergada e substituída por
transação. Previews nunca são persistidos. A restauração valida e reaplica toda
a sequência antes de substituir o histórico do sandbox. Blobs grandes poderão
migrar para OPFS.

**Motivação:** recuperar acidentes sem confundir cache local com formato
portátil ou salvar estados transitórios.

**Consequências:** cada sandbox possui identidade local persistente; abrir ou
criar projeto inicia outra identidade; checkpoint limpo reabre automaticamente
e rascunho sujo exige continuar, exportar ou descartar. Seleção, câmera, painéis
e animação não entram no registro. Limpar dados do navegador pode removê-lo.

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

## D-029 — Portal, aplicativo e protótipos são superfícies distintas

**Estado:** implementada para entrada e catálogo.

A raiz publicada é um portal estático de orientação. O editor mantido continua
em `apps/web/`; seu laboratório declarativo continua dentro do runtime; HTMLs
independentes ficam em `apps/experiments/` e são descritos por um manifesto
canônico em `apps/web/experiments/catalog.json`.

**Motivação:** a antiga raiz apresentava um protótipo obsoleto como se fosse a
aplicação atual, enquanto experimentos independentes não tinham entrada comum,
maturidade explícita nem inventário verificável de dependências.

**Consequências:** o portal não implementa edição; o catálogo não torna um
protótipo parte do núcleo; todos os HTMLs históricos precisam estar
catalogados; caminhos permanecem relativos para funcionar sob o prefixo do
GitHub Pages; dependências externas observadas devem ser declaradas e podem ser
rejeitadas por auditoria offline estrita.

## D-030 — Projeção da câmera de navegação pertence ao viewer

**Estado:** implementada para a câmera de navegação.

Posição, quaternion, distância de foco, campo visual, `near` e `far` são
validados e armazenados no `ViewerState`. O alvo é derivado da posição,
orientação e distância de foco; não existe como segunda orientação
autoritativa. `ViewerCameraController` aplica o estado pelo adaptador do
renderer e sincroniza de volta a navegação manual do `OrbitControls`.

**Motivação:** diferentes viewers do mesmo sandbox precisam poder escolher
recorte, navegação e câmera ativa sem produzir comandos editoriais nem
sobrescrever a experiência dos demais.

**Consequências:** `0 < near < far` é uma invariante pública; alterações da
câmera de navegação não entram em undo/redo nem no arquivo; painel e console chamam comandos
`viewer.camera.*`; procedimentos recebem uma capability declarativa que produz
plano revisável. Planos de câmera local não podem misturar mutações espaciais
persistentes na mesma transação. Objetos câmera persistentes são entidades
distintas e não revogam esta fronteira.

## D-031 — Viewers locais coordenam um sandbox por revisão

**Estado:** implementada localmente.

Cada aba conserva apresentação e seleção próprias, mas referencia a mesma
identidade de sandbox. Uma autoridade local serializa `dispatch`, `undo` e
`redo`; réplicas enviam intenções pela revisão observada e recebem snapshots
atômicos por `BroadcastChannel`. A Web Locks API escolhe a autoridade quando
disponível.

**Motivação:** provar múltiplas projeções simultâneas sem transformar renderer,
IndexedDB ou ordem de chegada das mensagens em autoridade do mundo.

**Consequências:** intenção obsoleta é rejeitada e não reavaliada
silenciosamente; somente a autoridade substitui projeto, recuperação ou base
regional; câmera, seleção, hover e painéis nunca entram no snapshot
compartilhado. O protocolo é local e não antecipa CRDT, identidade remota ou
autorização distribuída.

Um diretório transitório anuncia somente sessões vivas da mesma origem e agrupa
viewers por `sandboxId`. A superfície **Projetos / viewers** torna explícito o
destino de um novo viewer e também permite criar ou abrir um projeto
independente em nova aba. Um viewer de entrada aguarda o primeiro snapshot antes
de disputar autoridade ou iniciar recuperação. Ao fechar a autoridade, uma
réplica automática adquire a trava liberada, conserva o snapshot já sincronizado
e adota o diário de recuperação sem restaurar por cima dele um checkpoint
anterior.

## D-032 — Reprodução local compartilha definição e época

**Estado:** implementada para animações efêmeras de objetos.

Uma sessão temporal entre viewers contém alvos concretos, definição declarativa,
`playbackId`, sequência, estado e época absoluta. A autoridade local serializa
início, pausa, retomada e parada; cada viewer compila a definição e projeta seus
próprios quadros.

**Motivação:** transmitir matrizes por quadro aumentaria tráfego, produziria
engasgos e ainda não resolveria abas desaceleradas pelo navegador. Uma época
comum permite que uma aba suspensa ou aberta depois avalie diretamente o
instante vigente.

**Consequências:** a sessão usa protocolo separado do snapshot editorial;
intenções com revisão ou sequência obsoleta são rejeitadas; uma mudança
editorial encerra a reprodução em todas as abas. Definição, tempo e overlay não
entram no documento, histórico, recuperação ou futura persistência de clips.

## D-033 — Objetos câmera persistem; ativação permanece local

**Estado:** implementada para câmera perspectiva.

Um objeto `kind: "camera"` é uma entidade hierárquica do documento, com
transform local, parâmetros de projeção e identidade estável. A cena pode
declarar `defaultCameraId`, mas cada `ViewerState` conserva seu próprio
`activeCameraId`. Ativar uma câmera projeta sua pose mundial no controlador de
navegação; navegar manualmente apenas desfaz o vínculo local.

**Motivação:** múltiplas vistas precisam compartilhar enquadramentos nomeados
sem voltar a tornar Three.js autoritativo nem sincronizar a câmera concreta de
cada aba.

**Consequências:** criar, transformar, capturar, definir projeção e escolher a
câmera padrão são comandos persistentes com undo/redo; ativar e desativar são
ações locais. Helpers de corpo e frustum pertencem ao renderer. O serializer
escreve schema 3 e o leitor continua aceitando schemas 1 e 2. Animação de
câmera permanece fora deste marco e deverá reutilizar o overlay temporal no
`0029g`.

## D-034 — Gestos compartilhados usam preview matricial limitado

**Estado:** implementada localmente.

Uma transformação interativa publica uma sessão efêmera com origem, identidade,
sequência, revisão-base e matrizes mundiais amostradas a até 30 Hz. As demais
abas aplicam essas matrizes somente ao renderer e, quando pertinente, à câmera
ativa local. Soltar o gizmo continua produzindo um único comando persistente.

**Motivação:** ao contrário de uma animação declarativa, um gesto humano não
possui definição e época suficientes para ser recalculado localmente. Esperar o
commit impede direção de câmera em tempo real; persistir cada amostra destrói a
atomicidade do undo.

**Consequências:** preview manual e animação usam canais distintos; nenhuma
amostra entra no documento, histórico, arquivo ou recuperação. Cancelamento,
rejeição, mudança editorial, despedida ou timeout restaura o estado confirmado.
Taxa e diagnóstico pertencem ao transporte; a autoridade editorial continua
exclusivamente na camada de comandos.


## D-035 — Edição topológica usa meia-aresta transitória e commit por descritor

**Estado:** implementada no núcleo 0035a.

A sessão de edição reconstrói, a partir da `BufferGeometry`, um complexo
triangular transitório com meias-arestas, pares opostos, adjacências, contornos
e arestas soltas. Operações de vértices, arestas e faces são funções puras que
recebem um descritor e produzem outro descritor validado. Three.js permanece
responsável apenas por projeção, picking e preview.

**Motivação:** editar diretamente uma `BufferGeometry` cacheada ou um
`InstancedMesh` poderia alterar instâncias compartilhadas e contornar comandos,
histórico e validação. A topologia explícita fornece as relações locais exigidas
por extrusão, divisão, colapso, ponte, seleção conectada e futuras operações de
DCC sem transformar o renderer em autoridade.

**Consequências:** a sessão possui undo/redo próprio com descritor e seleção
completos; o sandbox recebe no máximo um `object.geometry.replace` no commit;
malhas não manifold podem ser bloqueadas; faces persistem trianguladas; arestas
soltas são metadados do descritor. UVs por canto, n-gons persistentes, bevel,
knife e assets compartilhados continuam extensões posteriores sobre o mesmo
contrato.

## D-036 — Referências espaciais são snapshots tipados

**Estado:** implementada inicialmente no build 0037a.

Objetos podem ser resolvidos explicitamente como `PathReference`,
`ProfileReference` ou `PointReference`. A resolução aplica a transformação
mundial da hierarquia, valida a extração solicitada e entrega dados imutáveis à
ferramenta. Tubo, varredura e distribuição consomem essas referências pelos
mesmos comandos usados pelo painel e pelo console.

**Motivação:** aceitar objetos como parâmetros amplia composição geométrica sem
fazer o renderer interpretar relações procedurais nem introduzir dependências
ocultas no documento. Um objeto fechado não deve virar caminho por heurística
ambígua; linha central, contorno e arestas soltas são extrações nomeadas.

**Consequências:** o resultado copia a referência no momento do comando e
permanece independente da origem. A varredura usa frames de transporte paralelo
e persiste uma malha triangular. Referências vinculadas, atualizações
incrementais e detecção de ciclos ficam reservadas a um futuro grafo explícito
de modificadores; não serão simuladas por IDs informais dentro de descritores.

## D-037 — Preferências de ferramenta usam identidade semântica versionada

**Estado:** implementada para continuidade da ferramenta.

Preferências locais de ferramenta são indexadas pelo `toolId` semântico e
persistidas num registro com versão explícita. Uma escrita sem alvo declarado
resolve uma única ferramenta pelo contexto corrente; não existe atualização
implícita de várias ferramentas.

**Motivação:** HUD, workspace, console e futuras fichas contextuais precisam
enxergar o mesmo valor sem que uma opção de posicionamento altere desenho,
transformação ou outra sessão. Testes também não podem herdar preferências reais
do navegador.

**Consequências:** armazenamento é uma dependência injetável nos testes;
migrações leem e preservam registros anteriores; chaves desconhecidas não
viram mutações de documento. Parâmetros, presets e layouts futuros devem
reutilizar um armazenamento versionado por identidade semântica, mas permanecem
separados do estado efêmero da sessão e do arquivo `.spatialseed`.

## D-038 — Parâmetros são schemas locais; desenho confirma uma operação

**Estado:** implementada inicialmente no build 0039d.

Ferramentas parametrizadas são descritas por um registro declarativo e guardam
valores locais normalizados por `toolId`. HUD, workspace e console usam a mesma
resolução: argumentos explícitos prevalecem, argumentos omitidos recuperam a
última configuração e somente uma execução válida é lembrada.

**Motivação:** defaults próprios em cada superfície produziam resultados
diferentes e impediam um painel contextual geral. A identidade e o schema
precisam preceder formulários, presets e futuros previews do Inspector.

**Consequências:** parâmetros não pertencem ao documento nem ao undo; versões
futuras desconhecidas são preservadas; dados legados são apenas lidos durante a
migração. O desenho livre mantém preview local e confirma tubo ou distribuição
hierárquica como um único comando persistente. Outras famílias podem aderir ao
registro sem criar uma nova chave de armazenamento ou um formulário paralelo.

## D-039 — Distribuição desenhada é um pincel progressivo e cacheado

**Estado:** implementada inicialmente no build 0039e.

Ao desenhar uma distribuição, a quantidade não é declarada antes do gesto.
Novas cópias aparecem nos múltiplos do espaçamento acumulado sobre o caminho.
A fonte — seleção hierárquica ou geometria do catálogo — é capturada uma vez,
e o preview conserva os mesmos lotes `InstancedMesh` até confirmar ou cancelar.
Distribuição sobre um caminho já existente continua podendo usar quantidade
explícita.

**Motivação:** reconstruir descritores, geometrias, materiais e meshes a cada
movimento tornava o desenho menos responsivo e confundia a amostragem do dedo
com a distância entre objetos. Um pincel precisa responder ao comprimento já
percorrido, sem exigir que o usuário adivinhe previamente quantos elementos
caberão.

**Consequências:** durante o gesto somente pontos, frames e matrizes novas são
atualizados; a interface recebe um estado leve por quadro; soltar produz um
único comando e um único undo. O renderer já agrupa objetos compatíveis como
instâncias selecionáveis, mas o documento ainda repete descritores nas cópias.
Protótipos persistentes, instâncias leves e copy-on-write permanecem uma
compactação posterior e não devem ser simulados por mutação direta do Three.js.

## D-040 — Variação do pincel usa schema geométrico e programa afim local

**Estado:** implementada inicialmente no build 0039f; semântica global de `u`
e escala positiva superada por D-041 no build 0039g.

O pincel de catálogo guarda o descritor completo normalizado pelo provider. A
orientação possui modos explícitos de preservação, plano e caminho. Variações
por instância reutilizam a AST da linguagem afim e são compostas no frame local
do caminho; não executam JavaScript fornecido pelo usuário.

**Motivação:** escolher apenas o tipo da geometria impedia controlar dimensões,
resolução e parâmetros específicos. Misturar a rotação original da fonte com o
plano de desenho também tornava o resultado ambíguo. Uma linguagem já
normalizada para `i` e `u` permite variações progressivas sem criar outro
avaliador ou materializar cópias no caminho quente.

**Consequências:** mudanças de descritor podem reconstruir o lote de preview,
mas mudanças afins atualizam apenas matrizes no mesmo `InstancedMesh`.
Expressões são compiladas uma vez por configuração e reavaliadas quando
`count`, `u` ou o caminho mudam. A escala permanece uniforme e positiva para
conservar TRS e hierarquias; cisalhamento e escala vetorial exigem uma futura
representação autoritativa capaz de preservá-los sem perda.

## D-041 — Autoria do pincel é causal e entrega um plano de commit preparado

**Estado:** implementada inicialmente no build 0039g.

No pincel desenhado, `u` é a distância acumulada dividida por um comprimento
explícito e não depende da quantidade final. Um plano emitido pelo serviço
conserva o prefixo já aceito e permite reparar apenas uma pequena cauda cuja
orientação pode mudar com a curvatura. Matrizes, cores, transformações de
catálogo e subárvores selecionadas são preparadas incrementalmente durante o
gesto; soltar publica esse mesmo plano em uma transação.

**Motivação:** normalizar `u` por `count` fazia todas as cópias mudarem quando o
traço crescia. Recalcular o layout e materializar todas as cópias somente no
`pointerup` também produzia uma pausa visual. A autoria precisa ser causal: uma
amostra aceita não deve mudar por informação futura, salvo o reparo local
necessário na ponta curva.

**Consequências:** alterações explícitas de parâmetros ainda invalidam o plano
inteiro, pois representam nova intenção. O commit só aceita planos imutáveis
emitidos pelo mesmo `PathToolService` e na mesma revisão da cena. O preview
permanece visível durante a publicação e por dois quadros de handoff. Cor é um
atributo paramétrico instanciável; escala uniforme negativa usa o módulo e
inverte a cor. Parâmetros de provider que alteram topologia continuam comuns ao
lote, porque variantes por cópia exigiriam protótipos ou lotes geométricos
distintos.

## D-042 — Interação passiva usa índices e o handoff exige publicação observável

**Estado:** implementada inicialmente no build 0039g1.

Consultas de ferramenta, seleção e referência resolvem IDs em índices mantidos
pelo sandbox e em metadados incrementais. Um commit interativo coordenado só é
considerado concluído quando os IDs criados são observáveis no sandbox local;
enfileirar uma intenção não autoriza ocultar o preview ou rearmar a ferramenta.

**Motivação:** o primeiro traço persistente avançava a revisão da cena sem
avançar a captura do pincel, fazendo o segundo commit falhar até alguma mudança
de parâmetro recapturar a fonte. Paralelamente, HUD e workspace reconstruíam
descritores e listas DOM de todos os objetos em mudanças de ferramenta. Esses
custos e estados incompletos cresciam com objetos que não participavam da ação.

**Consequências:** uma publicação própria e estritamente aditiva pode rebasear
a revisão do pincel conservando recursos por referência; qualquer mudança
externa ou da fonte força recaptura. Observadores de commit possuem encerramento
explícito em aceitação, rejeição, cancelamento e descarte. O cache de referências
é atualizado antes dos consumidores visuais; painéis consultam os IDs
selecionados e acrescentam apenas novas opções. Criar continua custando o número
de objetos novos e renderizá-los continua sujeito ao renderer, mas selecionar
ferramentas não deve percorrer objetos passivos. A compactação persistente em
protótipo + instâncias leves continua uma decisão posterior.

## D-043 — Gestos de seleção são capturados sem consultar a cena e resolvidos atomicamente

**Estado:** implementada inicialmente no build 0039g2.

Retângulo, pincel, laço e borracha registram somente pontos de tela durante o
movimento. Ao soltar, o renderer resolve o gesto contra um índice espacial de
projeções, reutilizado enquanto revisão da cena, câmera e viewport não mudam. A
resolução retorna IDs ou componentes; somente o comando editorial aplica a
seleção ou exclusão.

**Motivação:** consultar objetos em todo `pointermove` faria o custo de uma
ferramenta crescer com a cena passiva e misturaria preview com mutação. A
borracha também precisa ser reversível como uma intenção única, e não como uma
série de exclusões emitidas ao longo do gesto.

**Consequências:** o caminho quente do movimento depende do número de pontos
coalescidos do gesto, não dos objetos existentes. A primeira consulta após
mudança real de cena ou câmera reconstrói o índice; consultas seguintes visitam
somente células e candidatos atingidos. A borracha em modo objeto publica uma
única `selection.delete` no histórico global. Em edição de malha, ela produz
uma única operação topológica no histórico local da sessão. Seleção continua
sem entrada de undo. O índice usa limites projetados para pincel e borracha e o
centro projetado para a semântica de retângulo e laço.

## D-044 — Visualização, edição e desenho possuem planos independentes

**Estado:** implementada inicialmente no build 0040a.

O viewer mantém três referenciais planares locais e independentes: trava de
visualização, plano de edição e plano de desenho. Cada plano é um frame
ortonormal imutável com origem, eixos X/Y, normal, quaternion e proveniência.
Um plano pode ser derivado da vista, de eixos mundiais, de um objeto, de um
objeto com inclinação e azimute, de uma face ativa, de exatamente três pontos,
de normal+tangente ou de outro plano já capturado.

**Motivação:** usar uma única trava para câmera, transformação e criação fazia
uma mudança de navegação alterar silenciosamente o desenho ou a edição. Planos
por face, objeto inclinado e três pontos também precisam conservar sua
proveniência para serem diagnosticáveis e repetíveis.

**Consequências:** planos são estado local do viewer e não mutação do
documento. Criações 2D capturam o frame no início do gesto, mantêm um único
preview local e publicam uma geometria por comando e uma etapa de undo. Ponto,
segmento, polilinha, retângulo, círculo, arco e polígono reutilizam providers
do registro geométrico. “Editar 2D” entra na edição de vértices e usa o plano
de edição; quando ele não existe, deriva-o do plano de desenho ou do objeto
selecionado. Objetos passivos não participam do movimento do gesto.

## D-045 — Ponteiros são arbitrados por quantidade e medições pertencem ao viewer

**Estado:** implementada inicialmente no build 0040b.

Durante uma ferramenta de desenho, seleção, criação ou transformação, um único
ponteiro pertence à ferramenta. A presença de dois ponteiros de toque transfere
o gesto para `pan + pinch`; três ponteiros orbitam o alvo corrente quando a
órbita não está bloqueada. O rascunho ainda não publicado é cancelado nessa
transição. Régua e transferidor são overlays efêmeros do viewer e usam o plano
de desenho, os eixos permitidos e os mesmos passos de grade e ângulo das
transformações.

**Motivação:** desabilitar `OrbitControls` durante toda ferramenta tornava
navegação e autoria mutuamente exclusivas em telas de toque. Publicar no
primeiro `pointerdown` também criava objetos antes de um segundo dedo poder
declarar a intenção de navegar. Medições, por sua vez, não devem poluir o
documento ou seu histórico enquanto servem apenas como leitura local.

**Consequências:** ferramentas confirmam toques discretos no `pointerup` e não
capturam o primeiro ponteiro de toque para si. O segundo toque cancela apenas o
rascunho local; não publica, não seleciona e não cria undo. Transformações 3D,
desenho 2D, caminhos e medições compartilham `translationSnap`,
`rotationSnapDeg` e restrições de eixo. O reset da câmera restaura o snapshot
inicial mantido pelo controlador do viewer. Medições não são sincronizadas,
salvas nem recuperadas; uma futura cota persistente deverá ser uma entidade
documental distinta.

## D-046 — A modularização usa oito fronteiras e gates monotônicos

**Estado:** planejada; etapa zero, primeira fatia do kernel v2, isolamento do
perfil diagnóstico e primeira família visual canônica implementados até o
incremento 0047g.

O aplicativo mantido convergirá para oito módulos acíclicos: `kernel`,
`document`, `procedural`, `authoring`, `viewer`, `renderer-three`, `interface` e
`platform-web`. O mapa canônico de migração é dado estruturado consumido pela
auditoria; cada componente atual possui um único destino e uma disposição
explícita. A dívida observada no início é registrada por identidade, não apenas
por contagem, e o conjunto aceito só pode diminuir.

**Motivação:** mover arquivos sem uma fronteira verificável poderia apenas
renomear acoplamentos, criar sistemas paralelos ou perder os ganhos de
compacidade e desempenho. Um gate anterior à migração permite provar que cada
fatia remove dependências e não acrescenta outra fonte de verdade.

**Consequências:** novos imports profundos, ciclos, acessos indevidos a DOM ou
Three.js e dependências de diagnóstico no boot falham antes da integração. Os
formatos compactos de famílias, lotes, traços, árvore virtual e cena possuem
limites estruturais reproduzíveis; tempos só são comparados de forma
intercalada na mesma máquina. Uma baseline não autoriza o achado legado que
contém e não pode ser regravada para ocultar regressão. Cada migração substitui
e remove o caminho anterior no mesmo incremento. O registro v2 valida o grafo e
as referências antes da ativação, só publica o conjunto candidato completo e
descarta instâncias em ordem inversa quando qualquer ativação falha. O reducer
regional e o catálogo inicial já são contribuições declaradas; não recebem
stores mutáveis do host durante o boot. Adapters de navegador pertencem à API
pública `platform-web`; o perfil normal não alcança nem precacheia testes,
benchmarks ou auditorias. O perfil diagnóstico os ativa sobre um runtime
candidato pela porta versionada de composição, com descarte inverso em falha.

## D-047 — O teste local da PWA usa origem HTTPS canônica por checkout

**Estado:** implementada no incremento 0047d.

O servidor de desenvolvimento deriva sua raiz do checkout que contém
`tools/no_cache_server.py`, usa HTTPS por padrão e conserva a porta 8082. A CA
local é compartilhada entre worktrees, enquanto o certificado do servidor é
reemitido quando o conjunto detectado de endereços IPv4/IPv6 muda. A API
`platform-web` resolve worker e escopo a partir de uma raiz absoluta da mesma
origem; caminhos recebidos com barras iniciais duplicadas são canonizados.

**Motivação:** o servidor anterior apontava sempre para
`~/SpatialSeed-monorepo`, mesmo quando invocado a partir de outro worktree, e o
uso de portas diferentes impedia que o teste representasse a origem PWA
habitual. Além disso, um caminho `//apps/web/` podia virar o escopo relativo
`//apps/web/`, que o navegador interpretava como o host `apps`.

**Consequências:** apenas um checkout ocupa a porta 8082 de cada vez; trocar a
versão testada significa encerrar o servidor e executar o mesmo comando no
outro checkout. Loopback permanece o padrão; exposição à rede exige
`--network`. Certificados e chaves não entram no repositório. HTTP continua
disponível somente por `--http` para diagnóstico explícito, e não é o fluxo
canônico de validação da PWA.

## D-048 — Capacidades de autoria convergem por uma fachada canônica sem estado paralelo

**Estado:** implementada inicialmente no incremento 0047e.

As fontes atuais de ferramentas são projetadas por adapters explícitos numa
única fachada `authoring.tool.*`. O contrato serializável descreve identidade,
tipo, lifecycle, contextos, parâmetros, apresentação, disponibilidade e
operações. `EditContextController`, `ToolLifecycleController`,
`ToolParameterStore` e os controllers de domínio continuam autoritativos; a
fachada mantém apenas o índice imutável dos descritores e encaminha cada
invocação ao comando existente.

**Motivação:** modos de transformação, gestos contínuos, operações imediatas e
ações expostas apenas pelo console eram chamados igualmente de “ferramenta”,
mas vinham de tabelas e bindings diferentes. Isso escondia mover/girar do
editor de HUD, permitia seções sem itens e apresentava desenho de tubo e
distribuição sob a mesma intenção visual. Reescrever todas as fontes antes de
melhorar a interface criaria uma migração longa e arriscada; copiar seu estado
para um novo catálogo criaria outra fonte de verdade.

**Consequências:** mover, girar e escalar usam IDs canônicos nos contextos de
objeto e malha. `draw.tube` e `draw.array` são intenções e ícones distintos,
embora compartilhem `path.sketch` e suas preferências existentes. Ativar um
modo não significa executar uma transformação; operações documentais continuam
passando pelos comandos próprios. Adapters não consultam HTML nem DOM. Entradas
legadas permanecem somente enquanto alguma superfície ainda depende delas;
cada família visual migrada deve passar a consumir o catálogo e remover, no
mesmo incremento, seus bindings e listas hardcoded. As condições de remoção de
cada adapter estão registradas em
[`AUTHORING_TOOL_CAPABILITIES_0047E.md`](../AUTHORING_TOOL_CAPABILITIES_0047E.md).

## D-049 — Caminhos e perfis são papéis de entrada reutilizáveis

**Estado:** implementada inicialmente no incremento 0047f.

O descritor canônico de ferramenta declara entradas semânticas separadamente
da forma de captura. `path`, `profile`, `selection`, `boundary` e `point` são
papéis; `draw`, seleção, referência e catálogo são fontes possíveis. Uma
capacidade pode assim aceitar caminho ou perfil desenhado sem incorporar outra
cópia do controller de ponteiro.

**Motivação:** o desenho livre já sustentava tubo e distribuição, enquanto
sweep, extrusão e revolução consumiam estruturas geometricamente equivalentes
por outras entradas. Criar um gesto para cada operação duplicaria plano,
suavização, preview, cancelamento e persistência. Em sentido inverso, tratar
qualquer operação escalar como se aceitasse caminho produziria uma promessa
sem correspondente topológico.

**Consequências:** `draw.tube`, `draw.array`, `draw.sweep`, `draw.extrude` e
`draw.revolve` compartilham uma captura, mas possuem parâmetros e apresentação
independentes. O perfil do sweep é resolvido uma vez na ativação; perfis de
extrusão e revolução são projetados no frame do plano. `mesh.inset` continua
escalar e declara somente seleção até existir um operador real de recorte por
contorno. Um futuro inset desenhado deverá consumir `boundary`, validar a
topologia e confirmar uma única transação, sem alias visual para o algoritmo
triangular atual. Consulte
[`DRAWN_AUTHORING_0047F.md`](../DRAWN_AUTHORING_0047F.md).

## D-050 — Esboço semântico é contrato do kernel, não aparência geométrica

**Estado:** implementada inicialmente no incremento 0047g.

Formas planares conservam um `SketchDescriptor` local e imutável com pontos,
primitiva e papéis `point`, `path`, `profile` e `boundary`. O contrato pertence
ao kernel; a geometria renderizada, sua espessura e seu preenchimento não
determinam esses papéis. Operações sobre objetos existentes usam slots
explícitos e IDs `feature.sweep`, `feature.extrude` e `feature.revolve`.

**Motivação:** círculo contornado era renderizado como `ring`, enquanto um
hexágono contornado era renderizado como `tube`; inferir semântica do provider
fazia apenas o primeiro ser encontrado como perfil. `draw.extrude` também
significava desenhar um novo perfil e não podia representar a intenção
“extrudar o perfil selecionado”. Colocar o contrato no registro procedural
criaria dependências proibidas do documento e da autoria para providers.

**Consequências:** estilos diferentes da mesma forma oferecem as mesmas
entradas. Tubos fechados antigos são adaptados conservadoramente pelo contorno
central, sem migração destrutiva. Editar a geometria como malha remove um
esboço que ficou obsoleto. A ferramenta em foco e os vínculos dos slots são
estado local de apresentação; controllers, parâmetros, documento e histórico
continuam autoritativos em suas camadas. As fontes são vetoriais; imagens e
texturas não são interpretadas como perfil. Referências continuam snapshots
até o grafo procedural posterior. Consulte
[`SEMANTIC_SKETCH_INPUTS_0047G.md`](../SEMANTIC_SKETCH_INPUTS_0047G.md).

## D-051 — Substituição de projeto cancela transientes e erro operacional é recuperável

**Estado:** implementada inicialmente no incremento 0047g.

`newProject`, `openText` e recuperação preparam a troca cancelando edição de
mesh, desenhos, posicionamento, medição, alvos e workspace local antes de
substituir a cena. Erros posteriores ao boot são avisos temporários, exceto
quando marcados explicitamente como fatais.

**Motivação:** bloquear `project.new` enquanto a malha estava em edição impedia
o próprio coordenador de encerrar essa sessão; a exceção resultante permanecia
na caixa global e parecia uma falha irrecuperável. Ferramentas transitórias não
devem sobreviver à autoridade documental que lhes servia de base.

**Consequências:** criar outro projeto durante edição descarta a sessão local e
chega a uma cena nova coerente. Salvar ainda exige finalização explícita da
malha. Falta de entrada, validação e indisponibilidade contextual desaparecem
após sucesso, cancelamento ou troca de contexto; somente falha de inicialização
ou integridade marcada como fatal ocupa a caixa persistente.

## D-052 — Estado persistente rápido e checkpoint clonável são fronteiras distintas

**Estado:** implementada no incremento 0053g.

As leituras internas do sandbox podem conservar estruturas persistentes e
proxies para evitar cópias. Fronteiras de checkpoint, projeto, worker ou outra
API que exija clone estruturado recebem uma materialização explícita.
`getBaseState()` é um checkpoint clonável; `getState()` é a projeção rápida e
não promete ser serializável.

**Motivação:** tornar todo acesso profundamente clonável eliminaria parte do
ganho de memória da representação compacta. Permitir que proxies atravessem a
persistência, por outro lado, quebra `structuredClone` e faz a otimização vazar
para consumidores que não conhecem sua representação.

**Consequências:** novos consumidores devem escolher a fronteira pela semântica,
não por conveniência. Serialização usa `getBaseState()` ou
`materializeState()`; algoritmos internos podem usar `getState()`. Testes de
checkpoint verificam clone estruturado, enquanto testes de hot path não devem
exigir cópia profunda.

## D-053 — Edição canônica rebaseia animação relativa

**Estado:** implementada no incremento 0053g.

Mover, girar ou escalar uma ocorrência durante playback altera sua base
canônica e rebaseia a camada temporal relativa; não encerra automaticamente a
animação. A exclusão encerra apenas as instâncias afetadas e a substituição
integral do documento encerra todos os transientes.

**Motivação:** a política anterior tratava qualquer mudança de cena como
invalidação terminal. Isso tornava edição e animação mutuamente exclusivas e,
quando o pivô mudava, deixava o overlay preso à base capturada.

**Consequências:** runtime e renderer precisam compartilhar a mesma fonte de
tempo e o pivô canônico atual. Novos tipos de edição devem declarar se são
rebaseáveis, removem ocorrências ou substituem a cena; não podem cair numa
regra genérica de parada.

## D-054 — Alcance estático orienta triagem, não exclusão

**Estado:** implementada inicialmente no incremento 0053g.

O manifest de alcance separa JavaScript de produção, diagnóstico e arquivos
ausentes das raízes mantidas. A terceira classe é uma fila de revisão e não uma
autorização para apagar, arquivar ou omitir automaticamente arquivos de um
módulo autônomo.

**Motivação:** imports calculados, registries, workers e assets não JavaScript
podem manter dependências invisíveis a uma travessia estática de imports.
Confundir ausência no grafo com código morto transforma uma otimização de
empacotamento em perda silenciosa de capacidade ou compatibilidade.

**Consequências:** uma extração parte de allowlist, inclui revisão de recursos e
validação no navegador, preserva schemas/migrações e repete os gates na closure
derivada. O manifest é regenerado e verificado, mas remoções continuam sendo
decisões explícitas.

## D-055 — Objetos resolvidos localmente compõem caches por precedência recursiva

**Estado:** implementada no incremento 0053k.

Documento, definições e instâncias permanecem canônicos. Projeção, animação e
preview são camadas derivadas ordenadas de uma única hierarquia local. Uma
camada armazena apenas suas substituições; ausências recuperam a matriz local e
os descritores da camada imediatamente inferior e os recompõem sob o pai
efetivo. Camadas em fase de commit sobrevivem à notificação síncrona do Sandbox
até a projeção canônica avançar, impedindo o quadro intermediário antigo.

**Motivação:** caches independentes no `HierarchyIndex`,
`ReplicaRenderIndex`, overlays e proxies podiam representar épocas diferentes.
Grupos aninhados também perdiam overrides por caminho durante nova compactação.

**Consequências:** overrides internos são prefixados ao reagrupar; a edição de
malha transfere posse visual de todos os recursos do objeto antes do primeiro
quadro. Novas camadas efêmeras devem declarar prioridade,
revisão-base e fase e não podem escrever diretamente no estado persistente.

Consulte [`CANONICAL_REGRESSIONS_0053K.md`](../CANONICAL_REGRESSIONS_0053K.md).

## D-056 — Contexto editorial preserva intenção e preview local é hierárquico

**Estado:** implementada no incremento 0053l.

Entradas em edição de componentes e duplicações preservam a última ferramenta
de transformação. A prévia local registra somente raízes canônicas e resolve
recursivamente a subárvore na mesma hierarquia derivada usada por animação e
preview compartilhado. O pivô padrão é o centro dos limites da seleção;
políticas de âncora ou pivô diferentes exigem escolha explícita.

**Motivação:** forçar `translate` durante transições fazia o primeiro gesto
depender de uma troca manual de ferramenta. Atualizar proxies achatados durante
o gesto separava a prévia local do contrato recursivo já usado no commit e
falhava em grupos contendo grupos.

**Consequências:** seleção de componentes é republicada depois da ativação do
gizmo; cancelar e confirmar previews reaplica apenas a subárvore afetada;
âncoras referenciadas consultam a matriz efetiva do alvo. A política não inclui
um esqueleto cinemático: juntas, ciclos e avaliação temporal continuam sendo um
incremento separado.

Consulte [`MAIN_CONSOLIDATION_0053L.md`](../MAIN_CONSOLIDATION_0053L.md).

## Decisões superadas ou rejeitadas

- **Build hard-coded no HTML:** superado por `build-info.json`.
- **Lógica própria no Inspector ou no console:** rejeitada em favor dos mesmos
  comandos e registros.
- **Aplicação mantida na raiz do repositório:** superada; a raiz é portal e a
  aplicação atual é `apps/web/`.
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
