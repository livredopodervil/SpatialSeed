# Documentação de controle do projeto

> Índice vivo. Auditoria atualizada em 24 de julho de 2026 até o marco
> `0028e`.

Esta pasta reúne documentos duráveis de direção, decisão, operação e
continuidade. Ela não participa do runtime. Especificações técnicas de features
ficam diretamente em `docs/`; código e manifests continuam sendo fontes
autoritativas para comportamento executável.

## Hierarquia de autoridade

Quando documentos discordarem, use esta ordem:

1. código e testes do branch realmente carregado;
2. `apps/web/build-info.json` para versão, build e canal;
3. descritores e ajuda consultados no runtime;
4. `README.md` da raiz para capacidades e entrada atual;
5. documentos vivos desta pasta;
6. documentos técnicos versionados por marco em `docs/`;
7. snapshots históricos marcados como obsoletos;
8. lembranças de conversa ou números copiados fora do repositório.

Contagem de testes, hash, branch ativo e número de build não devem ser
repetidos em documentos vivos quando podem ser consultados diretamente.

## Auditoria por documento

| Documento | Estado | Função atual | Resultado da auditoria |
| --- | --- | --- | --- |
| [`OVERVIEW.md`](OVERVIEW.md) | vivo | propósito, escopo e invariantes | inclui experimentos, ações, lotes e animação até 0028e |
| [`DECISIONS.md`](DECISIONS.md) | vivo | registro arquitetural durável | inclui laboratório declarativo, ações semânticas e overlay temporal |
| [`DISTRIBUTION.md`](DISTRIBUTION.md) | vivo | Pages, PWA, HTTP e arquivos | atualizado com escopo do worker, cache efetivo e fallback móvel |
| [`ROADMAP.md`](ROADMAP.md) | vivo | sequência de marcos | cronologia real 0022–0028e e prioridades posteriores |
| [`WORKFLOW.md`](WORKFLOW.md) | vivo | branches, patches, autoria, testes e integração | inclui patches canônicos, promoção e testes 0027–0028 |
| [`CHATGPT_PROJECT_INSTRUCTIONS.md`](CHATGPT_PROJECT_INSTRUCTIONS.md) | vivo | contrato para assistentes | inclui ações, experimentos, animação e escopos de grupo |
| [`STRATEGIC_ARCHITECTURE_REVIEW.md`](STRATEGIC_ARCHITECTURE_REVIEW.md) | vivo | auditoria crítica e gates tecnológicos | integra propostas de CRDT, QuickJS/WASM e gramáticas de forma com custos |
| [`DOCUMENTS_TO_WRITE.md`](DOCUMENTS_TO_WRITE.md) | vivo | backlog documental | criado nesta auditoria |
| [`CURRENT_STATE.md`](CURRENT_STATE.md) | obsoleto | snapshot do marco 0019g-c2 | cabeçalho de obsolescência; corpo preservado |
| [`MEMORY_SEED.md`](MEMORY_SEED.md) | obsoleto | semente curta do marco 0019g-c2 | cabeçalho de obsolescência; corpo preservado |
| [`SESSION_HANDOFF.md`](SESSION_HANDOFF.md) | obsoleto | handoff encerrado do marco 0019g-c2 | cabeçalho de obsolescência; corpo preservado |

## Documentos vivos

Documentos vivos devem ser atualizados quando uma mudança altera sua área.
Eles descrevem conceitos e processo, não snapshots de execução.

### Direção

- [`OVERVIEW.md`](OVERVIEW.md): define o que o SpatialSeed é, o que já existe e
  o que permanece fora do escopo atual.
- [`ROADMAP.md`](ROADMAP.md): organiza dependências e critérios de saída dos
  próximos marcos.
- [`DOCUMENTS_TO_WRITE.md`](DOCUMENTS_TO_WRITE.md): prioriza especificações e
  políticas ausentes.

### Arquitetura

- [`DECISIONS.md`](DECISIONS.md): registra decisões estáveis e suas
  consequências.
- [`STRATEGIC_ARCHITECTURE_REVIEW.md`](STRATEGIC_ARCHITECTURE_REVIEW.md):
  confronta recomendações externas com os contratos atuais, define provas de
  conceito e estima custos de adoção.
- [`DISTRIBUTION.md`](DISTRIBUTION.md): define publicação, instalação, cache,
  HTTP e transporte de arquivos.

### Operação e colaboração

- [`WORKFLOW.md`](WORKFLOW.md): processo canônico de branch, patch, teste,
  autoria, push e merge.
