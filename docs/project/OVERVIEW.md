# Visão geral do SpatialSeed

> Documento vivo. Auditado para a revisão documental de 17 de agosto de 2026.
> O build exato pertence a `apps/web/build-info.json`.

## Definição

SpatialSeed é um ambiente espacial modular para criar, editar, programar,
salvar, simular e transportar mundos digitais. A aplicação atual é um editor
WebGL, mas a unidade durável do projeto é o conjunto de contratos que preserva
identidade, comandos, recursos, hierarquia e decisões quando interfaces ou
renderizadores mudam.

## Proposta central

Edição manual e produção procedural convergem na mesma semântica. Botões,
gizmos, Inspector, console, procedimentos e automações não devem manter
implementações concorrentes de uma operação. Interfaces traduzem intenção;
serviços validam; o sandbox registra; renderizadores projetam.

## O que existe

### Autoria

- seleção única, múltipla e por gestos de área;
- transformações, pivôs, snap e previews;
- duplicação, repeat, séries afins e grupos;
- plano ativo, ferramentas 2D, medição e caminhos;
- criação paramétrica, materiais, texturas e luzes;
- edição de vértices, arestas e faces com commit isolado.

### Programação

- console editorial;
- AST matemática restrita;
- Worker + SES para JavaScript síncrono;
- planos revisáveis e commit atômico;
- procedimentos e experimentos declarativos;
- runtime temporal e animações efêmeras.

### Operação

- arquivos `.spatialseed`;
- importação e exportação STL;
- PWA e recuperação local;
- múltiplos viewers locais coordenados;
- câmera de navegação e objetos câmera;
- testes, diagnóstico e benchmarks consultáveis.

### Simulação

- modo jogo efêmero;
- proxy físico e visual GLB separado;
- movimento combinado e relativo à câmera;
- colisores de caixa, esfera e malha triangular;
- câmera de terceira pessoa com consulta de obstáculo;
- áudio, eventos e projeto demo dirigido por manifesto.

## O que está em consolidação

- ferramentas por caminho e operadores topológicos avançados;
- colisão acelerada e contatos mais gerais;
- personagem animado sob escalas e hierarquias complexas;
- lógica de jogos por eventos e procedimentos;
- convergência de todas as superfícies de autoria numa fachada canônica;
- atualização PWA em ciclos rápidos de desenvolvimento.

## O que não está implementado como produto completo

- colaboração remota multiusuário;
- CRDT ou event sourcing integral;
- física geral de corpos rígidos;
- CAD topológico completo;
- booleanas robustas universais;
- modificadores vinculados com regeneração universal;
- importação rica completa de todos os formatos 3D;
- segurança auditada para plugins hostis.

## Invariantes

1. estado lógico independente do renderer;
2. mutação persistente por comandos públicos;
3. preview não é commit;
4. undo/redo pertence ao sandbox;
5. seleção, câmera e painéis são estados distintos do documento;
6. grupos preservam transformações locais;
7. operações em lote validam antes de mutar;
8. programas produzem planos antes de publicar;
9. recursos equivalentes são compartilhados quando possível;
10. instancing não elimina identidade;
11. animação e jogo são overlays restauráveis do viewer;
12. PWA, arquivo e recuperação local são responsabilidades diferentes;
13. arquitetura futura deve reduzir dívida medida sem criar nova autoridade.

## Produtos documentais

- `README.md` - porta de entrada;
- `docs/MANUAL_DO_USUARIO.md` - uso por tarefas;
- `docs/REFERENCIA_TECNICA.md` - contratos e subsistemas;
- `docs/book/` - livro e PDF;
- `docs/project/DECISIONS.md` - decisões;
- `docs/project/ROADMAP.md` - horizonte e critérios de saída.

## Critério de identidade

Uma nova interface, otimização ou distribuição pertence ao SpatialSeed quando
opera o mesmo estado pelos mesmos contratos sem se tornar fonte paralela de
verdade.
