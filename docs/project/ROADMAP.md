# Roadmap do SpatialSeed

> Documento vivo. Auditado em 29 de julho de 2026 durante o marco `0039g1`.
> A ordem expressa dependências técnicas, não promessa de prazo.

## Regra de planejamento

Cada marco deve:

1. introduzir uma capacidade coerente e limitada;
2. preservar a arquitetura orientada a comandos;
3. separar lógica, visualização e transporte;
4. acrescentar testes automáticos e um roteiro visual;
5. registrar impacto de desempenho quando aplicável;
6. terminar num branch testado antes da integração ao `main`.

## Marcos concluídos

### 0022 — Sistema de propriedades

- `PropertyRegistry` tipado;
- Inspector e console sobre os mesmos comandos;
- cor arbitrária, transparência, textura e transformação UV;
- valores mistos e edição atômica em seleção múltipla;
- cor por instância.

### 0023 — Hierarquia de grupos

- grupos com âncora e transform local;
- aninhamento;
- projeção mundial no renderer;
- transformação transacional da subárvore;
- duplicação, exclusão e desagrupamento sem deriva.

### 0024 — Famílias geométricas e interface configurável

- caixa, esfera, cilindro/cone, plano e polígono regular;
- `GeometryRegistry` integrado ao renderer, console e painel;
- referenciais por planos, normal/tangente e três pontos;
- séries afins de até 100.000 objetos;
- toolbar e painéis compostos por manifesto;
- layouts horizontal, vertical e flutuante;
- superfícies abertas renderizadas pelos dois lados.

### 0025 — PWA e interoperabilidade de arquivos

- instalação e cache offline do aplicativo;
- build e cache controlador diagnosticáveis;
- GitHub Pages sem Jekyll;
- documento de projeto separado do transporte web;
- picker nativo quando disponível e fallback móvel;
- testes de projeto, PWA e file interop;
- recuperação automática local registrada como prioridade futura.

### 0026 — Runtime de scripts e procedimentos

- execução JavaScript isolada em Worker/SES;
- cálculos, programas, aleatoriedade determinística e `session`;
- capacidade espacial restrita;
- planos serializáveis e commit atômico;
- procedimentos nomeados e persistentes;
- importação/exportação de catálogos textuais;
- editor de procedimentos.

### 0027 — Laboratório declarativo e desempenho de autoria

- contrato serializável de experimentos e parâmetros;
- catálogo inicial ativado por capability de plugin;
- painel gerado por descritores e comandos equivalentes no console;
- execução pelo runtime de programas, produzindo plano antes do commit;
- seleção individual em lotes com outlines instanciados;
- reconstrução correta de outlines após crescimento;
- leituras de UI coalescidas por frame e perfis de custo do runtime.

### 0028 — Tempo, ações, lotes e espaço de animação

- runtime efêmero com passo fixo, pausa, retomada, parada e restauração;
- comandos temporais sem mutação de sandbox, histórico ou documento;
- matrizes, presets e expressões com `t`, `i`, `u` e `count`;
- captura rígida por raiz ou expansão em objetos renderizáveis;
- ações semânticas comuns a botão e teclado;
- atalhos configuráveis com contextos e proteção de campos textuais;
- interface padrão reorganizada sobre o manifesto existente;
- Inspector coletivo e expressões procedurais atômicas;
- faixas de animação distintas por objeto;
- cor animada por instância e restauração canônica;
- alça central `XYZ` adequada a toque para escala uniforme.

### Limites deliberados após 0028e

- clips e keyframes ainda não pertencem ao documento;
- eventos, colisões e scripts anexados não participam do loop;
- o editor visual completo de workspaces/atalhos ainda não existe;
- política de origens individuais para manipulação manual precisa de contrato
  próprio além do modo por objeto da animação;
- a interface permanece configurável por manifesto e preferências locais, mas
  ainda não exporta um workspace editado.

## Marco atual — 0029, entrada, continuidade e câmeras

