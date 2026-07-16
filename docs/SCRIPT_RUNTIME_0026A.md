# Script runtime 0026a

## Objetivo

Introduzir a primeira fronteira para programas descartáveis sem dar ao
interpretador acesso ao `SpatialSeedRuntime`, ao sandbox editorial ou ao
renderer.

Nesta etapa não há execução de JavaScript fornecido pelo usuário. O núcleo
apenas representa uma execução que acumula intenções de comandos e produz um
plano serializável quando concluída.

## Contrato

`DisposableProgramRun` recebe explicitamente:

- identificador da execução;
- versão-base do mundo;
- semente determinística;
- lista de comandos permitidos;
- orçamento máximo de comandos.

Durante a execução é possível criar handles locais e emitir intenções. Nenhuma
das duas operações conhece ou chama o runtime principal.

Uma execução pode terminar de quatro formas:

- `complete`: sela e devolve um plano imutável;
- `cancel`: descarta todas as intenções;
- `terminate`: descarta todas as intenções, como ocorrerá ao encerrar o Worker;
- `fail`: registra a falha e descarta todas as intenções.

Somente uma futura camada de validação e commit poderá entregar um plano ao
runtime principal. Assim, erro, cancelamento ou término do executor não alteram
a cena por construção, e não apenas por convenção.

## Decisões preservadas

- A linguagem permanecerá acima da API pública do runtime.
- O renderer não dependerá da linguagem.
- Comandos de programa serão autorizados por capacidade.
- Argumentos e resultados deverão atravessar `structuredClone`.
- O orçamento será aplicado antes de qualquer commit.
- Handles planejados são determinísticos para o mesmo `runId` e a mesma ordem.

## Próxima etapa

`ProgramRunController` implementa a primeira metade dessa etapa. Ele cria um
Worker por execução, mantém um token privado, impõe timeout, encerra o Worker em
qualquer estado terminal e rejeita mensagens com protocolo, execução ou
versão-base incompatíveis.

Cancelar invalida o token antes que qualquer resposta tardia possa ser aceita.
Um plano concluído permanece fora do runtime principal até ser explicitamente
consumido por `takePlan`; ele também pode ser descartado sem efeito.

A próxima etapa criará o Worker concreto. Inicialmente ele avaliará apenas
cálculos JavaScript sem acesso à cena e usará `DisposableProgramRun` para
produzir o envelope aceito pelo controlador.

## Executor 0026c

`ProgramWorker` implementa o primeiro executor concreto. Ele roda em um Worker
modular e cria um `Compartment` SES para cada programa. Somente a biblioteca
matemática explícita, o gerador pseudoaleatório com semente, `print` limitado e
um snapshot clonado são fornecidos ao código.

Não são fornecidos `spatial`, runtime, renderer, DOM, rede ou sistema de
arquivos. O `Math.random` do compartimento seguro lança erro; programas devem
usar `random`, `randomInt` e `randomSeed`, que são reproduzíveis pela semente do
plano.

Dois modos são aceitos:

- `expression`: calcula uma expressão e devolve seu valor;
- `program`: executa um corpo JavaScript síncrono, com funções, objetos e
  estruturas de controle, e devolve o valor de `return`.

Resultados e snapshots precisam atravessar `structuredClone`. Funções e outras
referências vivas podem existir dentro do programa, mas não atravessam a
fronteira. Programas assíncronos e comandos de cena permanecem desabilitados.

## Sessão persistente 0026d

`ProgramSessionKernel` mantém um único namespace explícito chamado `session`
dentro de um Worker dedicado. Valores, objetos e funções atribuídos a esse
namespace permanecem disponíveis nas avaliações seguintes:

```js
session.radius = 12
session.area = radius => pi * radius ** 2
session.area(session.radius)
```

Definições de função usam o modo `program`. Sem `return`, o programa devolve
`undefined`, enquanto a função permanece privada no Worker e disponível na
sessão. Funções não podem ser o próprio valor de retorno porque não atravessam
`structuredClone`.

O namespace explícito evita reescrever JavaScript e torna claro o que pertence
à sessão. Declarações temporárias continuam locais ao programa. O Worker de
sessão ainda não é ligado ao console nesta etapa e continua sem qualquer
capacidade de cena.

Uma falha invalida a sessão inteira. O controlador da próxima etapa encerrará
o Worker nesse caso, assim como em cancelamento ou timeout; portanto nenhuma
execução parcialmente concluída será reutilizada. Reiniciar a sessão descarta
apenas seus cálculos privados e não afeta o mundo editorial.

## Console matemático 0026e

O console passa a controlar o Worker persistente pelas seguintes superfícies:

```text
calc sqrt(3 ** 2 + 4 ** 2)
calc session.radius = 12
program session.area = r => pi * r ** 2
calc session.area(session.radius)
session status
session reset
session cancel
```

`calc` avalia uma expressão. `program` preserva todo o texto após o prefixo,
inclusive quebras de linha e pontos e vírgulas, e aceita estruturas de controle
e `return`. `session status` mostra geração, revisão e nomes persistidos.

O controlador mantém um Worker saudável entre avaliações. Timeout,
cancelamento, mensagem incompatível ou erro de programa encerram o Worker e
descartam a sessão privada. Sem uma capability explicitamente configurada, o
controlador rejeita qualquer plano que contenha comandos.

## Planejamento espacial 0026f

A capability `spatial` passa a existir somente quando o controlador autoriza
explicitamente `object.create.geometry` e fornece a lista de famílias
registradas. O programa pode produzir intenções como:

```js
const tower = spatial.create("box", {
  size: [2, 8, 2],
  position: [0, 4, 0],
  color: "#4488ff"
})
return tower
```

`spatial.create` devolve um handle determinístico e insere uma intenção no
plano. O handle identifica um objeto ainda inexistente; nesta etapa ele não é
convertido em ID da cena.

Parâmetros próprios da geometria podem ser escritos diretamente nas opções ou
dentro de `geometry`. `name`, `position`, `rotation`, `placement` e `color` são
separados como argumentos de criação. Geometrias ausentes das capabilities,
valores não serializáveis e planos acima do orçamento falham fechados.

O console mostra `plan.commandCount` e `plan.commands`, mas nenhum comando é
executado. A validação contra o registro real e o commit atômico pertencem à
etapa 0026g.
