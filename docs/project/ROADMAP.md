# Roadmap — jogos e aplicativos web autocontidos

> GERADO de `milestones.json` por `bash tools/seedctl roadmap render`. Não editar esta projeção.

Este plano parte do patch 0054nf1. O build executável continua em `apps/web/build-info.json`;
o patch de planejamento não implementa as capacidades futuras nem confirma instalação no telefone.

A ordem é por dependências, não por datas prometidas. Uma fatia é um resultado demonstrável.
M6 permite provar portabilidade cedo; a distribuição estável M7 depende da composição M5.

| Marco | Dependências | Estado do plano | Resultado |
|---|---|---|---|
| M0 — Validar a base e eliminar regressões observadas | — | implemented-awaiting-review | Transformar a 0054nf1 em uma base de uso confirmada; testes verdes não encerram a regressão móvel. |
| M1 — Consolidar recursos, propriedades, eventos e catálogos | M0 | planned | Reutilizar sensores, DataObjects e apresentação existentes; unificar seus contratos de autoria, migração e documentação. |
| M2 — Amadurecer animação de personagem | M1 | planned | Oferecer autoria portátil de clips e transições sobre CharacterAnimationSystem e seu backend Three já existente. |
| M3 — Comportamentos programáveis com capacidades limitadas | M1 | planned | Permitir código de usuário associado a eventos, sem dar ao programa o renderer, o DOM ou autoridade irrestrita. |
| M4 — Bindings reativos e interfaces interativas | M1 | planned | Compor aplicativos de dados e apresentações sem exigir malha, personagem ou física. |
| M5 — Prefabs e composição reutilizável | M3, M4 | planned | Transformar grafo, dados, apresentação e comportamento em recursos reutilizáveis com overrides explícitos. |
| M6 — Player mínimo e prova de execução fora do editor | M4 | planned | Provar cedo um player isolado; estabilizar a distribuição após a composição, evitando copiar o bootstrap inteiro. |
| M7 — Exportação autocontida e incorporação web | M3, M5, M6 | planned | Gerar pacote estático portátil com projeto, runtime mínimo, código, assets e licenças; incorporá-lo por iframe. |
| M8 — 0055: jogos e aplicativos completos aceitos | M2, M7 | planned | Declarar maturidade por produtos completos reproduzíveis, não pelo número da versão ou de testes. |

Estados do plano não substituem registros de revisão ligados a commits. `accepted` só pode ser
registrado após aceitação humana; um teste omitido ou uma regressão aberta não é aceitação.

## Continuidade dos marcos anteriores

O snapshot anterior permanece integral no histórico. Itens antigos são reavaliados no código
antes de serem tratados como ausentes; trilha preservada não significa implementação concluída.

| Planejamento anterior | Tratamento atual | Destino |
|---|---|---|
| 0029g–0029i: rigs, direção de cena e controles configuráveis | Reavaliar o que já está no código; controles e propriedades convergem com bindings/player. Shots, cues e direção multicâmera permanecem extensão própria. | M4, M6 |
| 0054mo/mx/my: propriedades, eventos e plataformas cinemáticas | Usar os serviços entregues como base, preservando autoria pública e estado efêmero. | M1, M2, M3 |
| Após 0054my: triggers → dados → bindings → prefabs → applets | Sensores/dados já existem; consolidar e manter a sequência de composição, com prova antecipada de player. | M1, M4, M5, M6, M7 |
| Persistência compacta e recuperação local | Manter recuperação existente; schema, referências e migrações fazem parte do roundtrip. OPFS e compressão evoluem quando o volume exigir. | M1, M5, M7 |
| Interoperabilidade, plugins e gates tecnológicos | Usar manifests/capabilities/adapters. QuickJS/WASM só após comparação com Worker/SES; colaboração remota mantém seus pré-requisitos. | M1, M3, M6, M7 |
| Curvas/2D, topologia, booleanos, modificadores e gramáticas | Preservar escopo e critérios no snapshot anterior; planejar fatias próprias sem bloquear jogos/apps quando as primitivas atuais bastarem. | Trilha preservada |
| Documentação, desempenho, experiência de uso e consolidação 0055 | Documentação gerada, medições comparáveis, acessibilidade e testes de produtos completos atravessam as fatias; sem novo redesenho como requisito. | M0, M1, M8 |

