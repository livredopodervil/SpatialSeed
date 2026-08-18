# PARTE I - O SPATIALSEED COMO SISTEMA

SpatialSeed é um ambiente para construir mundos digitais sem reduzir o mundo à
tela que o mostra. A aplicação atual oferece edição 3D, programação procedural,
animação e um loop jogável local. A questão que organiza o projeto é mais
durável: como conservar identidade, autoria e capacidade de revisão quando o
mesmo estado é operado por interfaces e projeções diferentes?

## 1 - Uma definição operacional

Uma cena do SpatialSeed contém objetos lógicos, geometrias, aparências,
hierarquias e propriedades. Uma sessão acrescenta seleção, pivô, câmera,
previews, tempo e simulação. A distinção é essencial: o que descreve o mundo
pode ser salvo; o que descreve uma forma momentânea de observá-lo ou manipulá-lo
deve poder desaparecer sem corrompê-lo.

> O mundo não é o `Object3D`, a aba, o painel ou o frame atual. O mundo é o
> estado que pode ser reconstruído pelos contratos aceitos.

Um botão e um comando textual pertencem à mesma aplicação quando traduzem a
intenção para a mesma operação. Se cada superfície cria sua própria versão da
lógica, o projeto deixa de ter uma autoridade única.

## 2 - O que existe, o que amadurece e o que ainda é horizonte

| Nível | Evidência exigida | Exemplos |
| --- | --- | --- |
| Implementado | código e caminho observável | seleção, projetos, malha, STL, animação e jogo local |
| Testado | gate, suíte ou roteiro registrado | gates locais, testes do runtime e auditorias de marco |
| Em consolidação | contrato existente, ainda variável | colisão por malha, personagem GLB e ferramentas por caminho |
| Decidido | invariante registrada | preview não é commit; renderer não é autoridade |
| Pretendido | direção sem entrega completa | colaboração remota, física geral e modificadores vinculados |

Essa tabela não é apenas uma convenção editorial. Ela impede que a arquitetura
pretendida seja vendida como função presente e impede o erro inverso de ignorar
capacidades que já existem porque ainda não alcançaram maturidade comercial.

## 3 - Cinco estados que não devem ser confundidos

### Estado canônico

Objetos, hierarquia, geometria, aparência e propriedades aceitas. É a parte que
o projeto precisa reconstruir.

### Estado editorial

Seleção, pivô, contexto de ferramenta, sessão de malha e histórico local. Ele
organiza a autoria, mas não é uma propriedade permanente da cena.

### Estado de viewer

Câmera de navegação, apresentação, painéis e renderização local. Dois viewers
podem mostrar o mesmo mundo por câmeras diferentes.

### Estado temporal

Relógios, domínios, operações e overlays de animação. Uma definição temporal
pode ser compartilhada; matrizes por quadro permanecem locais.

### Estado de simulação

Velocidade, contato, entrada, câmera de jogo e binding visual. Parar a sessão
deve liberar demanda de frame e restaurar autoria.

## 4 - A disciplina de uma mutação

Uma intenção persistente percorre comando, validação, resolução de alvos,
serviço de domínio, sandbox e projeção. Uma intenção transitória pode parar no
preview. Um programa pode produzir um plano e aguardar revisão.

```text
interface -> comando -> validação -> sandbox -> projeção
programa  -> plano   -> revisão   -> comando -> sandbox
gesto     -> preview -> commit ou cancelamento
```

Essa disciplina permite substituir UI, renderer, índice espacial ou backend de
script sem redefinir o significado da operação.

## 5 - Arquitetura em camadas

{{FIGURE:docs/book/assets/diagram_architecture.png|Diagrama editorial da separação entre estado lógico, edição, projeção e interfaces.|6.4}}

### Região

Representa autoridade lógica e regras de aceitação. A arquitetura remota ainda
é horizonte; o contrato local já impede que pixels decidam o estado.

### Sandbox

Mantém réplica editorial, revisão, comandos aceitos e undo/redo.

### Editor

Mantém seleção, pivô, ferramentas e sessões transitórias.

### Viewer

Mantém câmera, apresentação, tempo e jogo.

### Renderer

Materializa recursos, lotes, highlights e overlays. Ele pode ser otimizado sem
apagar identidade lógica.

## 6 - Por que o projeto usa comandos

Comandos tornam uma intenção nomeável, testável e reutilizável. `game.start`,
`selection.translate` e `mesh.edit.commit` podem ser chamados por interfaces
diferentes sem expor o objeto interno que implementa cada etapa.

