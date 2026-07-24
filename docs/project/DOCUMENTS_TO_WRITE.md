# Backlog documental do SpatialSeed

> Backlog criado em 16 de julho e revisado em 24 de julho de 2026 até o marco
> `0028e`. Um item existe quando uma implementação ou decisão possui
> complexidade suficiente para exigir fonte canônica própria. A lista não
> implica escrever tudo antes da próxima linha de código.

## Critério de prioridade

- **P0 — bloqueador:** reduz risco imediato de segurança, perda de dados,
  incompatibilidade ou publicação incorreta.
- **P1 — necessário no próximo marco:** deve existir antes ou junto da feature
  correspondente.
- **P2 — consolidação:** transforma conhecimento disperso em contrato extensível.
- **P3 — produto e governança:** necessário antes de colaboração ou exploração
  comercial mais ampla.

## P0 — Documentos bloqueadores concluídos

> Segunda revisão em 16 de julho de 2026: os seis itens continuavam corretos e
> foram escritos por auditoria direta do código e confronto com fontes
> primárias. Permanecem como documentos vivos; “concluído” significa que agora
> existe contrato canônico, não que todas as lacunas nele registradas já foram
> implementadas.

### 1. Modelo de segurança do runtime de scripts

**Status:** concluído em [`../SECURITY_MODEL.md`](../SECURITY_MODEL.md).

**Por que falta:** o runtime já executa JavaScript do usuário em Worker/SES, mas
suas fronteiras e hipóteses de ameaça estão distribuídas no código e no documento
do marco 0026.

**Conteúdo mínimo:**

- ativos protegidos e adversários considerados;
- capabilities oferecidas e explicitamente ausentes;
- isolamento SES, Worker, timeout, orçamento e `structuredClone`;
- alcance e limites de `snapshot`, `session`, `print` e `spatial`;
- término, falha e descarte de planos;
- rede, DOM, arquivos, importação e código assíncrono;
- CSP, origem, service worker e dependências vendorizadas;
- o que não é garantia de segurança;
- testes negativos e processo de reporte de vulnerabilidade.

### 2. Especificação do formato `.spatialseed`

**Status:** concluído em
[`../SPATIALSEED_FILE_FORMAT.md`](../SPATIALSEED_FILE_FORMAT.md).

**Por que falta:** salvar/abrir, assets, aparências e grupos já estão em uso, mas
não existe uma especificação canônica independente da implementação.

**Conteúdo mínimo:**

- MIME, extensão, encoding e envelope;
- versões de schema aceitas;
- objetos, grupos, parentesco e transforms locais;
- geometrias e descritores;
- appearances, texturas e content IDs;
- invariantes de referências;
- limites e erros de validação;
- roundtrip, compatibilidade e exemplos mínimos;
- regras para migração futura e compactação.

### 3. Referência da linguagem e do console

**Status:** concluído em
[`../LANGUAGE_REFERENCE.md`](../LANGUAGE_REFERENCE.md).

**Por que falta:** ajuda existe no runtime e o marco 0026 narra a evolução, mas
usuários precisam de uma referência estável, completa e orientada por exemplos.

**Conteúdo mínimo:**

- diferença entre comandos editoriais, linguagem afim e JavaScript SES;
- `calc`, `program`, `session`, `plan` e `procedure`;
- constantes, funções matemáticas e aleatoriedade;
- `i`, `u`, `count`, ângulos e precedência na linguagem afim;
- API completa de `spatial` e geometrias permitidas;
- tipos que atravessam `structuredClone`;
- limites de fonte, tempo, saída e comandos;
- tratamento de erros;
- formato de catálogo;
- receitas testadas.

### 4. Checklist de release e publicação

**Status:** concluído em
[`../RELEASE_CHECKLIST.md`](../RELEASE_CHECKLIST.md).

**Por que falta:** publicação no `main`, GitHub Pages, PWA e cache possuem vários
passos cuja omissão já causou builds antigos ou capabilities ausentes.

