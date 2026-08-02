# Spatial Seed — semente de continuidade

## Projeto

Ambiente espacial, procedural e orientado a comandos para Android + Termux +
navegador. A aplicação mantida está em `apps/web/`.

## Ambiente

```text
Repositório: ~/SpatialSeed-monorepo
Cópia pública: ~/storage/shared/SpatialSeed-monorepo
Aplicação: http://127.0.0.1:8082/apps/web/
```

Não presumir Node.js ou npm. Python, Git e curl estão disponíveis.

## Fontes de verdade

1. código e testes do branch carregado;
2. `apps/web/build-info.json`;
3. `runtime test help`, `help`, registros de geometrias e propriedades;
4. `README.md` e documentos vivos em `docs/project/`;
5. documentos de marco em `docs/`;
6. memória de conversa, apenas como pista.

Não copie para esta semente contagens de testes, hashes ou listas geráveis.

## Estado funcional até 0029f1

- portal HTML na raiz e catálogo canônico de experimentos;
- protótipos históricos offline, com seleção móvel, recorte configurável e
  salvamento nomeado;
- `near` e `far` validados como estado local do viewer principal;
- controlador público da câmera de navegação com posição, quaternion, alvo
  derivado, campo visual, enquadramento, órbita e interpolação;
- painel, console e procedimentos sobre as mesmas operações locais de câmera;
- região local, sandbox com undo/redo e planos revisáveis;
- seleção múltipla/área, pivôs, snapping e gizmos;
- escala uniforme pela alça central `XYZ`;
- hierarquia de grupos aninháveis com transformações locais;
- criação geométrica e séries afins por registros;
- propriedades e Inspector em lote, inclusive expressões procedurais e expansão
  explícita de grupos;
- recursos compartilhados, instancing e projeção incremental;
- projetos `.spatialseed`, PWA offline e transporte de arquivos;
- identidade persistente de sandbox e recuperação IndexedDB por checkpoint mais
  comandos confirmados;
- múltiplos viewers locais com câmera e seleção próprias, sandbox coordenado por
  revisão e rejeição explícita de intenções obsoletas;
- diretório transitório de projetos ativos, escolha explícita de destino para
  novos viewers e sucessão local da autoridade;
- criação e abertura explícitas de projetos independentes em novas abas, com
  transferência transitória do arquivo e handshake antes da recuperação;
- objetos câmera persistentes e hierárquicos, câmera ativa local por viewer e
  câmera padrão opcional do documento;
- criação transacional de câmeras em réplicas, seleção ampliada e frustums
  configuráveis;
- preview efêmero de gizmos compartilhado a até 30 Hz, inclusive atualizando
  viewers que usam uma câmera transformada;
- sessões efêmeras de animação compartilhadas por descritor, sequência e época
  absoluta, com cálculo de quadros local em cada viewer;
- runtime Worker/SES, sessões, planos e procedimentos;
- laboratório declarativo de experimentos;
- ações e atalhos configuráveis sobre os mesmos comandos;
- runtime de animação efêmero, presets, faixas por objeto e cor animada;
- testes, diagnósticos, recursos e benchmarks consultáveis no aplicativo.
- catálogo ampliado de geometrias Three.js e providers declarativos;
- configuração local de sombras, ambiente, reflexos e materiais físicos;
- edição isolada de malha com vértices, arestas e faces, meia-arestas
  transitórias, snap adaptativo, falloff em tempo real e undo interno;
- operações topológicas primitivas e painel flutuante único configurável;
- objetos resolvíveis como caminhos, perfis e pontos, com tubo, varredura e
  distribuição hierárquica por frames de transporte paralelo.
- ciclo persistente de ferramentas, repetição de comandos normalizados e
  posicionamento por clique com prévia local;
- preferências de continuidade isoladas por ferramenta, versionadas e migradas
  sem apagar o registro local anterior;
- duplicação coordenada com publicação tardia da seleção e `repeat count`,
  preservando a matriz delta composta numa única transação;
- schemas e parâmetros versionados por ferramenta, compartilhados por HUD,
  workspace e console, com migração não destrutiva;
- desenho livre com preview local de tubo ou distribuição de qualquer
  geometria/grupo selecionado pelo traço, confirmado em uma única ação;
- pincel de caminho progressivo por espaçamento, usando seleção ou qualquer
  provider do catálogo e conservando os mesmos lotes instanciados no preview;
- pincel causal com `u` por distância, prefixo estável, cauda reparável, cor
  paramétrica e plano lógico preparado incrementalmente antes do commit;
- planos independentes de visualização e edição, visualização 2D autoritativa e
  órbita em ponto travado.
- planos independentes de desenho, edição direta de pivô no HUD e ferramentas
  2D fundamentais sobre planos arbitrários;
- navegação multitoque preservada durante ferramentas, HUD sem teto artificial,
  snap de grade/ângulo compartilhado, régua, transferidor e reset do viewer.

## Invariantes

