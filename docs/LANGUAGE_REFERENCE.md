# Referência da linguagem e do console SpatialSeed

> Referência normativa P0. Auditada em 19 de julho de 2026 contra o runtime
> `0028b`. Consulte `help`, `help create`, `help animate`, `procedure help` e
> `runtime test help` para confirmar as capabilities do build carregado.

## 1. Três linguagens, uma fronteira editorial

O console reúne três superfícies diferentes:

| Camada | Finalidade | Executor | Pode alterar a cena? |
| --- | --- | --- | --- |
| comandos editoriais | selecionar, transformar, criar, agrupar, propriedades | processo principal, camada de comandos | sim, imediatamente e com histórico |
| linguagem afim `spatialseed-math-v1` | gerar séries paramétricas determinísticas | compilador/avaliador afim | somente pelo comando que a contém |
| animação temporal | avaliar a linguagem afim com `t` sobre um overlay visual | runtime fixed-step + renderer | não; restaura a projeção canônica ao parar |
| JavaScript SES | cálculo, estado privado, funções e procedimentos | Worker + SES Compartment | somente produz plano; exige `plan commit` |

Não confunda `program` com macro textual. Programas não recebem o registro de
comandos e não chamam o renderer.

## 2. Separação de entradas

Comandos editoriais podem ser separados por `;` ou quebra de linha:

```text
select only box-1
move 1 0 0; rotate 0 15 0
```

Separadores dentro de aspas simples ou duplas são preservados. O tokenizer
atual é simples: não interpreta escapes complexos nas aspas.

Entradas iniciadas por `calc`, `program`, `session`, `plan` ou `procedure` usam
o parser de programas:

- `calc`, `program`, `procedure define` e `procedure import` preservam todo o
  texto restante, inclusive quebras de linha;
- um bloco de linhas administrativas é executado sequencialmente se **todas**
  começarem por `plan`, `session` ou `procedure`;
- não misture, no mesmo bloco, linha administrativa e comando editorial.

Exemplo válido:

```text
plan status
plan commit
```

## 3. Comandos editoriais

### 3.1 Descoberta e diagnóstico

```text
help
help create
help calc
procedure help
commands
list objects
inspect selection
inspect selected
inspect selected all
inspect input
inspect editor
inspect sandbox
inspect region
inspect objects
gizmo
runtime resources
```

`commands` descreve IDs públicos registrados. `help` é a superfície humana.
`inspect` e `runtime resources` são consultas; não devem alterar a cena.

### 3.2 Seleção

```text
select object-id [object-id ...]
select only object-id [object-id ...]
select add object-id [object-id ...]
select remove object-id [object-id ...]
select toggle object-id [object-id ...]
select clear
clear
```

`select` sem operação substitui pela primeira referência e alterna as demais.
Para automação legível, prefira `only`, `add`, `remove` ou `toggle`.

### 3.3 Transformações e pivô

```text
position x y z
move dx dy dz
rotate xDeg yDeg zDeg
scale sx sy sz
pivot
pivot median
pivot bounds
pivot active
pivot absolute x y z
pivot custom x y z
pivot relative dx dy dz
```

`rotate` recebe graus. Fatores de `scale` devem ser positivos. `position` define
posição, enquanto `move` aplica delta.

### 3.4 Snapping e vértices de diagnóstico

```text
snap move valor
snap rotate valor
snap scale valor
snap grid on|off
vertices on|off
```

Valores de snapping não podem ser negativos. `vertices` é visualização de
diagnóstico; não é edição de mesh.

### 3.5 Ciclo de objetos e grupos

```text
duplicate
duplicate count N
repeat
group [nome]
ungroup
delete
undo
redo
```

Duplicar ou excluir um grupo opera sobre a subárvore. `ungroup` remove um nível
e preserva transforms mundiais dos filhos.

## 4. Criação geométrica

### 4.1 Famílias