O ciclo 0029 reúne capacidades que dependem de fronteiras comuns de distribuição,
viewer e sandbox. Elas devem ser entregues em incrementos independentes:

### 0029a — Portal e catálogo — implementado

- portal HTML na raiz, sem segundo editor;
- aplicativo mantido e experimentos acessíveis por caminhos relativos;
- catálogo JSON canônico para laboratório integrado e protótipos históricos;
- protótipo da antiga raiz preservado fora da entrada pública;
- maturidade, execução offline, dependências e limites declarados;
- auditoria estática de links, destinos e dependências.

### 0029b — Paridade básica dos protótipos — implementado

- Math.js vendorizado com licença;
- camada comum de controles sem copiar lógica entre sete HTMLs;
- seleção móvel e ação “Selecionar tudo”;
- planos `near` e `far` configuráveis e validados;
- escolha explícita do nome ao salvar;
- recursos locais e auditoria offline estrita verde.

### 0029c — Controlador público da câmera de navegação — implementado

- posição, quaternion, foco, órbita, enquadramento e interpolação;
- painel, console e procedimentos sobre a mesma API.

### 0029d — Recuperação automática — implementado

- identidade persistente de sandbox;
- checkpoint e comandos confirmados em IndexedDB;
- diálogo explícito para continuar, exportar ou descartar recuperação.

### 0029e — Múltiplas instâncias locais — implementado

- viewers com seleção e câmera próprias sobre um sandbox lógico comum;
- coordenação por revisão e `BroadcastChannel`;
- rejeição ou reavaliação explícita de intenções obsoletas.

### 0029e1 — Animação efêmera entre viewers — implementado

- definição declarativa e alvos concretos distribuídos pela autoridade local;
- época absoluta comum para abas suspensas ou abertas durante a reprodução;
- início, pausa, retomada e parada sincronizados por sequência;
- conflitos temporais obsoletos rejeitados explicitamente;
- nenhum quadro, matriz ou estado temporal inserido no documento.

### 0029e2 — Seleção e sucessão de sessões locais — implementado

- diretório transitório de projetos ativos na mesma origem;
- escolha explícita do `sandboxId` quando mais de um projeto está rodando;
- remoção de viewers fechados e expiração de anúncios abandonados;
- promoção de réplica após fechamento da autoridade;
- adoção do snapshot vivo pelo diário de recuperação promovido.

### 0029f — Objetos câmera e projetos locais explícitos — implementado

- nós de câmera persistentes e hierárquicos;
- múltiplas câmeras, câmera ativa local e câmera padrão opcional do documento;
- migração retrocompatível do schema para a versão 3;
- handshake de entrada antes da recuperação de um viewer;
- criação de projeto independente e abertura de arquivo em nova aba;
- transferência de arquivo transitória, sem persistir conteúdo no diretório de
  sessões.

### 0029f1 — Estabilização operacional de câmeras — implementado

- criação em réplica ativada somente após confirmação autoritativa;
- preview efêmero de gizmo entre viewers, limitado a 30 Hz;
- atualização contínua do viewer que usa a câmera transformada;
- seleção por painel, alvo móvel ampliado e estados visuais distintos;
- política local de frustums e ocultação do auxiliar da câmera ativa;
- diagnóstico separado de serviço, remoção visual e transporte temporário.

### 0029g — Rigs, alvos e órbitas persistentes

- `aimTarget` mundial, por objeto ou locator;
- modos livre, olhar para, seguir e orbitar;
- rig hierárquico com pivô, dolly e câmera;
- offset e vetor vertical explícitos;
- schema 4 retrocompatível.

### 0029h — Animação de câmera e direção de cena

- adaptadores de alvo para câmera de navegação e objeto câmera;
- posição, orientação, alvo, órbita, campo visual e recorte animáveis;
- shots, cortes, cues e transições espaciais;
- papéis locais de operador, preview e program;
- restauração exata ao parar o overlay.