Queries descrevem estado. Eventos comunicam fatos transitórios. Misturar os
três conceitos produz dependências ocultas: uma leitura que muda o mundo, um
evento que se torna autoridade, ou um botão que contorna o serviço canônico.

O incremento 0054mx transforma essa distinção numa capacidade de autoria. Um
objeto pode guardar a relação entre um evento e um comando autorizado, mas não
uma função JavaScript, um elemento da interface ou um objeto do renderer. O
evento informa; o binding escolhe uma reação; o comando continua sendo a
fronteira que valida a ação. Essa pequena linguagem é o primeiro elo prático
entre cenas editáveis e applets distribuíveis.

```text
recurso.propriedade <- binding(fonte)
evento              -> comando autorizado(argumentos)
prefab               -> grafo + parâmetros + overrides       [pretendido]
applet               -> projeto + assets + runtime mínimo    [pretendido]
```

Somente a segunda linha está entregue de ponta a ponta nesta edição. A notação
mostra convergência arquitetural, não uma promessa de que bindings, prefabs e
exportação já estejam prontos.

## 7 - O custo das abstrações

Separar camadas tem custo fixo. O projeto não trata isso como motivo para
remover contratos antes de medir. Benchmarks devem separar parser, validação,
clone, publicação, renderer, DOM e GPU. A duração de `runtime test all` é teste
de correção, não medida de desempenho.

O princípio econômico é simples: abstrações devem pagar seu custo por
substituibilidade, segurança, teste ou reuso real. Quando não pagam, a dívida
deve ser reduzida por gates monotônicos.

## 8 - Como ler o restante do livro

A Parte II é um Manual do Usuário orientado a tarefas. A Parte III é a
Referência Técnica. Ambas são incluídas diretamente das fontes vivas, evitando
que o PDF se torne uma documentação paralela. A Parte IV apresenta um atlas
procedural e a Parte V encerra com evidência, limites e horizonte.

{{INCLUDE:docs/MANUAL_DO_USUARIO.md}}

{{INCLUDE:docs/REFERENCIA_TECNICA.md}}

# PARTE IV - ATLAS PROCEDURAL

Gerar proceduralmente é escolher uma semente, um domínio, uma regra e
invariantes. Não é pedir ao sistema que improvise sem contrato. Os exemplos
desta parte foram criados e validados na família 0021d e permanecem como
evidência histórica da linguagem afim. A sintaxe efetiva deve ser conferida por
`help` no build atual.

## 25 - Modelo matemático

Uma família procedural indexada pode ser escrita como `F(i)`, onde `i` é o
índice inteiro da cópia. O parâmetro `u` normaliza o domínio: quando há mais de
uma cópia, `u=(i-1)/(count-1)`. Fórmulas usam `pi` para π e `tau` para `2π`.

Três parâmetros aparecem repetidamente:

- amplitude controla o tamanho do desvio;
- frequência controla a quantidade de ciclos;
- fase desloca uma família sem alterar sua forma básica.

Em `A*sin(w*u+p)`, `A` é amplitude, `w` é frequência angular e `p` é fase.

### Incremento e posição absoluta

`move` descreve um delta. Para seguir uma curva absoluta `f(i)`, use
`f(i)-f(i-1)`. A soma telescópica reconstrói a curva e permite repetir a regra
sem manter um array externo de posições.

### Custo e densidade

A fórmula pode descrever uma curva contínua, mas o sistema materializa amostras.
Reduzir `count` é a primeira adaptação para um dispositivo móvel. Transparência,
quantidade de materiais, seleção e helpers também afetam custo gráfico.

## 26 - Onda integrada

A Onda Integrada soma um seno à altura anterior. A rotação acumula; a escala
pulsa em relação à semente.

{{FIGURE:docs/book/assets/scene_onda-integrada.png|Pré-visualização editorial da Onda Integrada calculada a partir das transformações validadas.|6.3}}

```text
select only box-2
position -12 1 0
scale 0.35 0.35 0.35
duplicate count 60 move 0.4 "0.28*sin(2*tau*u)" 0 rotate 0 0 5
select clear
```

O arquivo anexado preserva a listagem histórica integral.

{{PROGRAM:docs/book/examples/01_onda_integrada_0021d.txt|Programa histórico integral - Onda Integrada}}

## 27 - Hélice ascendente

Considere a curva `f(i)=(4*cos(tau*i/40), -4+0.05*i,
4*sin(tau*i/40))`. O comando fornece diferenças sucessivas de `f`. Quarenta
passos completam uma volta; 160 cópias completam quatro voltas.

