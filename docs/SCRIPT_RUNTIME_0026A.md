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