```text
create box [x y z]
create box size sx sy sz [opções]
create sphere [radius r] [segments largura altura] [opções]
create cylinder [radius r|top r bottom r] [height h] [segments n] [opções]
create plane [size largura altura] [segments x y] [opções]
create polygon [n|sides n] [radius r] [angle graus] [opções]
```

Famílias efetivas vêm do `GeometryRegistry`; a sintaxe editorial atual cobre as
cinco famílias padrão.

### 4.2 Opções comuns

```text
origin x y z
color #rrggbb
count N
move x y z
rotate x y z
scale x y z
```

`count` aceita inteiro de 1 a 100.000. Quando presente com operações afins, o
comando cria uma série pela mesma infraestrutura de duplicação paramétrica.

### 4.3 Referenciais de colocação

Uma geometria local XY pode ser colocada de três formas:

```text
plane xy|xz|yz [origin x y z]
origin x y z normal nx ny nz [tangent tx ty tz]
points x0 y0 z0 x1 y1 z1 x2 y2 z2
```

- `plane` escolhe referencial canônico;
- `normal` constrói base ortonormal; `tangent` é opcional e não pode ser
  paralela à normal;
- `points` usa o primeiro ponto como origem, o segundo para a tangente e os
  três para a normal; pontos coincidentes ou colineares falham;
- `plane` e `normal` não devem ser combinados;
- `points` não combina com `normal` ou `tangent`.

Exemplos:

```text
create polygon 6 radius 2 plane xz origin 0 0 0 color #33aaff
create polygon sides 5 radius 1.5 origin 0 2 0 normal 1 1 0 tangent 0 0 1
create plane size 6 4 points 0 0 0 6 0 0 0 3 2
create cylinder top 0 bottom 1.5 height 4 segments 32 origin 3 2 0
```

## 5. Propriedades

```text
property list
property inspect [id]
property set id valor [...]
property unset id
```

O registro, não esta lista, é autoritativo. O registro padrão inclui:

| ID | Tipo | Lote |
| --- | --- | --- |
| `object.name` | string | não |
| `transform.position` | vector3 | não |
| `transform.rotationDeg` | vector3 | não |
| `transform.scale` | vector3 positivo | sim |
| `geometry.size` | vector3 positivo, caixa legada | sim |
| `appearance.color` | cor | sim |
| `appearance.opacity` | número em `[0,1]` | sim |
| `appearance.transparent` | boolean | sim |
| `texture.src` | URI/string anulável | sim |
| `texture.repeat` | vector2 | sim |
| `texture.offset` | vector2 | sim |
| `texture.rotationDeg` | número | sim |
| `texture.wrap` | `repeat`, `clamp`, `mirror` | sim |
| `instance.color` | cor anulável | sim |

Booleanos aceitam `true/false`, `on/off`, `yes/no`, `sim/não` e `1/0`.
Exemplos:

```text
property set appearance.color #d48676
property set transform.scale 2 1 2
property set texture.repeat 4 2
property unset instance.color
```

Em seleção múltipla, `property inspect` distingue valor uniforme, misto e
propriedade não suportada. Uma edição em lote é atômica.

## 6. Linguagem afim

### 6.1 Onde aparece

Expressões afins podem ocupar componentes de `move`, `rotate`, `scale` e
`matrix` em:

```text
duplicate count N ...
create tipo ... count N ...
```

Use aspas quando a expressão contém espaços:

```text
duplicate count 24 move "3*cos(i*pi/12)" 0 "3*sin(i*pi/12)"
```

### 6.2 Variáveis de contexto