## Contratos e processo

- [Fronteiras, exportação, bibliotecas e documentação](DELIVERY_ARCHITECTURE.md)
- [Ciclo agêntico e revisão humana](AGENT_WORKFLOW.md)
- [Snapshot anterior, apenas histórico](history/ROADMAP_0054NF1.md)

## M0 — Validar a base e eliminar regressões observadas

Transformar a 0054nf1 em uma base de uso confirmada; testes verdes não encerram a regressão móvel.

Fatiamento:

1. Confirmar checkout, build carregado e cache; reproduzir painéis, fechamento e HUD compacto no telefone.
2. Corrigir somente regressões reproduzidas e repetir o fluxo no desktop, sem redesenho adicional.
3. Verificar entrar/sair do jogo, áudio após gesto, texto seguindo objeto e parada de pulse; registrar resultado atual.

Critérios de saída:

- Painéis fecham e seus cabeçalhos permanecem acessíveis em retrato e paisagem; conteúdo rola sem compressão.
- No telefone, só um painel principal ocupa a área e fechar devolve o toque ao workspace; no desktop, mover/redimensionar não perde os controles de fechamento.
- HUD compacto é recuperável; seleção, undo, salvar/reabrir e editor retornam após jogar.
- Toda regressão relatada permanece aberta até evidência humana na versão correspondente.

Revisão humana:

- `mobile`: Fluxos completos no Android: retrato, paisagem, toque e PWA.
- `desktop`: Fluxos completos no navegador desktop.
- `lifecycle`: Jogo → edição → jogo, áudio, texto no mundo e pulse.

Código/evidência de partida: [`docs/INTERFACE_MODULAR.md`](../../docs/INTERFACE_MODULAR.md), [`apps/web/build-info.json`](../../apps/web/build-info.json), [`packages/ui-widgets/src/FloatingPanelManager.js`](../../packages/ui-widgets/src/FloatingPanelManager.js).

## M1 — Consolidar recursos, propriedades, eventos e catálogos

Reutilizar sensores, DataObjects e apresentação existentes; unificar seus contratos de autoria, migração e documentação.

Fatiamento:

1. Inventariar por registros as capacidades atuais, distinguindo trigger.enter/exit de collision.* ainda proposto e solid/sensor/none de novos papéis.
2. Consolidar identidade/endereço/tipo para dados, texto e referências de assets; migrar formatos existentes sem segunda base de estado.
3. Completar metadados de comandos/eventos/propriedades/capabilities e gerar JSON, referência técnica e ajuda a partir deles; exemplos executáveis e verificação de divergência.

Critérios de saída:

- Um coletável e um contador usam eventos/comandos existentes, com inicialização e reset definidos.
- Dados persistentes sobrevivem ao roundtrip; alterações da sessão não poluem documento/undo.
- Entradas públicas documentam argumentos, resultado, versão, efeitos, permissões e orçamento; falha de geração bloqueia a entrega.

Revisão humana:

- `authoring`: Criar contador e coletável pelo Inspector e pelo console.
- `roundtrip`: Salvar/reabrir e iniciar/parar sem estado residual.

Código/evidência de partida: [`packages/core/src/DataObjects.js`](../../packages/core/src/DataObjects.js), [`packages/core/src/InteractionBindings.js`](../../packages/core/src/InteractionBindings.js), [`packages/game-runtime/src/GameSessionState.js`](../../packages/game-runtime/src/GameSessionState.js), [`packages/game-runtime/src/GameRuntime.js`](../../packages/game-runtime/src/GameRuntime.js), [`packages/game-runtime/src/GamePresentationRuntime.js`](../../packages/game-runtime/src/GamePresentationRuntime.js), [`packages/property-registry/src/PropertyRegistry.js`](../../packages/property-registry/src/PropertyRegistry.js).

