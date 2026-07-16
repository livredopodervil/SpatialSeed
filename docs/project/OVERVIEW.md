# Visão geral do SpatialSeed

> Documento vivo. Auditado em 16 de julho de 2026 contra o marco `0026`.
> O build exato nunca deve ser copiado para este texto: sua fonte autoritativa
> é [`apps/web/build-info.json`](../../apps/web/build-info.json).

## Definição

SpatialSeed é um ambiente espacial modular para criar, editar, programar,
salvar, publicar e, progressivamente, simular e habitar mundos digitais.
Embora sua interface atual se pareça com um editor 3D, o projeto investiga um
problema mais geral: como preservar a identidade de um mundo quando ele é
operado por interfaces, renderizadores, autores e níveis de autoridade
diferentes.

A “semente” não é uma tela específica. É o conjunto mínimo de contratos que
permite reconstruir o mesmo mundo: identificadores, schemas, comandos,
snapshots, deltas, descritores geométricos, recursos endereçáveis e regras de
transformação.

## Proposta central

Edição manual e produção procedural devem convergir na mesma semântica.
Botões, gizmos, Inspector, console, programas, automações e futuros agentes não
podem possuir implementações concorrentes da mesma operação. Cada superfície
traduz uma intenção para comandos públicos; o domínio valida a mudança; o
sandbox registra o histórico; renderizadores apenas projetam o resultado.

Esse desenho procura tornar o sistema:

- reutilizável por interfaces ainda não imaginadas;
- auditável, porque toda mutação tem uma via explícita;
- testável sem depender de gestos ou pixels;
- eficiente para objetos isolados e grandes conjuntos;
- seguro para experimentação, porque programas planejam antes de publicar;
- transportável entre navegador, PWA, arquivos e futuras regiões distribuídas.

## O que está implementado

### Edição espacial

- seleção única, múltipla e por área;
- operações explícitas de substituir, incluir, remover e alternar seleção;
- mover, girar e escalar em espaço mundial ou local;
- pivôs por mediana, limites, objeto ativo e posição personalizada;
- snapping, grade, previews e commit editorial;
- duplicação, repetição e séries afins paramétricas;
- undo e redo locais sobre comandos confirmados.

### Hierarquia

- grupos lógicos com raiz, âncora e transformações locais;
- aninhamento de grupos;
- projeção das transformações mundiais sem destruir o estado lógico;
- transformação, duplicação e exclusão de subárvores;
- desagrupamento de um nível sem deriva no espaço mundial;
- seleção externa do grupo como unidade visual e editorial.

### Geometria e aparência

- caixas, esferas, cilindros/cones, planos e polígonos regulares;
- posicionamento por plano canônico, normal/tangente ou três pontos;
- providers descritos por um `GeometryRegistry` extensível;
- cor arbitrária, transparência, textura e transformação UV;
- cor por instância e materiais compartilhados;
- caches com contagem de referências e atualização incremental;
- `THREE.InstancedMesh`, picking por `instanceId` e highlights por instância.

### Programação

- linguagem afim indexada com AST validada;
- calculadora JavaScript e programas síncronos em Worker;
- namespace persistente `session` para valores, objetos e funções;
- isolamento SES sem acesso implícito a DOM, rede, arquivos ou runtime;
- capacidade `spatial` limitada à criação de intenções autorizadas;
- validação e commit atômico de planos espaciais;
- procedimentos nomeados, persistentes, importáveis e exportáveis;
- editor textual de procedimentos no navegador.

### Portabilidade e operação

- publicação estática pelo GitHub Pages;
- PWA instalável e cache offline do aplicativo;
- abrir e salvar projetos com API nativa quando disponível e fallback móvel;
- catálogos de procedimentos em JSON legível;
- configuração declarativa de barra, painéis e apresentação;
- diagnóstico, testes, auditoria de recursos e benchmarks pelo console.

## O que ainda não está implementado

- main loop público para animações, eventos e interatividade programável;
- curvas, polylines e sistema geométrico 2D completo;
- edição direta de vértices, arestas, faces e meshes arbitrárias;
- recuperação automática da última sessão;
- serialização compacta de receitas procedurais e grandes hierarquias;
- interoperabilidade completa com glTF, STL, Collada e formatos equivalentes;
- servidor colaborativo, autoridade regional remota e sincronização multiusuário;
- modelo de segurança auditado para executar código hostil em produção.

Esses itens pertencem ao roadmap. Não devem aparecer em apresentações como
capacidades já entregues.

## Invariantes arquiteturais

1. O estado lógico não depende de Three.js nem de qualquer renderer.
2. Mutação persistente passa por comandos canônicos.
3. Interfaces não duplicam lógica de domínio.
4. Preview transitório não entra no histórico nem no arquivo de projeto.
5. Undo e redo pertencem ao sandbox editorial, não à região autoritativa.
6. Operações em lote são validadas antes de alterar qualquer alvo.
7. Programas não recebem autoridade direta sobre a cena.
8. Planos espaciais podem ser descartados sem efeito.
9. Geometrias e propriedades entram por registros descritivos.
10. Recursos iguais devem ser compartilhados sempre que a semântica permitir.
11. Build, capacidades e testes devem possuir fontes autoritativas consultáveis.
12. Alterações arquiteturais são pequenas, reversíveis e acompanhadas de testes.

## Públicos possíveis

SpatialSeed pode atender, em níveis diferentes de maturidade:

- pessoas criando estruturas matemáticas e arte procedural;
- estudantes explorando geometria e transformações;
- designers e artistas que combinam edição manual e programação;
- pesquisadores de interfaces espaciais, simulação e mundos persistentes;
- desenvolvedores interessados em uma arquitetura 3D orientada a comandos;
- futuros autores de plugins, catálogos e regiões especializadas.

## Critério de identidade

Uma nova interface, distribuição ou otimização pertence ao SpatialSeed quando
consegue operar o mesmo estado pelos mesmos contratos sem se tornar uma fonte
paralela de verdade. Se uma função só existe num botão, num renderer ou num
script privilegiado, a arquitetura ainda não a integrou.

## Fontes relacionadas

- [`../../README.md`](../../README.md): porta de entrada e manual resumido;
- [`DECISIONS.md`](DECISIONS.md): decisões arquiteturais vigentes;
- [`ROADMAP.md`](ROADMAP.md): prioridades e sequência planejada;
- [`WORKFLOW.md`](WORKFLOW.md): processo de alteração e integração;
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md): arquitetura técnica do monorepo;
- [`../SCRIPT_RUNTIME_0026A.md`](../SCRIPT_RUNTIME_0026A.md): runtime de programas.
