# Contratos para jogos, aplicativos e applets

## Ponto de partida e alcance deste patch

Este planejamento sucede a correção 0054nf1. Não implementa um exportador,
prefabs, bindings gerais ou um novo motor. O manifesto executável continua em
`apps/web/build-info.json`. A validação humana da interface permanece pendente;
a existência do patch nesta árvore não comprova sua instalação no aparelho.

| Evidência no código da base | Capacidade existente | Trabalho restante |
|---|---|---|
| `GameRuntime`, `KinematicCollisionWorld` | Personagem cinemático, plataformas e `trigger.enter/exit`; papéis `solid/sensor/none` | Consolidar autoria, identidade e lifecycle; só criar `stay` se o caso exigir. Não renomear eventos sem migração. |
| `DataObjects`, `GameSessionState` | Definições de dados portáteis e valores efêmeros de sessão | Generalizar endereçamento, propriedades, busca e UI; não criar outro armazenamento concorrente. |
| `GamePresentationRuntime` | Texto no mundo, HUD e diálogo | Bindings gerais, componentes interativos e perfis sem 3D. |
| `CharacterAnimationSystem` + backend Three | Clips, estados, blend, fallback e separação física/visual | Autoria completa, múltiplos rigs/personagens, exportação e lifecycle comprovado. |
| Worker/SES, `ProgramRunController`, planos | Execução restrita, timeout/cancelamento e commit de planos | Código associado a eventos, orçamento de sessão e catálogo de ações seguro. |
| `ApplicationDefinition`, registros de módulos | Composição de aplicações e extensões | Fechamento mínimo, player isolado e exportador portátil. |

Essas constatações são de código; não declaram todos os fluxos aprovados por
uso humano. O [roadmap](ROADMAP.md) discrimina as próximas fatias.

## Fronteiras que cada fatia deve preservar

O documento contém definições portáteis de recursos, comportamentos, parâmetros,
referências e bindings. Comandos públicos validam alterações persistentes e
produzem transações com undo. Queries retornam fotografias; eventos informam
ocorrências. A sessão mantém relógio, estado do jogo, física e reprodução
efêmeros. Renderers e UI projetam esse estado; adapters convertem contratos em
chamadas a bibliotecas. Nenhuma referência de Three, Worker, DOM, Rapier ou outra
biblioteca entra no documento.

Os nomes de futuros contratos abaixo são propostas, não APIs disponíveis:

| Fronteira proposta | Dados de entrada e saída | Regra de substituição |
|---|---|---|
| Player/session lifecycle | Definição, capabilities, snapshots e comandos tipados; create/start/pause/stop/dispose | Mesmo ciclo de vida com ou sem Three; recursos liberados por instância. |
| Character animation backend | IDs, catálogo de clips, pose efêmera e eventos de término | Reutilizar a fronteira de `CharacterAnimationSystem`; testar backend falso e backend real. |
| Physics adapter | Formas/papéis/transformações, passo fixo e contatos revisionados | Controlador atual continua padrão; backend dinâmico opcional anuncia capacidades e falha explicitamente se incompatível. |
| Behavior execution | Snapshot limitado + evento → intenções/planos e diagnóstico | Worker/SES reutilizado; host valida versão, identidade, permissões e orçamento antes de aplicar. |
| Export archive writer | Manifesto e bytes → diretório/arquivo ZIP | Exportador não conhece tipos da biblioteca de compressão; writer sem compressão serve como alternativa. |

Um backend falso prova o contrato em testes; não prova equivalência física ou
visual. A prova de substituição também exige executar um exemplo real sem o
adapter opcional. Não introduzir uma interface genérica sem uma necessidade
concreta demonstrada pela fatia.

## Código de usuário

Recurso de programa armazena fonte, versão, parâmetros, eventos de entrada e
capabilities requisitadas. Importar ou visualizar código não o executa. A
ativação concede somente as ações explícitas do catálogo do aplicativo. O
programa recebe cópias/snapshots limitados, sem acesso a DOM, renderer, arquivos,
rede ou instância do sandbox editorial.

Na autoria, uma execução gera plano revisável e commit atômico. Durante um jogo
ou applet, as intenções efêmeras podem ser executadas automaticamente dentro da
autorização da sessão; não há aprovação humana por frame. Persistência de estado
do usuário requer comando/capability próprios e namespace por aplicativo; não é
um efeito acidental de animar ou reproduzir.

Adaptar a infraestrutura existente: timeout que termina Worker, limites de
mensagens e de saída, filas limitadas, sequência/revisão do evento, descarte de
respostas obsoletas, cancelamento e reset. Usar relógio e aleatoriedade com seed
para testes reproduzíveis quando o domínio permitir. Evitar um Worker novo por
frame e evitar código arbitrário na thread da UI. SES restringe autoridade; não
substitui limites de CPU/memória nem constitui, sozinho, garantia contra código
hostil. O threat model e os casos adversariais são entregas da M3.

Exemplo de objetivo, ainda não de sintaxe pública: evento de entrada num sensor
invoca programa que solicita incrementar o contador e tocar um efeito permitido.
O host confirma tipos/limites e aplica apenas essas ações. Falha ou loop no
programa não interrompe controles, câmera ou outra instância.

## Autocontenção e incorporação

