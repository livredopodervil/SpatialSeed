# SpatialSeed 0050c — overlays temporais independentes e previews sob demanda

**Build:** `20260806-0050c`  
**Base:** `20260806-0050b`  
**Estado:** implementação experimental integrada

## Objetivo

A animação deixa de ser uma única sobreposição global e passa a ser uma coleção
de instâncias independentes. Cada instância possui identidade, alvos, domínio
temporal, operações, estado e overlay próprios. A mesma entidade pode receber
mais de uma camada simultaneamente; os deltas são compostos pelo renderer em
ordem estável.

A alteração também restaura previews que deixaram de aparecer quando o renderer
passou a funcionar sob demanda. Controladores que modificam diretamente objetos
Three.js agora invalidam explicitamente um quadro visual.

## Modelo

```text
TemporalAnimationRuntime
├── AnimationInstance A
│   ├── overlay A
│   ├── objetos [a]
│   ├── domínio world
│   └── operação temporal A
├── AnimationInstance B
│   ├── overlay B
│   ├── objetos [b]
│   ├── domínio slow
│   └── operação temporal B
└── AnimationInstance C
    ├── overlay C
    ├── objetos [a]
    └── operação temporal C
```

A matriz efetiva de um objeto é calculada como:

```text
Mefetiva = ΔMn · ... · ΔM2 · ΔM1 · Mbase
```

`Mbase` vem do documento vigente. Cada `ΔMi` pertence a uma instância de
animação. Remover uma camada recompõe o objeto usando somente as camadas
restantes.

## Propriedades da implementação

- iniciar uma animação em outro objeto não para as existentes;
- um mesmo objeto pode receber, por exemplo, giro e pulso simultaneamente;
- pausar ou parar uma instância não afeta as demais;
- alterar um objeto não relacionado não interrompe animações;
- alterar ou excluir um objeto animado interrompe somente as instâncias que o
  utilizam;
- substituições completas do estado ainda encerram as instâncias afetadas;
- overlays são resolvidos por `objectId`, não por uma referência Three.js
  mantida como autoridade;
- batch culling usa contagem de referências para overlays concorrentes;
- matrizes e cores iguais às já aplicadas não são escritas novamente;
- o documento, o undo e a revisão do mundo não são alterados em cada frame;
- cada overlay participa da mesma transformação efetiva usada pelo renderer.

## Comandos

Os comandos compartilhados continuam controlando a animação mais recente:

```text
animation.pause
animation.resume
animation.stop
```

Instâncias específicas podem ser controladas por:

```text
animation.instance.pause {"instanceId":"..."}
animation.instance.resume {"instanceId":"..."}
animation.instance.stop {"instanceId":"..."}
animation.stop-all
```

`animation.status` passa a expor:

```text
activeInstanceId
instanceCount
instances[]
```

Cada entrada contém `instanceId`, `overlayId`, `objectIds`, `state`, domínios e
operações temporais.

## Painel de animação

O painel mantém presets, procedimentos e composições. A nova seção **Animações
ativas** lista todas as instâncias e oferece controles individuais. Os botões do
cabeçalho continuam referindo-se à instância mais recente, enquanto **Parar
todas** encerra todas as camadas.

## Mudanças editoriais

O `LocalAnimationCoordinator` não interpreta mais qualquer mudança no sandbox
como motivo para parar a sessão. O adaptador classifica os `objectId` afetados.
Uma alteração em `b` não interfere numa animação de `a`.

Nesta etapa, uma edição do próprio objeto animado interrompe as instâncias que o
incluem. O próximo refinamento pode introduzir rebase por canal para permitir
mover a transformação-base enquanto uma rotação temporal continua.

## Previews restaurados

Os seguintes controladores agora chamam `renderer.invalidateRender()` depois de
mudar objetos auxiliares diretamente:

- `ObjectPlacementController` — preview de criação e posicionamento;
- `PlanarSketchController` — perfis e primitivas planares, incluindo entradas
  usadas por revolução/lathe;
- `PathSketchController` — linha de desenho, tubo, sweep e arrays ao longo de
  caminhos;
- `DrawingTargetController` — plano, helper e cursor de superfície;
- `MeasurementController` — régua e transferidor.

Essas invalidações não restabelecem um loop permanente. Cada modificação pede
somente o quadro necessário; após o preview estabilizar, o renderer volta ao
repouso.

## Invariantes testados

1. duas animações em objetos distintos geram duas operações e dois overlays;
2. uma mudança num terceiro objeto não interrompe nenhuma delas;
3. uma mudança em um alvo para somente suas instâncias;
4. duas camadas podem coexistir no mesmo objeto;
5. pausar ou parar uma camada preserva a outra;
6. parar todas remove operações e overlays;
7. uma camada de grupo produz deltas por objeto, não matrizes absolutas
   capturadas;
8. todos os controladores de preview sob demanda possuem invalidação explícita.

## Limitações atuais

- conflitos semânticos entre duas animações que escrevem o mesmo canal ainda
  são resolvidos por composição em ordem de criação, não por um mixer de canais;
- o controle individual é local ao viewer nesta etapa; o protocolo compartilhado
  continua mantendo como sessão autoritativa a animação mais recente;
- uma alteração no próprio alvo para a instância em vez de rebaseá-la;
- deformações de vértices e topologia não são overlays de animação nesta etapa;
- a validação WebGL final deve ser feita no dispositivo Android.