### 0029i — Modo cena e controles configuráveis

- teclas e ações arbitrárias sobre `UiActionRegistry`;
- zonas invisíveis configuráveis para toque;
- próximo/anterior shot, câmera direta e cues;
- teste de captura de botões físicos quando o navegador os expuser.

### 0029j — Consolidação e livro 0.7

- migração progressiva das construções úteis para o laboratório declarativo;
- HTMLs históricos reduzidos a wrappers ou evidência comparativa;
- reescrita majoritária do livro a partir do estado estabilizado do 0029.

### 0031–0035 — Geometrias, renderização física e edição topológica — implementado

- catálogo das geometrias de malha disponíveis no Three.js vendorizado;
- sombras, ambiente, materiais físicos e configuração local por viewer;
- sessão isolada de edição com frames mundo, objeto e viewer;
- snap adaptativo, restrições de eixo/plano e falloff procedural em tempo real;
- seleção exclusiva de vértices, arestas e faces da malha ativa;
- representação transitória por meia-arestas, adjacências e ciclos de contorno;
- criação, exclusão, duplicação, extrusão, inset, divisão, subdivisão, colapso,
  inversão de diagonal, ponte de contornos, soldagem e orientação de faces;
- histórico interno completo e commit editorial atômico;
- painel flutuante único, redimensionável e configurável por checkboxes.

### 0036 — Workspace e navegação de edição — implementado

- painel único para seleção, transformação e edição de malha;
- HUD destacável com estados de alta frequência;
- eixos independentes e frames mundo, objeto, viewer e plano personalizado;
- plane lock e point lock locais ao viewer.

### 0037a — Referências espaciais e ferramentas por caminho — implementado

- objetos resolvidos como caminhos, perfis planares e pontos;
- linha central declarada, maior contorno, arestas soltas e pivôs da seleção;
- tubo por caminho, varredura de perfil e distribuição hierárquica;
- frames de transporte paralelo com correção de costura e torção explícita;
- comandos comuns ao painel e console;
- referências snapshot, sem dependência procedural implícita.

### 0037b — Workspace adaptativo e curvas editáveis — implementado

- remoção do painel separado de transformação e do menu residual Mais;
- seções visíveis conforme objeto/malha, ferramenta e componente ativo;
- HUD destacável configurável em colunas × linhas;
- contenção de painéis e menus dentro da viewport;
- desenho livre de caminhos em plano travado, viewer ou plano mundial;
- polilinha, Catmull–Rom e Bézier cúbica ajustada;
- edição de âncoras e controles Bézier sem perder o descritor de caminho;
- criação de caminho a partir de seleção de vértices, arestas ou faces.

### 0037c — HUD contextual, luzes e materiais — implementado

- configuração do HUD rolável, redimensionável e sempre contida na viewport;
- HUD estritamente icônico, iluminado por estado e filtrado por contexto;
- seleção, topologia, caminhos, criação e operações frequentes disponíveis no HUD;
- seções essenciais do workspace visíveis por padrão, sem depender de painéis paralelos;
- criação comum e avançada usando outro objeto como argumento de transformação;
- memória local de geometria, cor e parâmetros de material;
- materiais físicos editáveis por objeto no workspace e Inspector;
- luzes pontuais, direcionais, spot e ambiente como objetos persistentes editáveis.

### 0038–0039g1 — Ciclo, repetição e autoria por caminho — implementado

- ferramentas persistentes com posicionamento e desenho contínuos;
- plano de edição independente da trava de visualização;
- repetição normalizada pela mesma rota do HUD, workspace e console;
- duplicação seguida de transformação composta e `repeat count`;
- preferências de continuidade isoladas por identidade semântica;
- armazenamento versionado e migração sem apagar preferências anteriores;
- testes do lifecycle isolados do estado real do navegador;
- schemas e últimos valores de ferramentas parametrizadas compartilhados por
  HUD, workspace e console;
