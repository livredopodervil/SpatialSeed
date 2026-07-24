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

## Estado funcional até 0028e

- região local, sandbox com undo/redo e planos revisáveis;
- seleção múltipla/área, pivôs, snapping e gizmos;
- escala uniforme pela alça central `XYZ`;
- hierarquia de grupos aninháveis com transformações locais;
- criação geométrica e séries afins por registros;
- propriedades e Inspector em lote, inclusive expressões procedurais e expansão
  explícita de grupos;
- recursos compartilhados, instancing e projeção incremental;
- projetos `.spatialseed`, PWA offline e transporte de arquivos;
- runtime Worker/SES, sessões, planos e procedimentos;
- laboratório declarativo de experimentos;
- ações e atalhos configuráveis sobre os mesmos comandos;
- runtime de animação efêmero, presets, faixas por objeto e cor animada;
- testes, diagnósticos, recursos e benchmarks consultáveis no aplicativo.

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

Escolher por teste de uso entre:

1. origens individuais e coerência de transformações hierárquicas;
2. editor interno/exportável de atalhos e workspaces;
3. persistência de clips/keyframes e modelo de eventos;
4. geometria 2D, polylines e curvas;
5. recuperação local e persistência procedural compacta.

Referência: `docs/project/ROADMAP.md`.

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
