# Plugin declarativo de experimentos — 0027a

## Estado

Contrato inicial para um plugin interno. Este marco não habilita instalação de
JavaScript externo nem declara pronta uma API pública de plugins.

## Objetivo

Um experimento reúne, numa definição textual e serializável:

- identidade, título, descrição e tags;
- parâmetros que o host transforma em controles;
- uma função JavaScript textual executada no Worker/SES;
- um plano espacial produzido antes de qualquer commit.

A definição é a fonte comum do painel e do console. Nenhuma interface ganha uma
implementação particular da geometria.

## Fronteiras

O plugin pode registrar definições no `ExperimentRegistry`. Ele não recebe DOM,
renderer, região ou sandbox. O host possui o renderer declarativo da interface,
o controlador de programas e o comando de commit.

O código do experimento recebe apenas as capacidades já permitidas ao runtime
de programas, inicialmente matemática, aleatoriedade determinística, `print`,
snapshot clonado e `spatial.create`.

## Definição versão 1

```js
{
  apiVersion: "spatial-seed-experiment-v1",
  id: "math.helix",
  title: "Hélice",
  description: "Série paramétrica em torno do eixo vertical.",
  tags: ["matemática", "3d"],
  parameters: [
    {
      id: "radius",
      label: "Raio",
      type: "number",
      control: "slider",
      min: 0.5,
      max: 8,
      step: 0.1,
      default: 3
    }
  ],
  program: {
    mode: "expression",
    source: "({ radius }) => { /* spatial.create(...) */ }"
  }
}
```

Tipos iniciais de parâmetro:

- `number`: campo numérico ou slider;
- `integer`: campo numérico ou slider com valor inteiro;
- `color`: cor hexadecimal;
- `select`: opção pertencente a uma lista fechada;
- `boolean`: toggle.

O registro rejeita identificadores repetidos, controles incompatíveis, limites
inválidos, defaults fora da faixa, parâmetros desconhecidos e valores não
serializáveis.

## Execução

`ExperimentService.plan(id, parameters)`:

1. encontra a definição;
2. normaliza todos os parâmetros;
3. constrói a invocação da função textual;
4. executa pelo mesmo `ProgramSessionController` usado pelo console;
5. devolve experimento, parâmetros resolvidos e plano;
6. não altera a cena.

Somente `program.plan.commit` pode aplicar o plano. Se o sandbox mudar entre a
geração e o commit, a validação de revisão continua rejeitando o plano obsoleto.

## Interface declarativa

O host conhece um conjunto fechado de widgets. Um experimento escolhe widgets e
restrições; não fornece HTML, CSS, handlers ou nomes arbitrários de comandos.
Alterar um controle muda somente o estado local do painel. **Gerar plano** chama
o serviço público; **Aplicar** usa o comando de commit; **Descartar** remove o
plano local sem efeito editorial.

## Superfície textual prevista

```text
experiment list
experiment show math.helix
experiment run math.helix {"radius":3}
plan status
plan commit
```

Console e painel devem produzir o mesmo plano para a mesma definição, parâmetros,
seed, snapshot e revisão.

## Não objetivos do 0027a

- animação ou variável `t`;
- eventos de teclado, toque ou colisão;
- UI arbitrária;
- instalação dinâmica de plugins;
- rede ou colaboração;
- novos comandos espaciais além das capabilities existentes;
- persistência do catálogo junto ao projeto `.spatialseed`.

## Critério de saída

Um plugin interno registra ao menos três experimentos. O painel é construído
somente por descritores. Um experimento pode ser listado e executado pelo
console, gerar plano sem tocar a cena, ser aplicado explicitamente e falhar sem
estado parcial. A suíte cobre validação, capabilities e equivalência das duas
superfícies.