**Conteúdo mínimo:**

- branch e commits incluídos;
- autoria e trailers;
- atualização de `build-info.json`;
- queries de cache e precache;
- `.nojekyll` e caminhos publicados;
- testes automáticos e visuais;
- matriz Android/desktop;
- instalação limpa e atualização de PWA existente;
- salvar/abrir e catálogos;
- benchmark quando aplicável;
- verificação remota e rollback.

### 5. Estratégia de testes

**Status:** concluído em
[`../TEST_STRATEGY.md`](../TEST_STRATEGY.md).

**Por que falta:** existem muitas suítes e roteiros por marco, mas falta um mapa
que relacione invariantes, níveis de teste e responsabilidades.

**Conteúdo mínimo:**

- testes unitários, contratuais, integração, visual e desempenho;
- catálogo de suítes gerado ou consultado do runtime;
- fixtures e isolamento;
- critérios para regressão visual virar teste automático;
- cenários de grupos, textura, arquivos, PWA e scripts;
- dispositivos e navegadores suportados;
- política para testes lentos e flakiness;
- evidência mínima para merge.

### 6. Política de benchmarks e regressão

**Status:** concluído em
[`../PERFORMANCE_POLICY.md`](../PERFORMANCE_POLICY.md).

**Por que falta:** há CSVs e medições, mas ainda não há protocolo canônico para
comparar builds e detectar gargalos.

**Conteúdo mínimo:**

- hardware, SO, navegador e estado térmico;
- build, commit, cena, amostras e warm-up;
- métricas e percentis;
- formato do histórico;
- baseline por classe de aparelho;
- limiares de alerta, não necessariamente de falha;
- comparação de propriedades, grupos, texturas, scripts e arquivos;
- separação entre benchmark e duração de suíte.

## Resultado da revisão P0

Os contratos novos confirmaram quatro lacunas de implementação que devem entrar
no planejamento, mas não exigem mais documentos P0:

1. `ProjectValidator` ainda precisa validar referências de assets, transforms,
   hierarquia e cotas antes de trocar o estado ativo;
2. o runtime precisa de testes negativos explícitos para powers ausentes no SES
   e de política de dependências vendorizadas;
3. o projeto precisa de E2E em navegador real e CI, pois os testes atuais de
   plataforma usam fakes;
4. benchmarks precisam de histórico persistente, metadados automáticos, warm-up
   e cenários de schema 2, hierarquia e scripts.

Esses itens pertencem, respectivamente, aos futuros trabalhos de validação,
segurança/dependências, infraestrutura de testes e instrumentação. As regras e
critérios já estão nos seis documentos P0.

## P1 — Necessários para os próximos marcos

### 7. Especificação do runtime de animação

**Status:** contrato efêmero implementado e documentado em
[`../ANIMATION_WORKSPACE_0028D.md`](../ANIMATION_WORKSPACE_0028D.md) e
[`../LANGUAGE_REFERENCE.md`](../LANGUAGE_REFERENCE.md).

**Lacuna restante:** criar `docs/ANIMATION_DOCUMENT_MODEL.md` antes de persistir
clips ou keyframes. O documento deve definir identidade, canais, composição,
serialização, vínculo de alvo, migração, conflito com edição manual e relação
entre preview efêmero e estado publicável.

### 8. Modelo de eventos e interatividade

**Caminho sugerido:** `docs/EVENT_MODEL.md`

Deve definir nomes, payloads, propagação, ordem, identidade do alvo, picking,
eventos sintéticos, serialização, backpressure e quais eventos chegam ao SES.

### 9. Especificação de geometria 2D e curvas

**Caminho sugerido:** `docs/GEOMETRY_2D_AND_CURVES.md`

Deve fixar ponto, segmento, polyline, Bézier quadrática/cúbica, orientação,
referencial, parametrização, amostragem, tolerância, bounds, picking e
serialização antes de o painel criar casos especiais.