{{FIGURE:docs/book/assets/scene_helice-ascendente.png|Pré-visualização da Hélice Ascendente com quatro voltas e crescimento gradual.|6.3}}

Variações úteis:

- aumentar a frequência angular para mais voltas;
- usar raios diferentes em X e Z para hélice elíptica;
- substituir o incremento vertical constante por expressão dependente de `u`;
- aplicar fases diferentes a sementes distintas.

{{PROGRAM:docs/book/examples/02_helice_ascendente_0021d.txt|Programa histórico integral - Hélice Ascendente}}

## 28 - Roseta tricromática

A roseta usa a curva polar `r=4*cos(3*t+p)`, com `x=r*cos(t)`,
`z=r*sin(t)` e pequena oscilação vertical. Três fases - `0`, `tau/3` e
`2*tau/3` - produzem famílias relacionadas.

{{FIGURE:docs/book/assets/scene_roseta-tricromatica.png|Roseta Tricromática: cada cor corresponde a uma semente e a uma fase da mesma regra.|6.3}}

Cor permanece propriedade da semente. Alterar a paleta no Inspector antes de
duplicar reutiliza a geometria sem embutir hexadecimais no programa.

{{PROGRAM:docs/book/examples/03_roseta_tricromatica_0021d.txt|Programa histórico integral - Roseta Tricromática}}

## 29 - Cidade policêntrica

A cidade transforma um índice linear em linha e coluna:

```text
col(i) = i % 4
row(i) = floor(i / 4)
```

As diferenças entre `col(i)` e `col(i-1)` fazem o cursor retornar ao início da
linha enquanto avança uma rua. Altura e centro vertical são calculados juntos
para manter a base dos edifícios no chão.

{{FIGURE:docs/book/assets/scene_cidade-policentrica.png|Cidade Policêntrica: distritos paramétricos e eixos verdes formados por três sementes cromáticas.|6.3}}

Esse exemplo demonstra que a linguagem afim não se limita a curvas: grids,
distritos, fachadas e infraestrutura podem ser expressos por regras pequenas.

{{PROGRAM:docs/book/examples/04_cidade_policentrica_0021d.txt|Programa histórico integral - Cidade Policêntrica}}

## 30 - Trindade orbital

A Trindade Orbital combina três fios numa curva toroidal modulada. Frequências
coprimas percorrem a estrutura antes do fechamento; fases distintas separam as
famílias cromáticas.

{{CROP_PAIR:docs/book/assets/01-1000132480.png|Vista superior executada no SpatialSeed público.|0.03,0.08,0.97,0.82|docs/book/assets/02-1000132482.png|Vista oblíqua em navegador móvel.|0.03,0.04,0.97,0.88|5.2}}

Se `t=tau*i/count`, raio maior `R=4`, raio menor `r=1.25` e fase `p`:

```text
rho = R + r*cos(5*t+p)
x = rho*cos(2*t)
y = r*sin(5*t+p)
z = rho*sin(2*t)
```

As frequências 2 e 5 são coprimas. As fases `0`, `tau/3` e `2*tau/3`
produzem três fios relacionados. Alterar um termo exige alterar também o termo
no índice anterior para preservar a diferença telescópica.

{{PROGRAM:docs/book/examples/SpatialSeed_Trindade_Orbital_0021d.txt|Programa histórico integral - Trindade Orbital}}

## 31 - Do atlas histórico às ferramentas atuais

Os exemplos 0021d materializam muitos objetos por séries afins. A árvore 0054
acrescenta caminhos desenhados, distribuição incremental, formas 2D semânticas,
malha editável, animação temporal e jogo. Uma evolução coerente não precisa
descartar o atlas: pode transformar regras em procedimentos, assets e futuras
receitas vinculadas.

O passo ainda não entregue é preservar uma receita compacta que regenere seus
resultados mantendo exceções locais e identidade de componentes. Até essa
fronteira amadurecer, o atlas é exemplo de linguagem e não promessa de um
sistema completo de modificadores.

# PARTE V - EVIDÊNCIA, LIMITES E ROTEIRO

## 32 - Como validar uma versão

Uma validação útil combina:

1. build publicado e controlador PWA identificados;
2. gates locais;
3. `runtime test all` no perfil diagnóstico;
4. teste visual da área modificada;
5. projeto salvo e reaberto quando há persistência;
6. benchmark comparável quando a alegação é de desempenho.

