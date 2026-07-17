# Roadmap do SpatialSeed

> Documento vivo. Auditado em 16 de julho de 2026 após a conclusão funcional do
> marco `0026`. A ordem expressa dependências técnicas, não promessa de prazo.

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

## Prioridade atual — 0027: tempo, animação e interatividade

O próximo marco deve provar que a linguagem pode conhecer tempo e eventos sem
receber autoridade direta sobre o mundo editorial.

### Escopo mínimo

- main loop explícito e pausável;
- relógio monotônico e passo de simulação definido;
- eventos de início, atualização, pausa e interação básica;
- scripts anexáveis por identidade, não por referência ao renderer;
- snapshot de leitura e fila de intenções para o próximo passo;
- separação entre simulação contínua e comandos editoriais;
- orçamento de CPU, timeout e encerramento do script;
- uma demonstração simples de animação e uma de interação;
- testes determinísticos sem depender da taxa de quadros visual.

### Questões que precisam de decisão antes do código

- passo fixo, variável ou combinação dos dois;
- onde vive o estado privado de cada script;
- quais eventos atravessam a fronteira SES;
- como conflitos entre scripts e edição manual são resolvidos;
- quando intenções da simulação tornam-se deltas publicáveis;
- como pausar, reiniciar e inspecionar sem perder determinismo.

### Critério de saída

Uma cena deve animar e responder a um evento com resultados reproduzíveis,
enquanto encerrar o runtime interrompe a dinâmica sem corromper a cena ou o
histórico editorial.

## 0028 — Geometria 2D, polylines e curvas

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

## 0029 — Edição de mesh

### Preparação

Antes de oferecer ferramentas visuais, definir:

- identidade estável de vértices, arestas e faces;
- topologia e orientação;
- seleção de subelementos;
- copy-on-write para geometrias compartilhadas;
- comandos atômicos e undo;
- validação de degenerações e não-manifold;
- projeção e picking sem tornar Three.js autoritativo.

### Entrega incremental

1. inspeção somente leitura da mesh;
2. seleção de vértices;
3. deslocamento e transformação de seleção;
4. inserção e remoção controlada;
5. operações de face e extrusão;
6. importação/exportação e reparo.

## 0030 — Persistência compacta e recuperação local

- evolução versionada do schema `.spatialseed`;
- preservação retrocompatível dos arquivos atuais;
- receitas, protótipos e instâncias sem expansão desnecessária;
- compressão opcional do contêiner;
- recuperação atômica de comandos confirmados em IndexedDB;
- OPFS para texturas e outros blobs grandes;
- diálogo de recuperação ao iniciar;
- limpeza e migração explícitas.

## 0031 — Interoperabilidade, plugins e colaboração

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

## 0032 — Operadores procedurais e gramáticas de forma

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

- edição de mesh antes de consolidar curvas e subelementos;
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