### 10. Modelo de edição de mesh

**Caminho sugerido:** `docs/MESH_EDITING_MODEL.md`

Deve existir antes do marco 0029: identidade de subelementos, topologia,
orientação, copy-on-write, seleção, comandos, degenerações, undo e relação com
geometrias paramétricas.

### 11. Especificação canônica de hierarquia

**Caminho sugerido:** `docs/HIERARCHY_SPEC.md`

**Por que ainda falta:** `GROUP_MODEL_DRAFT.md` descreve uma arquitetura anterior,
enquanto a implementação 0023 avançou sem um documento consolidado.

Deve registrar schema, invariantes, matrizes local/mundial, âncora, pivô,
reparenting, ciclos, seleção, duplicação, exclusão, desagrupamento, serialização
e custo esperado.

### 12. Guia para providers geométricos

**Caminho sugerido:** `docs/GEOMETRY_PROVIDER_GUIDE.md`

Deve explicar descritores, normalize/key/create, topologia aberta/fechada,
defaults, unidades, bounds, materiais, instancing, painel automático, console e
testes exigidos.

### 13. Guia para providers de propriedades

**Caminho sugerido:** `docs/PROPERTY_PROVIDER_GUIDE.md`

Deve explicar tipos, codecs, cardinalidade, valores mistos, set/unset, edição em
lote, atomicidade, dependências, UI gerada, console e testes.

### 13A. Workspaces e customização interna da interface

**Caminho sugerido:** `docs/UI_WORKSPACE_MODEL.md`

Deve consolidar as camadas padrão, plugin, projeto, usuário e sessão; IDs de
ações; atalhos e conflitos; disposição de barra e painéis; importação e
exportação; preview, aplicar e reverter; e limites que impedem configuração
declarativa de se tornar JavaScript arbitrário.

## P2 — Consolidação arquitetural

### 14. Política de versionamento e migrações

**Caminho sugerido:** `docs/VERSIONING_AND_MIGRATIONS.md`

Deve separar versão de produto, build, API, protocolo, schema, catálogo e cache;
definir compatibilidade, depreciação e migração.

### 15. Modelo de erros e recuperação

**Caminho sugerido:** `docs/ERROR_MODEL.md`

Deve classificar erro fatal, operacional, de validação, conflito de versão,
capability negada, cancelamento e falha de plataforma; também definir o que pode
ser mostrado ao usuário sem stack trace bruto.

### 16. Persistência local e recuperação de sessão

**Caminho sugerido:** `docs/LOCAL_RECOVERY_SPEC.md`

Deve definir IndexedDB, OPFS, debounce, atomicidade, comandos confirmados,
quotas, limpeza, migração, privacidade e UX de restauração.

### 17. Matriz de compatibilidade

**Caminho sugerido:** `docs/COMPATIBILITY_MATRIX.md`

Deve registrar Android/Chrome, PWA standalone, desktop Chromium, Firefox/Safari
quando testados, WebGL, File System Access, service worker, fullscreen, toque e
limitações conhecidas.

### 18. Acessibilidade e desenho para toque

**Caminho sugerido:** `docs/ACCESSIBILITY_AND_TOUCH.md`

Deve cobrir alvos de toque, teclado, foco, rótulos, contraste, densidade da
toolbar, redimensionamento, leitores de tela, ajuda do modo cena e preferências.

### 19. Referência da API pública do runtime

**Caminho sugerido:** `docs/RUNTIME_PUBLIC_API.md`

Deve consolidar comandos, queries, eventos, capabilities, versões, envelopes,
exemplos e regras para consumidores sem expor registros internos.

### 20. Guia de plugins

**Caminho sugerido:** `docs/PLUGIN_AUTHORING.md`

Deve definir manifesto, ativação, capabilities, registros permitidos, ciclo de
vida, isolamento, compatibilidade e testes. O pacote `plugin-api` existe, mas o
contrato de autoria ainda não está pronto para terceiros.

