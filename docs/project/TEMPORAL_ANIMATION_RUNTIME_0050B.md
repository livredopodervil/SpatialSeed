# SpatialSeed 0050b — animação afim sobre o runtime temporal

**Estado:** implementação integrada para validação  
**Baseline:** `20260806-0050a1`  
**Build resultante:** `20260806-0050b`

## Objetivo

Restaurar o painel de animações e fazer toda animação visual passar pelo runtime
temporal dirigido por mudanças. Uma animação deixa de possuir um loop paralelo
próprio: ela registra operações temporais que avaliam programas da linguagem
afina sobre os objetos selecionados.

O catálogo de procedimentos pode produzir definições de animação. O
procedimento é executado uma vez no Worker e retorna uma descrição serializável;
a linguagem afim avalia as expressões dependentes de tempo em cada instante
necessário.

## Erro corrigido

O runtime anterior normalizava um quadro retornado como lista. Quando a lista
continha apenas uma unidade, a normalização a interpretava como uma lista de
mudanças e depois desembrulhava a única entrada. O renderer recebia um objeto em
vez de uma lista e interrompia a reprodução com:

```text
Quadro de animação deve ser uma lista.
```

O caminho legado agora preserva listas de quadros. O aplicativo, porém, passa a
instanciar `TemporalAnimationRuntime` em vez do loop legado.

## Fluxo atual

```text
painel / console / coordenador local
  → AnimationCommandService
  → programa afim, preset, composição ou procedimento
  → TemporalAnimationRuntime
  → operação registrada em TemporalRuntime
  → avaliação no tempo local do domínio
  → evento interno animation.overlay.frame
  → lote completo aplicado ao renderer
  → render somente quando o quadro visual mudou
```

Objetos estáticos não entram no scheduler. Uma expressão constante pode chegar
a ponto fixo. Uma animação dependente de `t` ou `dt` mantém demanda de quadros
somente enquanto está em execução.

## Programas afins

Um programa é uma lista de operações compatíveis com a linguagem afim:

```json
[
  {
    "type": "rotate",
    "value": [0, "45 * t", 0]
  }
]
```

Variáveis temporais:

- `t`: tempo local, em segundos;
- `dt`: diferença desde a avaliação anterior;
- `time` e `deltaTime`: aliases reconhecidos na detecção de dependência.

Variáveis indexadas:

- `i`: índice baseado em 1;
- `u`: coordenada normalizada do item;
- `count`: número de unidades.

Exemplo de onda entre objetos:

```json
[
  {
    "type": "move",
    "value": [
      0,
      "1.5 * (sin(tau * 0.5 * t + 0.4 * (i - 1)) - sin(0.4 * (i - 1)))",
      0
    ]
  }
]
```

## Domínios temporais

O painel permite escolher o domínio temporal. Cada faixa de uma composição pode
usar outro domínio. O runtime cria um domínio privado por faixa, subordinado ao
domínio escolhido, para permitir pausa, retomada e seek sem alterar o relógio
compartilhado.

Duas faixas ligadas a domínios com taxas `1` e `0.25` recebem tempos locais
diferentes no mesmo instante global.

## Procedimentos de animação

Um procedimento de animação não deve emitir comandos espaciais durante cada
frame. Ele retorna uma definição pura, que pode ser:

1. lista de operações;
2. objeto com `operations`;
3. referência a preset;
4. composição com `tracks`.

### Retorno de programa

```javascript
({speed=45,axis="y",timeDomainId="world"}={}) => ({
  id: "animation.catalog-spin",
  timeDomainId,
  operations: [{
    type: "rotate",
    value: axis === "x"
      ? [`${speed} * t`, 0, 0]
      : axis === "z"
        ? [0, 0, `${speed} * t`]
        : [0, `${speed} * t`, 0]
  }]
})
```

### Retorno de preset

```javascript
({speed=30,timeDomainId="world"}={}) => ({
  presetId: "spin",
  parameters: {axis: "y", speed},
  timeDomainId
})
```

### Retorno de composição

```javascript
({slowDomain="slow"}={}) => ({
  id: "animation.catalog-composition",
  tracks: [
    {
      id: "spin",
      presetId: "spin",
      parameters: {axis: "y", speed: 45},
      timeDomainId: "world"
    },
    {
      id: "float",
      presetId: "float",
      parameters: {axis: "y", amplitude: 1, frequency: 0.5},
      timeDomainId: slowDomain
    }
  ]
})
```

O painel envia automaticamente `targetIds`, `targetMode` e `timeDomainId` como
parte do argumento do procedimento. O procedimento pode preservar esses valores
ou substituí-los explicitamente.

## Painel

O painel atual preserva:

- presets Spin, Orbit, Float, Pulse, Wave e Rainbow;
- parâmetros de cada preset;
- seleção ou objetos como modo de alvo;
- composição de múltiplas faixas;
- pausa, retomada e parada.

Acrescenta:

- domínio temporal por execução/faixa;
- procedimentos do catálogo;
- parâmetros JSON do procedimento;
- status das operações temporais;
- atualização por eventos em vez de polling de 250 ms.

## Console

```text
animate spin speed=45 axis=y time=world
animate move "sin(t)" 0 0 time=world
animate procedures
animate procedure animation.spin {"speed":60} time=world
animate pause
animate resume
animate stop
```

As formas exatas aceitas podem ser consultadas com `animate help`.

## Diagnóstico esperado

Durante uma animação contínua:

```text
runtime query time.status
```

Deve mostrar pelo menos uma operação com fase `animation`.

```text
runtime query time.execution
```

Deve mostrar demanda de frame ativa enquanto a expressão visual estiver
mudando.

Após `animate stop`, as operações privadas são removidas e o renderer volta ao
repouso.

## Invariantes

1. Quadro de uma única unidade permanece uma lista.
2. O painel não mantém `setInterval`.
3. O runtime de animação não possui `requestAnimationFrame` próprio.
4. Todas as faixas são operações do `TemporalRuntime`.
5. Faixas da mesma fase leem o mesmo instante global e seus próprios tempos
   locais.
6. Quadros visualmente iguais não são reenviados ao renderer.
7. Parar restaura o overlay capturado e remove operações e domínios privados.
8. Erros temporais interrompem a animação e são expostos no status.
9. Procedimentos são resolvidos uma vez no Worker e não executados por frame.
10. Uma cena sem animação permanece sem operações temporais e sem renderização
    contínua.

## Limitações desta etapa

- domínios temporais ainda não são persistidos no documento do projeto;
- o seletor do painel lista os domínios existentes no momento em que o painel é
  construído;
- procedimentos precisam retornar descritores serializáveis;
- o painel não edita visualmente a AST afim;
- a equivalência visual precisa ser validada no Android e em desktop;
- o teste automático JavaScript é executado fora do Termux sem Node; no aparelho,
  a validação é feita pelas auditorias Python e pelo navegador.