| Nome | Significado |
| --- | --- |
| `i`, `index` | índice da cópia, começando em 1 |
| `count` | quantidade total |
| `u` | parâmetro normalizado: `(i-1)/(count-1)`, ou `0` se `count=1` |
| `t`, `time` | tempo fornecido pelo chamador; hoje 0 no console editorial |
| `dt`, `deltaTime` | delta de tempo fornecido; hoje 0 no console editorial |
| `x`, `y`, `z` | posição corrente |
| `sx`, `sy`, `sz` | escala corrente |
| `position`, `scale`, `rotation` | vetores correntes; não são escalares |
| `pi`, `e`, `tau`, `phi` | constantes matemáticas |
| `deg`, `rad`, `turn` | fatores para unidades de rotação |

Variáveis de usuário aceitas pela API devem ter nome de identificador e valor
numérico ou vetor finito.

### 6.3 Operadores e precedência

Operadores: `+`, `-`, `*`, `/`, `%`, `**`. `^` é alias temporário normalizado
para `**`.

Potência é associativa à direita e segue precedência de Python:

```text
-2 ** 2   == -4
2 ** -2   == 0.25
```

Não existem atribuição, acesso a propriedades, arrays, strings, condicionais ou
chamadas arbitrárias na linguagem afim.

### 6.4 Funções

```text
sin cos tan
sind cosd tand
asin acos atan atan2
sqrt cbrt abs exp log log10
min max floor ceil round trunc sign hypot
```

Trigonometria comum usa radianos; `sind`, `cosd`, `tand` usam graus.
Operações `rotate` recebem graus. Sufixos/fatores aceitos:

```text
90 deg
pi/2 rad
0.25 turn
90d
1.57079632679r
```

### 6.5 Semântica de série

O modo canônico atual é `indexed`, translação em espaço mundial:

- posição evolui a partir da anterior;
- rotação acumula;
- escala em cada índice é fator sobre a escala da semente, não produto
  acumulado;
- o programa é compilado uma vez e avaliado por cópia;
- a mesma entrada produz AST e resultado determinísticos.

O núcleo também possui modo `recursive` e espaço local, mas o console atual não
expõe chaves para escolhê-los diretamente.

## 7. JavaScript SES

### 7.1 `calc`

Avalia uma expressão JavaScript síncrona:

```text
calc sqrt(3 ** 2 + 4 ** 2)
calc [1,2,3].map(x => x*x)
calc session.radius = 12
```

### 7.2 `program`

Avalia um corpo de função estrito e síncrono. Use `return` para devolver valor:

```text
program
const values = [];
for (let i = 0; i < 5; i += 1) values.push(i ** 2);
print(values);
return values.reduce((a, b) => a + b, 0);
```

Uma Promise ou valor Promise-like é rejeitado. Valores devolvidos precisam ser
clonáveis por `structuredClone`.

### 7.3 Endowments matemáticos

Constantes:

```text
pi e tau phi
```

Funções:

```text
sin cos tan asin acos atan atan2
sqrt cbrt abs exp log log10
min max floor ceil round trunc sign hypot pow
random randomInt randomSeed
```

As mesmas entradas também existem em `math`, por exemplo `math.sqrt(9)`.

O console inicia cada avaliação com seed `0`. `randomSeed(s)` reinicia o PRNG da
avaliação atual. O estado do PRNG não persiste automaticamente entre avaliações;
se necessário, persista a seed em `session` e chame `randomSeed` explicitamente.

Semântica:

```js
random()       // [0,1)
random(max)    // [0,max)
random(min,max)
randomInt(max) // inteiro em [0,max)
randomInt(min,max)
```

Intervalos devem ser finitos e crescentes.

### 7.4 `print` e `snapshot`

`print(...valores)` junta valores por espaço e acumula até 100 linhas por
avaliação. Objetos usam JSON quando possível. `BigInt` é mostrado com sufixo
`n`.

`snapshot` é uma cópia fornecida pelo host. No console atual ele é normalmente
`null`; consumidores futuros podem oferecer snapshot explícito. Mesmo presente,
ele não é referência viva à cena.

## 8. Sessão persistente

```text
session status
session reset
session cancel
session help
```

Use propriedades explícitas:

```text
calc session.radius = 12
program session.area = r => pi * r ** 2
calc session.area(session.radius)
```

Declarações locais de uma avaliação não persistem; valores em `session`
persistem enquanto o Worker estiver saudável. Funções podem permanecer no
Worker, mas não podem atravessar como resultado.

Erro, timeout ou cancelamento invalida e termina a sessão. `reset` cria uma
fronteira limpa sem alterar a cena ou o catálogo.

## 9. Planejamento espacial

### 9.1 API

```js
spatial.geometries
spatial.create(type, options)
spatial.stats()
```

`spatial` só existe quando autorizada. `create` aceita:

```js
spatial.create("box", {
  name: "Torre",
  size: [2, 8, 2],
  position: [0, 4, 0],
  rotation: [0, 0, 0, 1],
  color: "#4488ff"
})
```

Parâmetros de geometria podem ficar diretamente em `options` ou dentro de
`geometry`. As chaves especiais são `name`, `position`, `rotation`, `placement`
e `color`.

`placement` usa o mesmo contrato de `origin`, `plane`, `normal`, `tangent` e
`points`. A lista atual autorizada contém `box`, `sphere`, `cylinder`, `plane` e
`polygon`, mas deve ser consultada em `spatial.geometries`.

### 9.2 Planos

Depois de um programa criar intenções:

```text
plan status
plan commit
plan discard
plan help
```

Enquanto houver plano pendente, outro programa/procedimento espacial não pode
iniciar. `commit` valida contra a revisão atual e aplica todos os objetos em um
único item de undo. `discard` não altera a cena.

## 10. Procedimentos e bibliotecas

### 10.1 Comandos

```text
procedure define nome expressão-de-função
procedure list
procedure show nome
procedure run nome [argumento-JSON]
procedure remove nome
procedure export
procedure import [merge|replace] documento-JSON
```

`define` substitui explicitamente uma definição de mesmo nome. `run` aceita
apenas argumento JSON e executa a fonte no Worker SES.

### 10.2 Nome

O nome deve satisfazer:

```regex
^[A-Za-z_][A-Za-z0-9_.-]*$
```

### 10.3 Formato de biblioteca

```json
{
  "schemaVersion": "spatial-seed-procedure-library-v1",
  "procedures": [
    {
      "name": "tower",
      "source": "({height=8}={}) => spatial.create('box',{size:[2,height,2],position:[0,height/2,0]})"
    }
  ]
}
```

Procedimentos são ordenados por nome na exportação. Fonte vazia, nome inválido,
duplicata ou fonte acima de 100.000 caracteres é rejeitada. `merge` rejeita
conflito de mesmo nome com fonte diferente; `replace` troca o conjunto inteiro.

Importar não executa. O arquivo de biblioteca é separado de `.spatialseed`.

### 10.4 Exemplo completo

```text
procedure define ring ({count=24,radius=6,color="#66ccaa"}={}) => {
  const handles=[];
  for(let i=0;i<count;i+=1){
    const a=i*tau/count;
    handles.push(spatial.create("sphere",{
      radius:0.35,
      position:[radius*cos(a),0,radius*sin(a)],
      color
    }));
  }
  return {count,handles};
}
```

Depois, em entradas administrativas separadas:

```text
procedure run ring {"count":36,"radius":8,"color":"#d48676"}
plan status
plan commit
```

## 11. Animação temporal efêmera

```text
animate spin|orbit|float|pulse|wave [parâmetro=valor ...]
animate move expressão-x expressão-y expressão-z
animate rotate expressão-x expressão-y expressão-z
animate scale expressão-x expressão-y expressão-z
animate matrix m00 ... m15
animate pause
animate resume
animate stop
animate status
animate list
animate help
```

O comando captura a seleção atual. Cada raiz selecionada é uma unidade; grupos
mantêm sua estrutura rígida. Rotação e escala usam o pivô mundial próprio de
cada unidade. Uma alteração editorial da cena interrompe a animação e restaura
a projeção canônica.