### 21. Interoperabilidade de formatos 3D

**Caminho sugerido:** `docs/FORMAT_INTEROP.md`

Deve decidir prioridade entre glTF, STL, OBJ e Collada, conversão de unidades e
eixos, materiais, texturas, hierarquia, perda aceitável, roundtrip e segurança
de arquivos importados.

### 22. Política de dependências e proveniência

**Caminho sugerido:** `docs/DEPENDENCY_POLICY.md`

Deve listar versões vendorizadas, licenças, atualização, integridade, origem,
critérios para nova dependência e resposta a vulnerabilidades.

## P3 — Produto, colaboração e governança

### 23. Guia de contribuição

**Caminho sugerido:** `CONTRIBUTING.md`

Deve adaptar `docs/project/WORKFLOW.md` para colaboradores externos: ambiente,
branches, testes, estilo, autoria, issue/PR e critérios de aceite.

### 24. Decisão de licença e arquivo LICENSE

**Caminhos sugeridos:** `docs/project/LICENSING_DECISION.md` e `LICENSE`

O repositório público ainda não concede licença ampla. É necessário decidir o
que permanece proprietário, o que pode ser usado, como proteger autoria e qual
modelo favorece colaboração e monetização.

### 25. Governança e autoria

**Caminho sugerido:** `docs/project/GOVERNANCE.md`

Deve definir mantenedor, autoridade sobre `main`, uso de assistência por IA,
créditos, decisões arquiteturais, releases, contribuições e resolução de
conflitos.

### 26. Estratégia de produto e monetização

**Caminho sugerido:** `docs/project/PRODUCT_STRATEGY.md`

Deve separar núcleo, produto hospedado, catálogos, educação, consultoria,
plugins, colaboração e serviços; definir públicos, problema pago, custos,
métricas, riscos e o que não deve ser fechado prematuramente.

### 27. Protocolo de colaboração regional

**Caminho sugerido:** `docs/DISTRIBUTED_REGION_PROTOCOL.md`

Deve preceder qualquer servidor multiusuário: snapshots, deltas, versões,
identidade, autoridade, propostas, conflitos, permissões, offline e reconexão.

### 28. Política de privacidade e telemetria

**Caminho sugerido:** `docs/project/PRIVACY_AND_TELEMETRY.md`

Será necessário antes de contar instalações ou coletar métricas. Deve exigir
consentimento, minimização, finalidade, retenção, transparência e alternativa
sem telemetria.

## Documentos que não devem ser recriados manualmente

Algumas informações devem ser geradas ou consultadas, não copiadas para mais um
Markdown:

- build atual: `apps/web/build-info.json`;
- lista de comandos: ajuda do console;
- lista de geometrias e propriedades: registros do runtime;
- lista e contagem de testes: `runtime test help` e `runtime test all`;
- hash e branch: Git;
- arquivos do cache: gerador de precache;
- recursos em uso: `runtime resources`.

Criar documentos estáticos para essas listas produziria novamente a divergência
que esta auditoria procura remover.

## Ordem recomendada de escrita

Os seis documentos P0 foram concluídos. Após o marco 0028e, a ordem recomendada
é:

1. `UI_WORKSPACE_MODEL.md` antes do customizador interno;
2. `ANIMATION_DOCUMENT_MODEL.md` antes de clips/keyframes persistentes;
3. `EVENT_MODEL.md` antes de eventos chegarem a scripts;
4. `HIERARCHY_SPEC.md`, incluindo origens individuais e escopos de grupo;
5. `GEOMETRY_2D_AND_CURVES.md`;
6. guias de providers geométricos e de propriedades;
7. `MESH_EDITING_MODEL.md`;
8. `VERSIONING_AND_MIGRATIONS.md` antes de um schema 3;
9. `LOCAL_RECOVERY_SPEC.md` antes de persistência automática da cena.