1. Three.js e o Viewer não são estado autoritativo.
2. Seleção, pivô, gizmos e previews pertencem ao nível editorial.
3. A região não conhece manipulações intermediárias do editor.
4. Interface, Inspector, console e agentes executam comandos canônicos.
5. Undo/redo pertence ao sandbox, não à região.
6. Editar pivô não altera o objeto.
7. Operações persistentes produzem mudanças ou deltas identificáveis.
8. Snapshots compartilhados são imutáveis.
9. Objetos idênticos compartilham protótipos sempre que possível.
10. Edição individual de instância compartilhada usa copy-on-write.
11. Atualizações são pequenas, auditáveis e reversíveis.
12. Diagnosticar e medir antes de otimizar.
13. Não pedir grandes edições manuais no celular.
14. Quando etapas dependem entre si, fornecer uma etapa por vez.
15. Sincronizar, verificar hashes, reiniciar e abrir o navegador antes de testar.
16. Toda otimização mantém ou amplia os testes automatizados.
17. Não introduzir dependência obrigatória de Node.js ou npm.
18. Experimentos e programas produzem planos; não recebem DOM ou sandbox.
19. Animação efêmera não altera cena canônica, histórico ou arquivo.
20. Grupos só são expandidos em descendentes quando o escopo declarar isso.
21. Preservar manifesto, preferências e múltiplos painéis ao mudar a interface.
22. Somente o viewer autoritativo substitui projeto, recuperação ou base
    regional; réplicas enviam comandos pela coordenação local.
23. Reprodução compartilhada transmite intenção e tempo, nunca matrizes por
    quadro, e continua fora do documento e da recuperação.
24. A câmera de navegação continua local; objetos câmera são entidades
    persistentes e só a ativação deles pertence ao viewer.
25. Um viewer que entra numa sessão existente aguarda o primeiro snapshot antes
    de disputar autoridade ou iniciar recuperação.
26. Previews de gestos manuais podem transmitir matrizes temporárias limitadas;
    somente o comando final entra no documento, histórico e recuperação.
27. A reorganização converge para oito módulos, usa um único mapa de migração e
    aceita somente redução monotônica da dívida arquitetural medida.

## Fluxo

```bash
cd ~/SpatialSeed-monorepo
git status --short
git diff
bash tools/seedctl test
```

`bash tools/seedctl test` sincroniza, verifica hashes, reinicia o servidor sem cache e abre a aplicação.

## Console

Consulte `help`, `help create`, `help animate`, `procedure help` e
`runtime test help` no build carregado. Exemplos de diagnóstico:

```text
help
runtime test help
runtime test all
runtime resources
animate status
```

## Próxima prioridade

Validar visualmente o build `0047b` e confirmar os gates em Android/Termux. O
contrato `module-v2`, o reducer regional e o catálogo inicial de experimentos
já usam ativação candidata, rollback e contribuições declaradas. O próximo
incremento deve retirar testes, benchmarks e diagnósticos do grafo de produção,
quebrar o ciclo `apps/web` ↔ `runtime-test-plugin` e reduzir o composition root;
não deve iniciar ainda a migração do HUD.

O roadmap funcional permanece preservado, mas está subordinado à cristalização
do núcleo: redefinição paramétrica pelo Inspector; operadores e constraints 2D;
cotas persistentes; grafo explícito de modificadores; e topologia/atributos de
malha ampliados.

Referência: `docs/project/ROADMAP.md`, `docs/MESH_TOPOLOGY_0035A.md`,
`docs/PATH_REFERENCES_0037A.md`,
`docs/PATH_BRUSH_AUTHORING_0039E.md`,
`docs/AFFINE_PATH_BRUSH_0039F.md`,
`docs/INCREMENTAL_PATH_BRUSH_0039G.md`,
`docs/SELECTION_GESTURES_0039G2.md`,
`docs/PLANAR_AUTHORING_0040A.md`,
`docs/MEASUREMENT_INPUT_0040B.md`,
`docs/TOOL_PARAMETERS_PATH_DRAW_0039D.md` e
`docs/EDIT_INTERACTION_0038B.md`. Para a reorganização atual, consulte
`docs/project/MAIN_PROPOSAL_ARCHITECTURE.md` e
`docs/project/BASELINE_GATES.md`.

## Protocolo para nova LLM

1. Ler `AGENTS.md`, `PROJECT_SEED.md` e
   `docs/project/CHATGPT_PROJECT_INSTRUCTIONS.md`.
2. Confirmar `pwd`, branch, HEAD, status, remoto e build.
3. Ler o código e os testes da área antes de propor alteração.
4. Preservar funcionalidades existentes e mudanças do usuário.
5. Reutilizar comandos, registros, manifesto e gerenciadores atuais.
6. Não misturar estado editorial, especulativo, autoritativo, visual e temporal.
7. Preferir patch mínimo, testável e reversível.
8. Executar suíte específica, `runtime test all` e teste visual aplicável.
9. Repetir benchmarks equivalentes após otimizações.
10. Atualizar documentação viva, decisão e ponto de retomada.