As expressões usam o mesmo AST seguro da linguagem afim e são compiladas uma
vez. Além das constantes e funções da seção 6, recebem:

| Nome | Significado |
| --- | --- |
| `t` | tempo fixo da simulação, em segundos |
| `dt` | duração do passo fixo |
| `i` / `index` | índice da unidade, começando em 1 |
| `u` | índice normalizado entre 0 e 1 |
| `count` | quantidade de unidades |

Exemplos:

```text
animate spin speed=45 axis=y
animate orbit radius=4 speed=30 axis=y
animate wave amplitude=1 frequency=0.5 phase=0.35
animate move "2 * sin(t)" 0 0
animate rotate 0 "90 * t + 20 * sin(tau * t)" 0
```

O overlay não cria comandos editoriais, não ocupa histórico e não é salvo no
arquivo `.spatialseed`. `animate stop` restaura exatamente a cena persistente.

## 12. Limites e erros

| Condição | Resultado |
| --- | --- |
| fonte > 100.000 caracteres | `RangeError` |
| execução > 5.000 ms padrão | Worker terminado, sessão perdida |
| mais de 10.000 comandos | plano falha |
| mais de 100 linhas de saída | programa falha |
| Promise retornada | programa falha |
| resultado não clonável | programa falha |
| geometria/capability ausente | programa falha fechado |
| revisão da cena mudou | `plan commit` rejeita plano obsoleto |
| erro do programa | intenções descartadas, sessão invalidada |

O console registra sucesso ou erro por entrada. Stack traces são diagnóstico de
desenvolvimento e não fazem parte da API estável de erro.

## 13. Testes e benchmarks

```text
test help
test all
runtime test help
runtime test animation-runtime
runtime test animation-commands
runtime test all
runtime benchmark api [iterações]
benchmark help
benchmark scene [objetos] [amostras] [transformados]
benchmark history
benchmark compare
benchmark clear
```

`runtime test all` é teste de correção, não benchmark. O histórico de benchmark
atual vive apenas na instância carregada e mantém no máximo 20 resultados.

## 14. Relação com JavaScript padrão

O modo SES usa a sintaxe ECMAScript aceita pelo navegador, mas dentro de um
ambiente Hardened JavaScript e sem capabilities de host implícitas. Esta
referência não reproduz a especificação ECMAScript. Recursos padrão devem ser
usados somente quando não dependem de DOM, rede, importação ou assincronismo.

## 15. Referências

- [ECMAScript Language Specification](https://tc39.es/ecma262/)
- [Endo: Hardened JavaScript e SES](https://docs.endojs.org/documents/get-started.html)
- [WHATWG: structured cloning](https://html.spec.whatwg.org/multipage/structured-data.html)
- [`SECURITY_MODEL.md`](SECURITY_MODEL.md)
- [`AFFINE_AST_AND_SEMANTICS_0021D.md`](AFFINE_AST_AND_SEMANTICS_0021D.md)
- [`SCRIPT_RUNTIME_0026A.md`](SCRIPT_RUNTIME_0026A.md)

## 16. Fontes no repositório

- `packages/devtools/src/DevConsole.js`
- `packages/animation-runtime/src/AnimationRuntime.js`
- `packages/animation-runtime/src/AnimationCommandService.js`
- `packages/animation-runtime/src/AnimationProgram.js`
- `packages/animation-runtime/src/AnimationPresetCatalog.js`
- `packages/selection-operations/src/AffineProgram.js`
- `packages/selection-operations/src/AffineAst.js`
- `packages/script-runtime/src/ProgramWorkerKernel.js`
- `packages/script-runtime/src/ProgramSessionKernel.js`
- `packages/script-runtime/src/SpatialPlanningFacade.js`
- `packages/script-runtime/src/ProcedureCatalog.js`
- `packages/property-registry/src/createDefaultPropertyRegistry.js`