- [`CHATGPT_PROJECT_INSTRUCTIONS.md`](CHATGPT_PROJECT_INSTRUCTIONS.md): versão
  compacta do contrato para assistentes.
- [`../../AGENTS.md`](../../AGENTS.md): entrada operacional reconhecível por
  agentes de código.
- [`../../PROJECT_SEED.md`](../../PROJECT_SEED.md): semente curta para retomada.

## Snapshots históricos

`CURRENT_STATE.md`, `MEMORY_SEED.md` e `SESSION_HANDOFF.md` registram uma etapa
real do projeto, mas suas pendências foram resolvidas e seus números deixaram de
ser atuais. Eles foram mantidos para preservar a trajetória.

Não atualize o corpo desses arquivos. Se um novo snapshot for realmente
necessário, crie documento datado ou gere relatório automaticamente; não
recicle o nome histórico como se fosse fonte viva.

## Relação com outras fontes

### Porta de entrada

[`../../README.md`](../../README.md) apresenta produto, execução, capacidades,
console, arquitetura e limites para quem chega ao repositório.

[`../book/SpatialSeed_Livro_Manual_e_Atlas_Procedural_v0.6.pdf`](../book/SpatialSeed_Livro_Manual_e_Atlas_Procedural_v0.6.pdf)
integra manifesto, manual, atlas procedural, evidência e método de colaboração;
a fonte e o processo de compilação estão em [`../book/`](../book/).

### Especificações técnicas

Documentos como os seguintes descrevem contratos específicos:

- [`../SECURITY_MODEL.md`](../SECURITY_MODEL.md)
- [`../SPATIALSEED_FILE_FORMAT.md`](../SPATIALSEED_FILE_FORMAT.md)
- [`../LANGUAGE_REFERENCE.md`](../LANGUAGE_REFERENCE.md)
- [`../TEST_STRATEGY.md`](../TEST_STRATEGY.md)
- [`../PERFORMANCE_POLICY.md`](../PERFORMANCE_POLICY.md)
- [`../RELEASE_CHECKLIST.md`](../RELEASE_CHECKLIST.md)
- [`../SCRIPT_RUNTIME_0026A.md`](../SCRIPT_RUNTIME_0026A.md)
- [`../PWA_FOUNDATION_0025A.md`](../PWA_FOUNDATION_0025A.md)
- [`../FILE_INTEROP_0025B.md`](../FILE_INTEROP_0025B.md)
- [`../PROPERTY_SYSTEM_0022A.md`](../PROPERTY_SYSTEM_0022A.md)
- [`../GEOMETRY_PANEL_0024G.md`](../GEOMETRY_PANEL_0024G.md)
- [`../UI_CONFIGURATION_0024F.md`](../UI_CONFIGURATION_0024F.md)
- [`../EXPERIMENT_PLUGIN_0027A.md`](../EXPERIMENT_PLUGIN_0027A.md)
- [`../INTERACTION_SURFACE_0028C.md`](../INTERACTION_SURFACE_0028C.md)
- [`../ANIMATION_WORKSPACE_0028D.md`](../ANIMATION_WORKSPACE_0028D.md)

### Estado executável

- [`../../apps/web/build-info.json`](../../apps/web/build-info.json): build;
- `runtime test help`: suítes existentes;
- `help`, `help create` e `procedure help`: comandos e sintaxe;
- `runtime resources`: recursos efetivos;
- `git log` e `git status`: estado do repositório.

## Regras de manutenção

1. Documento vivo precisa de data de auditoria, mas não de hash transitório.
2. Snapshot histórico recebe aviso; seu corpo não é reescrito.
3. Decisão durável recebe ID em `DECISIONS.md`.
4. Marco concluído migra para a seção correspondente do roadmap.
5. Capacidade pública nova atualiza o README da raiz e a ajuda do runtime.
6. Nova fronteira exige especificação própria, não apenas parágrafo no roadmap.
7. Links locais devem ser validados antes do commit.
8. Não mantenha duas listas autoritativas da mesma capability.

## Próxima ação documental

O runtime temporal já possui contrato implementado e documentação no marco
0028. As lacunas prioritárias agora são persistência de clips/keyframes, modelo
de eventos/interatividade, especificação consolidada da hierarquia e geometria
2D/topológica. A lista revisada permanece em
[`DOCUMENTS_TO_WRITE.md`](DOCUMENTS_TO_WRITE.md).
