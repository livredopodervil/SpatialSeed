# Coordenação de viewers locais

> Contrato técnico implementado nos marcos `0029e`, `0029e1`, `0029e2` e
> `0029f`.

## Fronteira

Várias abas podem projetar a mesma identidade de sandbox. Cada aba possui
`ViewerState`, câmera, seleção, hover e painéis próprios. O documento lógico,
os comandos confirmados e o histórico pertencem ao sandbox compartilhado.

`LocalViewerCoordinator` usa `BroadcastChannel` apenas como transporte local.
Quando a Web Locks API está disponível, uma trava exclusiva escolhe a aba
autoritativa. O botão **Projetos / viewers** usa o diretório de sessões vivas e
sempre oferece ações explícitas: conectar ao projeto escolhido, criar um projeto
independente ou abrir um arquivo em nova aba.

Cada viewer anuncia periodicamente nome do projeto, identidade, papel, revisão
e contagens num canal de diretório separado. O diretório não persiste projetos:
uma despedida remove a entrada imediatamente e anúncios abandonados expiram.

Ao fechar a autoridade, as réplicas automáticas disputam a trava liberada. A
vencedora mantém o snapshot espelhado, torna-se autoridade e adota o diário de
recuperação vigente sem reler um checkpoint antigo sobre o estado vivo.

Um URL de entrada com `viewer=join` não disputa autoridade imediatamente. Ele
solicita o snapshot, aguarda a resposta da sessão escolhida e só participa da
sucessão se nenhuma autoridade viva responder. Assim, recuperação não aparece
enquanto a aba ainda está simplesmente entrando num projeto existente.

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

## Sessão temporal efêmera

`LocalAnimationCoordinator` reutiliza o papel já decidido para o viewer, mas
mantém um canal e um envelope distintos do documento. Ao iniciar, a aba resolve
a seleção em IDs concretos e envia somente:

- definição declarativa do programa, preset ou composição;
- `playbackId` e sequência autoritativos;
- revisão editorial observada;
- estado `playing`, `paused` ou `idle`;
- posição acumulada e época absoluta da última transição.

Cada aba recompila a mesma definição e avalia localmente o instante corrente.
Não há mensagens por quadro. Ao retornar do segundo plano, o viewer salta para
o tempo derivado da época comum sem executar os passos perdidos.

Início, pausa, retomada e parada exigem a sequência temporal observada. Uma
intenção obsoleta recebe `rejected-stale` e a sessão vigente. Qualquer comando
editorial encerra o overlay em todos os viewers antes de propagar o novo
snapshot.

## Projetos independentes, recuperação e arquivos

Somente a aba autoritativa grava a recuperação IndexedDB e pode abrir, criar ou
publicar outro projeto. Réplicas podem salvar uma cópia portátil do estado
espelhado. Abrir um arquivo, criar um projeto e confirmar uma proposta continuam
operações exclusivas da autoridade porque substituem a identidade ou a base
compartilhada.

**Novo projeto em nova aba** gera antecipadamente outra identidade e abre uma
autoridade independente. **Abrir arquivo em nova aba** usa um `launchId`
descartável e um `BroadcastChannel` próprio: a aba de destino anuncia que está
pronta, recebe o texto do arquivo, valida e abre o projeto, confirma a aceitação
e encerra o canal. O diretório recebe apenas metadados da sessão viva; nunca
recebe o conteúdo do arquivo.

## Superfícies

- botão **Projetos / viewers**;
- `viewers status`;
- `viewers sessions`;
- `viewers open`;
- `viewers open sandboxId`;
- `viewers sync`;
- query `viewer.instances.status`;
- query `viewer.sessions.status`;
- comando `viewer.sessions.discover`;
- comandos `viewer.instance.open` e `viewer.instance.sync`;
- comandos `viewer.project.new-window` e
  `viewer.project.open-window.prepare`;
- evento `viewer.instances.changed`;
- suíte `runtime test viewer-coordination`;
- evento `animation.shared.changed`;
- suíte `runtime test viewer-animation`.

## Roteiro manual

1. abra **Projetos / viewers**, conecte outro viewer ao projeto e confirme que
   recuperação não aparece;
2. mantenha as duas abas lado a lado ou alterne entre elas;
3. mova a câmera e selecione objetos diferentes em cada viewer;
4. crie ou transforme um objeto numa aba e confirme a atualização na outra;
5. execute `viewers status` nas duas abas;
6. faça duas edições rápidas na réplica e confirme que ambas chegam em ordem;
7. inicie uma animação numa aba e pause, retome e pare pela outra;
8. deixe uma aba em segundo plano, retorne e confirme o mesmo instante;
9. execute `runtime test viewer-coordination`, `runtime test viewer-animation`
   e `runtime test all`;
10. feche a aba autoritativa, confirme a promoção da réplica e abra outro viewer
    sem perder o projeto;
11. crie um projeto independente, confirme os dois destinos no seletor e abra
    um arquivo numa terceira sessão.

O teste de conflito obsoleto é automatizado porque depende de controlar a ordem
das mensagens. A validação visual confirma separadamente que câmera e seleção
não são sincronizadas.