- painel contextual gerado por schema;
- desenho livre com preview de tubo ou de qualquer geometria/grupo distribuído
  diretamente pelo traço;
- distribuição desenhada progressiva por espaçamento, sem quantidade
  predeterminada;
- seleção ou qualquer provider do catálogo como fonte do pincel;
- cache efêmero que conserva geometria, material e `InstancedMesh` durante o
  gesto e atualiza somente matrizes;
- migração não destrutiva do armazenamento de parâmetros para schema 2;
- lote distribuído confirmado em uma única operação de undo.
- parâmetros completos de qualquer provider do catálogo no pincel;
- orientação explícita preservada, relativa ao plano ou à tangente;
- modificadores afins locais com `i`, `u`, distância, curvatura e frames;
- progresso `u` causal por distância, sem redefinir o prefixo ao crescer;
- reparo limitado da cauda conforme a interpolação e a curvatura;
- plano lógico de commit preparado incrementalmente durante o gesto;
- cor paramétrica instanciada e escala negativa por inversão cromática;
- handoff visual sem ocultar e recriar o traço no encerramento.
- rearmamento da ferramenta persistente sem recapturar recursos invariantes;
- confirmação coordenada somente após os IDs criados serem observáveis;
- índices por ID e cache incremental para seleção, referências e painéis;
- listas visuais atualizadas pelo diferencial criado, sem reconstrução por
  troca de ferramenta.

### Próximas extensões geométricas

- redefinição paramétrica de objetos pelo Inspector com preview e commit único;
- pivô/origem no HUD e grid configurável por plano;
- núcleo planar, estilos de caminho e ferramentas 2D fundamentais;
- seleção por laço, pincel e borracha com commit atômico;
- régua, transferidor e compasso como referências para transformações;
- sanitização configurável com relatório de degenerações, contornos,
  não-manifold e auto-interseções;
- booleanos robustos em Worker e limpeza posterior;
- referências vinculadas por grafo de modificadores;
- objetos 2D e curvas com atributos por ponto de primeira classe;
- loft, perfis com furos e variação procedural ao longo do caminho.

### Próxima extensão do editor topológico

- UVs e normais por canto, materiais por face e grupos de suavização;
- bevel, knife, loop/ring cut e bridge entre contornos desiguais;
- assets de malha compartilhados com copy-on-write e persistência compacta;
- aceleração BVH para picking e operações sobre malhas extensas;
- reparo orientado de auto-interseções e remalhamento.

## Marco geométrico seguinte — 2D, polylines e curvas

### Escopo

- ponto, segmento e polyline como descritores de primeira classe;
- curvas Bézier quadráticas e cúbicas;
- amostragem com tolerância ou número de segmentos explícito;
- frames locais, planos arbitrários e transformações afins;
- espessura visual separada da geometria matemática;
- criação por painel, console e `spatial.create`;
- propriedades e serialização pelo mesmo registro;
- testes de continuidade, orientação e limites.

### Critério de saída

O usuário deve conseguir construir e editar trajetórias 2D/3D reproduzíveis,
usar curvas em procedimentos e preparar a base para perfis, extrusões e meshes.

## Editor topológico de mesh — núcleo entregue em 0035a

O núcleo previsto neste marco foi entregue com seleção de subelementos, preview
local, comandos atômicos, undo interno, validação manifold e operações
primitivas. As extensões de DCC e persistência de assets compartilhados estão
listadas na próxima extensão do editor topológico.

## Persistência compacta e recuperação local

- evolução versionada do schema `.spatialseed`;
- preservação retrocompatível dos arquivos atuais;
- receitas, protótipos e instâncias sem expansão desnecessária;
- compressão opcional do contêiner;
- recuperação atômica de comandos confirmados em IndexedDB;
- OPFS para texturas e outros blobs grandes;
- diálogo de recuperação ao iniciar;
- limpeza e migração explícitas.

## Interoperabilidade, plugins e colaboração