## M2 — Amadurecer animação de personagem

Oferecer autoria portátil de clips e transições sobre CharacterAnimationSystem e seu backend Three já existente.

Fatiamento:

1. Consolidar catálogo de clips, remapeamento explícito idle/walk/run/jump/fall/land e fallback para clips ausentes.
2. Publicar transições, velocidade, loop, blend e sinais de término por descritores; UI/console/programa usam o mesmo contrato.
3. Validar vários personagens com estado independente, recursos compartilhados e descarte; root motion permanece opt-in e só solicita movimento ao controlador físico.

Critérios de saída:

- Importar dois rigs distintos, configurar e exportar/reabrir sem serializar objetos Three.
- Blend e escala visual não alteram collider; pausa, respawn, stop e troca de personagem restauram estado.
- Medir custo com 1 e 10 personagens no mesmo aparelho; registrar bytes, memória estimada quando disponível e p95 de frame, sem meta inventada.

Revisão humana:

- `character`: Dois rigs, clips faltantes, blend e ciclo completo de jogo.
- `performance`: Comparação reproduzível no telefone e desktop.

Código/evidência de partida: [`packages/character-animation/src/CharacterAnimationSystem.js`](../../packages/character-animation/src/CharacterAnimationSystem.js), [`packages/character-animation-three/src/ThreeCharacterAnimationBackend.js`](../../packages/character-animation-three/src/ThreeCharacterAnimationBackend.js), [`packages/runtime-test-plugin/src/CharacterAnimationTests.js`](../../packages/runtime-test-plugin/src/CharacterAnimationTests.js).

## M3 — Comportamentos programáveis com capacidades limitadas

Permitir código de usuário associado a eventos, sem dar ao programa o renderer, o DOM ou autoridade irrestrita.

Fatiamento:

1. Definir recurso de programa: fonte, versão, eventos, parâmetros tipados e capabilities declaradas; importar não executa.
2. Ligar eventos à infraestrutura Worker/SES existente com fila e orçamento; resultados são intenções/planos tipados revalidados no host.
3. Separar plano editorial revisável de ações efêmeras da sessão; timeout, cancelamento, quotas de saída, isolamento entre instâncias e diagnóstico por objeto.

Critérios de saída:

- Usuário programa contador/porta e resposta a evento sem editar GameRuntime.
- Loop infinito é terminado, fila excessiva é limitada e falha de um script não paralisa câmera ou outros applets.
- Sem acesso direto a DOM/rede/arquivos/sandbox; mensagens obsoletas e comandos fora do catálogo são rejeitados.
- Autorização da sessão delimita ações automáticas; aprovação humana não é solicitada a cada frame.

Revisão humana:

- `behavior`: Criar, corrigir e interromper um comportamento pelo editor.
- `isolation`: Demonstrar timeout, ações recusadas, cancelamento e reset.

Código/evidência de partida: [`packages/script-runtime/src/ProgramRunController.js`](../../packages/script-runtime/src/ProgramRunController.js), [`packages/script-runtime/src/ProgramSessionController.js`](../../packages/script-runtime/src/ProgramSessionController.js), [`packages/script-runtime/src/SpatialPlanCommitService.js`](../../packages/script-runtime/src/SpatialPlanCommitService.js), [`packages/interaction-runtime/src/InteractionRuntime.js`](../../packages/interaction-runtime/src/InteractionRuntime.js), [`vendor/ses/README.md`](../../vendor/ses/README.md).

## M4 — Bindings reativos e interfaces interativas

Compor aplicativos de dados e apresentações sem exigir malha, personagem ou física.

Fatiamento:

1. Definir fontes constant/keyframes/expression/binding por endereço canônico; detectar ciclos e limitar propagação e atualização incremental.
2. Criar schema de texto, botão, slider e campo de entrada sobre Resource/Property/Command/Event, com projeção DOM substituível.
3. Montar contador/formulário ou simulação simples em perfil sem Three; expressões reutilizam avaliação restrita existente.

Critérios de saída:

- Mudar um dado atualiza apenas dependentes; ciclos e referências inexistentes geram diagnóstico.
- Teclado, foco, toque, redimensionamento e acessibilidade funcionam no applet.
- O modo somente dados não carrega renderer/physics; HTML de usuário não é injetado sem contrato de sanitização.

Revisão humana:

- `applet-ui`: Operar formulário e gráfico/contador por toque e teclado.
- `reactivity`: Demonstrar ciclos, edição e restauração de valores.

Código/evidência de partida: [`packages/property-registry/src/PropertyRegistry.js`](../../packages/property-registry/src/PropertyRegistry.js), [`packages/game-runtime/src/GamePresentationRuntime.js`](../../packages/game-runtime/src/GamePresentationRuntime.js), [`packages/ui-config/src/index.js`](../../packages/ui-config/src/index.js), [`packages/script-runtime/src/index.js`](../../packages/script-runtime/src/index.js).

## M5 — Prefabs e composição reutilizável

Transformar grafo, dados, apresentação e comportamento em recursos reutilizáveis com overrides explícitos.

Fatiamento:

1. Definir referência/versionamento e dependências do prefab, com parâmetros e IDs locais remapeáveis.
2. Implementar Make Instance/Make Unique e atualização de origem com conflitos/overrides preservados.
3. Publicar prefab de coletável e de widget configurável, com transação única e roundtrip.

Critérios de saída:

- Duas instâncias compartilham recursos sem compartilhar estado efêmero involuntariamente.
- Atualizar origem preserva overrides e informa conflitos; ciclo de dependência é recusado.
- Desfazer/restaurar e exportar/reabrir mantêm identidade e parâmetros.

Revisão humana:

- `prefab`: Editar instância, origem e conflito de override pelo fluxo público.

Código/evidência de partida: [`packages/core/src/DataObjects.js`](../../packages/core/src/DataObjects.js), [`packages/script-runtime/src/ProcedureCatalog.js`](../../packages/script-runtime/src/ProcedureCatalog.js), [`packages/resource-tree/src/ResourceTree.js`](../../packages/resource-tree/src/ResourceTree.js).

## M6 — Player mínimo e prova de execução fora do editor

Provar cedo um player isolado; estabilizar a distribuição após a composição, evitando copiar o bootstrap inteiro.

Fatiamento:

1. Extrair montagem de sessão com lifecycle create/start/pause/stop/dispose e providers explícitos, sem duplicar regras de domínio.
2. Criar perfis de capacidades para applet 2D, visualização 3D e jogo; não usar ocultação CSS como remoção do editor.
3. Executar duas instâncias isoladas na mesma página de teste; esta fatia é prova de portabilidade, não exportador estável.

Critérios de saída:

- Player não importa painéis, ferramentas de autoria ou pacote de testes.
- Duas instâncias possuem input, câmera, relógio, áudio, armazenamento e recursos descartáveis próprios.
- Perfil sem 3D roda sem Three; nenhum servidor específico ou conta é dependência de execução.

Revisão humana:

- `player`: Abrir duas instâncias, pausar uma e descartar ambas.
- `dependency-closure`: Inspecionar imports/requisições e provar ausência do editor.

Código/evidência de partida: [`packages/platform-web/src/ApplicationDefinition.js`](../../packages/platform-web/src/ApplicationDefinition.js), [`packages/plugin-api/src/ModuleRegistry.js`](../../packages/plugin-api/src/ModuleRegistry.js), [`apps/web/bootstrap/createWebRuntime.js`](../../apps/web/bootstrap/createWebRuntime.js).

## M7 — Exportação autocontida e incorporação web

Gerar pacote estático portátil com projeto, runtime mínimo, código, assets e licenças; incorporá-lo por iframe.

