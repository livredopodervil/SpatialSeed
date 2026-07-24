# Coordenação de viewers locais

> Contrato técnico implementado no marco `0029e`.

## Fronteira

Várias abas podem projetar a mesma identidade de sandbox. Cada aba possui
`ViewerState`, câmera, seleção, hover e painéis próprios. O documento lógico,
os comandos confirmados e o histórico pertencem ao sandbox compartilhado.

`LocalViewerCoordinator` usa `BroadcastChannel` apenas como transporte local.
Quando a Web Locks API está disponível, uma trava exclusiva escolhe a aba
autoritativa. O botão **Novo viewer** abre uma réplica explícita com o mesmo
`sandboxId`.

## Protocolo

A autoridade publica snapshots no mesmo formato versionado usado pela
recuperação: checkpoint limpo, assets, sequência vigente de comandos,
versão-base e revisão. Réplicas restauram esse conjunto atomicamente sem
restaurar estado de editor ou renderer.

Uma edição feita numa réplica produz uma intenção com:

- identidade única da solicitação;
- operação `dispatch`, `undo` ou `redo`;
- revisão compartilhada observada;
- comando canônico e assets necessários, quando aplicável.

A autoridade aceita somente quando a revisão observada é igual à revisão
vigente. Intenções consecutivas de uma réplica ficam em fila e a próxima só é
enviada após a resposta da anterior.

## Conflito

Se outra edição avançou a revisão, a intenção é rejeitada como
`rejected-stale`. A resposta inclui o snapshot autoritativo; a réplica converge
para ele, remove seleções de objetos que deixaram de existir e informa que a
ação precisa ser repetida. Não há merge silencioso nem reexecução automática de
uma intenção cujo contexto mudou.

Este protocolo é local e deliberadamente menor que colaboração distribuída. Ele
não define identidade de usuário, autorização remota, causalidade entre
dispositivos, CRDT ou publicação regional.

## Recuperação e arquivos

Somente a aba autoritativa grava a recuperação IndexedDB e pode abrir, criar ou
publicar outro projeto. Réplicas podem salvar uma cópia portátil do estado
espelhado. Abrir um arquivo, criar um projeto e confirmar uma proposta continuam
operações exclusivas da autoridade porque substituem a identidade ou a base
compartilhada.

## Superfícies

- botão **Novo viewer**;
- `viewers status`;
- `viewers open`;
- `viewers sync`;
- query `viewer.instances.status`;
- comandos `viewer.instance.open` e `viewer.instance.sync`;
- evento `viewer.instances.changed`;
- suíte `runtime test viewer-coordination`.

## Roteiro manual

1. abra **Painéis → Novo viewer**;
2. mantenha as duas abas lado a lado ou alterne entre elas;
3. mova a câmera e selecione objetos diferentes em cada viewer;
4. crie ou transforme um objeto numa aba e confirme a atualização na outra;
5. execute `viewers status` nas duas abas;
6. faça duas edições rápidas na réplica e confirme que ambas chegam em ordem;
7. execute `runtime test viewer-coordination` e `runtime test all`.

O teste de conflito obsoleto é automatizado porque depende de controlar a ordem
das mensagens. A validação visual confirma separadamente que câmera e seleção
não são sincronizadas.