- importação/exportação por adapters, começando por glTF e STL;
- avaliação de Collada/DAE apenas quando houver caso de uso e testes;
- guia público para providers geométricos e propriedades;
- manifesto de plugins e capabilities;
- navegador de projeto sem acesso irrestrito ao sistema;
- envelope de operações e matriz de conflitos antes da escolha de CRDT/OT;
- prova comparativa de Yjs e Automerge sem vazar a biblioteca no domínio;
- protocolo de snapshots, deltas e conflitos entre regiões;
- identidade de autor, revisão e proposta distribuída.

### Gates tecnológicos

- QuickJS/WASM só entra como backend adicional após threat model, corpus de
  compatibilidade e benchmark mobile contra Worker + SES;
- P2P não substitui autoridade regional e não precede autenticação, autorização
  e reconexão observável;
- convergência estrutural precisa ser acompanhada por validação geométrica e
  testes de conflitos semânticos.

## Operadores procedurais e gramáticas de forma

- escopo orientado ligado a shape, frame local e pivô;
- perfil, extrusão, `split`, repetição e seleção de componentes;
- regras nomeadas, parâmetros e aleatoriedade com semente;
- consultas espaciais limitadas por orçamento;
- geração de planos inspecionáveis e commit atômico;
- cache, regeneração incremental e receita compacta;
- demonstração de fachada ou quarteirão paramétrico.

Este marco depende de geometria 2D e identidade topológica. A API dos operadores
precede qualquer gramática textual própria. Compatibilidade integral com CGA não
faz parte do escopo inicial.

## Prioridades transversais

Estas atividades não precisam esperar um marco próprio.

### Documentação

- escrever as especificações listadas em
  [`DOCUMENTS_TO_WRITE.md`](DOCUMENTS_TO_WRITE.md);
- manter README, decisões e roadmap sincronizados;
- não repetir build, listas de capabilities ou contagens de teste em arquivos
  estáticos quando podem ser consultados no runtime.

### Desempenho

- registrar device/browser/build junto a cada benchmark;
- manter séries comparáveis, não apenas medições isoladas;
- observar custo de hierarquia, propriedades, texturas e scripts;
- impedir reconstrução integral em operações incrementais comuns;
- tratar tamanho excessivo de arquivos agrupados/procedurais como prioridade de
  persistência, não como regressão ignorada.

### Experiência de uso

- corrigir o ajuste de fonte do editor de procedimentos;
- melhorar alças de redimensionamento para toque;
- revisar densidade da toolbar em telas pequenas;
- produzir catálogos, exemplos e cenas demonstrativas;
- testar fluxos completos por pessoas que não acompanharam o desenvolvimento.

### Qualidade e segurança

- manter `runtime test all` verde;
- acrescentar teste para cada regressão encontrada visualmente;
- formalizar o threat model do runtime SES;
- definir CSP e política de dependências antes de aceitar código não confiável;
- não confundir isolamento experimental com garantia de segurança.
- manter a avaliação crítica e os gates tecnológicos de
  [`STRATEGIC_ARCHITECTURE_REVIEW.md`](STRATEGIC_ARCHITECTURE_REVIEW.md).

## Itens deliberadamente adiados

- bevel, knife e remalhamento antes de consolidar o modelo topológico e seus testes;
- otimização prematura do formato sem especificação de migração;
- servidor colaborativo antes de definir deltas e autoridade;
- novos botões que não tenham comando equivalente;
- formatos de importação sem roundtrip e casos de teste;
- monetização que exija fechar os contratos centrais antes de validar produto e
  licenciamento.

## Como atualizar este roadmap

Ao concluir um marco:

1. mova-o para “Marcos concluídos” com apenas resultados confirmados;
2. não registre números de teste ou hashes transitórios;
3. transforme decisões novas em entradas de `DECISIONS.md`;
4. atualize documentação e exemplos afetados;
5. escolha o próximo marco por dependência, risco e capacidade demonstrável.