Fatiamento:

1. Resolver fechamento transitivo de módulos/assets/workers/WASM/fonts/audio, detectar falta/ciclo e emitir manifesto com versões, hashes, licenças e capabilities.
2. Exportar diretório/ZIP com caminhos relativos, inicialização determinística e relatório de dependências; CDN e chamadas externas são desativadas por padrão.
3. Entregar snippet iframe e protocolo versionado de mensagens para ready/error/resize/pause/dispose com validação de origem/instância e permissões mínimas.
4. Perfil HTML único é opcional e distinto: só fica disponível após prova de workers, módulos, CSP e assets; não prometer file:// para o pacote ESM.

Critérios de saída:

- Após baixar o pacote inteiro, executar em hospedagem estática comum, com todas as dependências locais e sem serviço do autor/editor.
- Executar em raiz e subdiretório, hospedeiro de origem diferente, dois iframes e modo rede bloqueada após cache/preparação explícita.
- Sem URLs de desenvolvimento, dependências ausentes ou licença omitida; abertura offline não depende de aquecimento oculto de cache.
- Autocontido significa fechamento de dependências; HTML único e abertura file:// são capacidades separadas e testadas separadamente.

Revisão humana:

- `export`: Publicar pacote de teste em hospedagem estática e subdiretório.
- `embed`: Incorporar duas instâncias e verificar origem, foco, redimensionamento e descarte.
- `offline`: Repetir sem dependência de rede externa e conferir assets/licenças.

Código/evidência de partida: [`packages/platform-web/src/ApplicationDefinition.js`](../../packages/platform-web/src/ApplicationDefinition.js), [`packages/platform-web/src/BrowserProjectFileGateway.js`](../../packages/platform-web/src/BrowserProjectFileGateway.js), [`tools/analyze_reachable_surface.py`](../../tools/analyze_reachable_surface.py), [`apps/web/pwa/precache-manifest.json`](../../apps/web/pwa/precache-manifest.json).

## M8 — 0055: jogos e aplicativos completos aceitos

Declarar maturidade por produtos completos reproduzíveis, não pelo número da versão ou de testes.

Fatiamento:

1. Jogo: início, personagem animado, plataformas móveis, coleta/pontuação, derrota/vitória e reinício.
2. Applet 3D: configurador ou experimento com parâmetros, eventos, animação e exportação incorporável.
3. Aplicativo 2D: formulário/quiz/contador com dados, bindings e código do usuário, sem carregar Three.
4. Fechar manual do usuário por tarefas, referência autogerada, exemplos e relatório comparável de desempenho e limitações.

Critérios de saída:

- Os três produtos são construídos pelas APIs/GUI públicas sem editar fonte do engine.
- Android e desktop passam nos roteiros de uso, publicação, incorporação e recuperação.
- Revisor humano aceita os artefatos e limitações da versão concreta; promoção continua exigindo autorização explícita.

Revisão humana:

- `game`: Jogar do início ao fim e reiniciar no telefone e desktop.
- `apps`: Construir e usar os dois aplicativos fora do editor.
- `release`: Revisar documentação, acessibilidade, orçamento e limitações para 0055.

Código/evidência de partida: [`docs/project/ROADMAP.md`](../../docs/project/ROADMAP.md), [`docs/INTERFACE_MODULAR.md`](../../docs/INTERFACE_MODULAR.md).

## Trilhas preservadas e adiadas

- Corpos dinâmicos empurráveis por backend substituível: comparar custo/benefício após contratos de contato; não bloquear jogos cinemáticos simples.
- Geometrias implícitas, superfícies deformáveis, painéis espaciais, topologia, formato glTF de cena, gramáticas de forma e modificadores vinculados permanecem em trilhas próprias.
- Colaboração remota, CRDT/P2P e marketplace dependem de autoridade, protocolo e contratos; não antecipar no player autônomo.
- Retargeting geral, IK e editor de animação esquelética completo entram apenas após clips/transições e orçamento medido.