A primeira entrega estável será um diretório/ZIP estático: entrada HTML,
definição do aplicativo, documento, runtime mínimo, módulos, workers, assets,
fontes/áudio, WASM quando necessário, manifestos e licenças. Todas as referências
serão relativas. CDN, telemetria e serviços externos ficam ausentes por padrão.
Exportar resolve o fechamento transitivo e acusa recursos ausentes; não basta
copiar uma lista de arquivos ou esconder o editor com CSS.

O destinatário executa o resultado em navegador comum e hospedagem estática,
sem Termux, Python, Node, conta ou editor como dependências do produto. HTTPS e
políticas do navegador continuam aplicáveis. O pacote ESM não promete abertura
por `file://`. Um único HTML é um perfil posterior opcional: precisa demonstrar
empacotamento de módulos, Worker/SES, assets, CSP e limites de tamanho. Não reduzir
isolamento para obter a aparência de um arquivo único.

O embedding inicial é `iframe`, com protocolo de mensagens versionado e mínimo
(`ready`, `error`, tamanho, pausa e descarte). Validar esquema, `event.source`,
origem esperada e ID da instância; usar canal dedicado após o handshake quando
apropriado. O iframe não recebe o editor nem autoridade sobre a página pai.
Permissões de áudio/fullscreen são explícitas; iniciar áudio por gesto.

Definir e testar dois cenários antes de congelar o snippet: hospedagem em origem
separada com permissões mínimas e configuração de CORS/CSP; mesma origem com
restrições compatíveis e conteúdo gerado confiável. Não anunciar isolamento
contra conteúdo hostil usando a combinação `allow-scripts` + `allow-same-origin`
na mesma origem do pai. Origem opaca exige tratamento próprio de assets e do
handshake; não aceitar `origin: null` como autorização universal. Código de
usuário permanece na fronteira Worker/capabilities, independentemente do iframe.

Duas instâncias devem isolar eventos, seleção, áudio, relógio, storage e recursos.
O service worker do editor não deve ser instalado automaticamente na página
hospedeira. Offline é validado com dependências locais e preparação explícita,
sem atribuir ao pacote recursos que só existiam em cache do desenvolvedor.

## Bibliotecas candidatas e decisão de adoção

Consulta de fontes primárias em 16/09/2026. São opções de implementação; nenhuma
dependência nova é instalada por este patch. Fixar versão, hash, licenças e avisos
do artefato exato no momento da adoção, inclusive dependências transitivas.

| Opção | Utilidade e situação | Limite/alternativa |
|---|---|---|
| Three.js / AnimationMixer — MIT | Já há backend Three; aproveitar clips e blend em vez de um segundo motor de animação. [API](https://threejs.org/docs/pages/AnimationMixer.html), [licença](https://github.com/mrdoob/three.js/blob/dev/LICENSE). | Tipos só no adapter; perfil sem 3D não carrega Three. |
| SES — Apache-2.0 no pacote vendorizado | Reutilizar a versão e hash registrados em [`vendor/ses/README.md`](../../vendor/ses/README.md) e seus avisos de licença. | Host/Worker limitam execução e validam ações; contrato não depende de `Compartment` na API pública. |
| glTF Transform — MIT | Avaliar otimização/normalização de assets como ferramenta opcional de autoria/exportação. [Projeto oficial](https://github.com/donmccurdy/glTF-Transform). | Manter GLB original, relatório e caminho sem otimização; não impor CLI Node ao app exportado. |
| fflate — MIT | Avaliar ZIP/compressão no navegador atrás do archive writer. [Projeto oficial](https://github.com/101arrowz/fflate). | Exportação em diretório/ZIP sem compressão continua possível; medir custo e tamanho, sem adotar números de propaganda como orçamento. |
| Rapier — Apache-2.0 | Avaliar somente se corpos dinâmicos forem necessários. O repositório JS antigo informa migração para `dimforge/rapier/typescript`. [Aviso oficial](https://github.com/dimforge/rapier.js). | Não usar o repositório arquivado como origem de atualização. Prototipar custo WASM, contatos, formas e compatibilidade com o controlador atual antes de selecionar uma versão. |

Uma adoção exige: caso que acelera; prova limitada; fronteira/formatos neutros;
licença e avisos redistribuíveis; offline; orçamento comparável; teste sem a
biblioteca; plano de retirada; decisão registrada. Dependência opcional não pode
virar um import obrigatório do kernel. Formatos padronizados como glTF podem ser
contratos de intercâmbio; objetos internos de um SDK não podem ser o documento.

## Documentação e evidência

`milestones.json` é somente planejamento de desenvolvimento. Não duplica os
registros de comandos/propriedades/plugins nem cria autoridade no aplicativo.
Neste patch ele gera o roadmap, e o template durável gera `PROJECT_SEED.md`.
`roadmap check` detecta divergência dessas projeções.

M1 deve completar metadados dos registros existentes e gerar catálogo JSON,
referência Markdown, ajuda e exemplos verificáveis pela mesma exportação de
descritores. Não inferir a API por scraping do DOM ou regex de nomes de função.
Texto do manual explica tarefas e limites; tabelas de argumentos, tipos e
capabilities são geradas e identificadas como tal. A execução dos exemplos
confirma que documentação e comportamento concordam.

Cada fatia mede apenas o que altera: tamanho inicial, tempo até interagir,
distribuição/p95 de frame, memória quando mensurável e descarte. Registrar
aparelho, navegador, commit/build, cena, warmup e repetições. A meta de cada
produto é pactuada sobre a medição de partida; não apresentar FPS universais ou
estimar prazo sem dados. Uma regressão humana impede a promoção mesmo com os
gates verdes.