### Protocolo de benchmark

- registre commit, build, aparelho, navegador e temperatura;
- use aquecimento separado;
- colete pelo menos cinco amostras;
- reporte mediana, mínimo e máximo;
- separe lógica, projeção e frame rate;
- preserve cenário e programa junto do resultado.

Números de marcos antigos permanecem evidência histórica, não estimativa da
árvore atual.

## 33 - Limites assumidos

O sistema atual é um protótipo avançado, não um produto acabado. Ainda faltam
estabilidade de formato, hardening de segurança, topologia robusta para casos
gerais, física geral, colaboração remota e um fluxo de release simplificado.

Esses limites não anulam o que já funciona. Eles determinam onde o manual pode
ser prescritivo e onde a documentação deve permanecer condicional.

## 34 - Roteiro de maior retorno

### Documentação e acessibilidade

Manter Manual, Referência e Livro sobre fontes compartilhadas; gerar ajuda a
partir de registros; reduzir duplicações históricas e melhorar descoberta das
capacidades já existentes.

### Autoria procedural

Transformar perfis, caminhos e operações maduras em receitas vinculadas com
cache e conversão explícita para malha.

### Topologia

Completar IDs estáveis, atributos por canto, cortes, reparo e backend de
booleanas substituível.

### Jogo

Ampliar o contrato entregue de evento → comando com gatilhos de ponteiro,
colisão e propriedade, preservando `GameRuntime` como scheduler.

### Composição e distribuição

Endereçar propriedades, introduzir bindings com detecção de ciclos, representar
prefabs como grafos parametrizáveis e exportar um perfil mínimo de applet. O
resultado deve abrir em navegador comum, funcionar em hospedagem estática e ser
incorporável numa página sem instalar SpatialSeed, Termux, Linux ou Node.

Texto, painéis interativos e geometrias implícitas são candidatos naturais a
providers/plugins dessa linguagem comum. Entram depois das fronteiras de
propriedade, evento e recurso para não se tornarem subsistemas verticais
isolados.

### Colaboração

Definir envelope causal e matriz de conflitos antes de escolher CRDT ou
transporte. Convergência de mapas não substitui validade geométrica.

## 35 - Motivações para continuar

SpatialSeed reúne criação visual, semântica verificável e arquitetura para
múltiplas superfícies. A mesma base permite desenhar, programar, animar e jogar
sem transformar cada modo em um projeto diferente.

> O sistema não precisa prever todas as formas. Precisa preservar a relação que
> permite que novas formas apareçam sem perder identidade, autoria e caminho de
> volta.

# APÊNDICES

## Apêndice A - Comandos de entrada

```text
help
help create
help camera
help tool
procedure help
runtime test help
```

Ajuda gerada pelo build tem precedência sobre tabelas impressas.

## Apêndice B - Símbolos matemáticos

| Grupo | Símbolos |
| --- | --- |
| Índice | `i`, `index`, `count`, `u` |
| Tempo | `t`, `time`, `dt`, `deltaTime` |
| Estado | `x`, `y`, `z`, `sx`, `sy`, `sz` |
| Constantes | `pi`, `tau`, `e`, `phi`, `deg`, `rad`, `turn` |
| Operadores | `+`, `-`, `*`, `/`, `%`, `**` |
| Funções | `sin`, `cos`, `tan`, `sqrt`, `abs`, `min`, `max`, `floor`, `ceil`, `round`, `atan2`, `hypot` |

## Apêndice C - Fontes anexadas

O PDF inclui Manual do Usuário, Referência Técnica, manifesto de validação
histórico e cinco programas do atlas. Leitores com suporte a anexos exibem um
painel de clipe.

Em sistemas com Poppler:

```text
pdfdetach -list SpatialSeed_Livro_Manual_e_Atlas_Procedural_v1.0.pdf
pdfdetach -saveall SpatialSeed_Livro_Manual_e_Atlas_Procedural_v1.0.pdf
```

## Apêndice D - Nota editorial

A edição 1.0 abandona a arquitetura histórica do PDF como eixo do manual. O
conteúdo foi reorganizado a partir do snapshot 0054: primeiro o modelo mental,
depois tarefas, contratos, atlas e limites. Os documentos anteriores foram
usados como fonte histórica e editorial, não como texto-base autoritativo.

Autoria principal: Rogério Duarte. Colaboração editorial e técnica: OpenAI
Codex. GitHub Pages é infraestrutura de distribuição e não implica patrocínio
ou endosso institucional.
