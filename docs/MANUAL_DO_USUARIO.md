# PARTE II - MANUAL DO USUÁRIO

## 1 - Sobre este manual

Este manual descreve tarefas concretas na aplicação web mantida em `apps/web/`.
Ele foi reescrito a partir do snapshot de 18 de agosto de 2026, derivado do
build `20260818-0054mx`. A árvore recebida passou pelos gates locais depois da
correção do início automático do demo, da inclusão das paletas e da primeira
superfície persistente de comportamento por objeto.

O número exibido dentro do aplicativo continua sendo a autoridade para a versão
realmente carregada. Uma fonte modificada no disco não prova que o navegador ou
o service worker já a ativaram.

### Três estados de maturidade

| Estado | Como ler neste manual |
| --- | --- |
| Implementado | caminho de uso presente no snapshot atual |
| Em consolidação | funciona por uma superfície pública, mas ainda pode mudar em ergonomia, desempenho ou semântica |
| Pretendido | direção futura; não aparece como instrução operacional |

Edição básica, arquivos de projeto, PWA, console, animação efêmera, edição de
malha, STL e modo jogo local estão implementados. Colaboração remota, física
geral, booleanas robustas e modificadores vinculados são arquitetura pretendida.

## 2 - Iniciar o SpatialSeed

### Android com Termux

Entre no checkout que deseja testar e inicie o servidor canônico:

```bash
cd ~/SpatialSeed
python3 tools/no_cache_server.py --port 8082
```

Mantenha essa sessão aberta. Em outra sessão do Termux:

```bash
termux-open-url 'https://127.0.0.1:8082/apps/web/'
```

O servidor usa HTTPS por padrão. Na primeira execução, instale no Android a
autoridade certificadora local indicada no terminal. Sem uma origem confiável,
recursos como service worker, instalação da PWA e alguns acessos a arquivo podem
se comportar de modo diferente.

Para testar a partir de outro aparelho na mesma rede:

```bash
python3 tools/no_cache_server.py --port 8082 --network
```

Use uma das URLs impressas pelo servidor. Não exponha essa origem a redes não
confiáveis.

### Desktop

O mesmo servidor funciona num checkout desktop:

```bash
cd SpatialSeed
python3 tools/no_cache_server.py --port 8082
```

Abra `https://127.0.0.1:8082/apps/web/`. O projeto não exige `npm install` nem
uma etapa de build para executar a aplicação. Node.js é usado por parte da
validação de desenvolvimento.

### URLs úteis

| URL ou parâmetro | Resultado |
| --- | --- |
| `/apps/web/` | abre o projeto de demonstração padrão |
| `/apps/web/?project=new` | inicia um projeto vazio |
| `/apps/web/?application=diagnostics` | carrega o perfil diagnóstico |
| `/apps/web/?viewer=join` | participa de uma sessão local quando o fluxo correspondente fornece o sandbox |

O projeto demo é definido por
`apps/web/assets/demo/default-game.manifest.json`. O manifesto escolhe arquivo,
personagem, modo de lançamento e controles; o bootstrap não depende do nome ou
do índice visual do personagem. Antes de iniciar o jogo, a aplicação conclui a
recuperação local. Um projeto recuperado permanece no modo de autoria; o demo só
entra em jogo quando não há projeto persistente ou quando o rascunho é
descartado.

## 3 - Confirmar o build carregado

O painel **Status e comandos** mostra um rótulo como
`v0.1.0 - build 20260818-0054mx`. Esse é o build publicado lido com `no-store`.
O título do campo contém detalhes adicionais:

- build publicado;
- build do service worker controlador;
- worker ativo;
- worker aguardando;
- eventual falha de atualização.

**Atualizar agora** fica disponível quando o controlador não coincide com o
build publicado ou quando a versão publicada está sendo instalada. Ao concluir,
o aplicativo ativa o worker correspondente e recarrega.

Se o rótulo mostrar um build antigo no cache:

1. pressione **Atualizar agora**;
2. se aparecer, use **Reparar atualização**;
3. feche todas as abas e a janela PWA instalada;
4. reabra exatamente a origem do checkout em teste;
5. confirme novamente build publicado e controlador.

Uma mudança no código que conserva o mesmo identificador de build é ambígua
para o cache. Releases de código devem receber um build novo e regenerar o
manifesto de precache.

## 4 - Entender a tela

### Viewer

O viewer ocupa a área central. Ele projeta a cena, recebe navegação, seleção,
gestos de ferramentas e gizmos. O renderer não é a fonte autoritativa do
projeto; ele materializa o estado lógico e overlays transitórios.

### Barra principal

A barra reúne:

- navegar, selecionar, mover, girar e escalar;
- operações de seleção;
- alternância mundo/local;
- criação rápida, undo, redo e revisão;
- Estrutura, Diagnóstico, Desenvolvedor e Console;
- Câmera, Render, viewers, Inspector e edição;
- Criar, Explorar, Animação e Jogar;
- modo somente cena;
- Salvar, Abrir, Novo, STL, personagem GLB e procedimentos.

### HUD Editar

O botão com lápis abre o HUD contextual. Ele concentra:

- assunto: objeto, vértice, aresta ou face;
- ferramenta: navegar, selecionar, mover, girar ou escalar;
- operação de seleção: substituir, adicionar, remover ou alternar;
- frame: mundo, local, viewer ou plano personalizado;
- eixos, snap, proporcionalidade e travas;
- plano ativo de autoria;
- ferramentas 2D, medição, caminhos e operações topológicas;
- aplicar ou cancelar a sessão de malha.

O botão `?` ativa ajuda dos ícones. O layout pode ser redimensionado e
personalizado; preferências de apresentação pertencem ao navegador, não ao
arquivo do projeto.

### Painéis

Painéis como Inspector, Câmera, Render, Console e Editar podem coexistir. Em
telas pequenas, feche os que não estiver usando. No Inspector, grupos de
propriedades e a seção **Comportamento** começam recolhidos; editar um campo
abre o grupo correspondente. A posição e o colapso de um painel são estado de
interface e não aparecem no undo.

### Paleta de comandos

Use **Comandos** na barra ou `Ctrl+P` (`Cmd+P` no macOS). Digite parte do nome,
ID, categoria ou atalho. Ações de interface são executadas diretamente. Um
comando do runtime que possa exigir parâmetros é aberto no Console, sem ser
executado silenciosamente com argumentos ausentes. Use as setas para navegar,
`Enter` para escolher e `Esc` para fechar.

Use **Recursos** na barra ou `Ctrl+F` (`Cmd+F` no macOS) para localizar objetos
e assets sem percorrer a árvore inteira. A busca aceita texto livre e filtros
como `type:camera`, `type:path`, `type:material`, `name:raposa`, `id:fox-1` e
`hidden:true`. Tocar num objeto o seleciona pelo comando público. Um material,
textura ou aparência abre sua consulta no Console, pois assets compartilhados
não equivalem a um único objeto selecionável.

## 5 - Primeiro percurso

1. Abra a URL comum. O projeto demo deve carregar e entrar em jogo.
2. Ande, corra e pule; depois pressione **Sair do jogo**.
3. Escolha **Selecionar** e toque ou clique num objeto.
4. Escolha **Mover** e arraste uma alça do gizmo.
5. Pressione **Desfazer local** e **Refazer local**.
6. Abra **Criar**, escolha uma geometria e posicione-a.
7. Abra **Inspector** e altere a cor.
8. Pressione **Salvar** e guarde o arquivo `.spatialseed`.

Esse percurso verifica carregamento, projeção, seleção, mutação, histórico e
transporte de arquivo sem exigir o console.

## 6 - Navegar e selecionar

### Navegação

Use a ferramenta **Navegar** quando quiser mover a câmera sem iniciar uma
operação editorial. Mouse e toque são mediados pelo viewer. Durante ferramentas
de desenho, pan e pinch continuam disponíveis conforme a arbitragem de
ponteiros; gestos com mais dedos podem ser reservados à órbita.

### Seleção direta

Com **Selecionar**, toque ou clique num objeto. O painel de status informa a
quantidade e o membro ativo. A seleção pertence ao editor e não é salva como
parte do mundo.

### Operações de seleção

| Operação | Efeito |
| --- | --- |
| Substituir | troca a seleção pelo resultado do gesto |
| Adicionar | inclui o resultado |
| Remover | exclui o resultado da seleção atual |
| Alternar | inclui membros ausentes e remove membros presentes |

Use seleção única para trabalho direto e múltipla para operações em lote.

### Gestos de área

O HUD e a barra oferecem:

- retângulo;
- pincel;
- laço;
- borracha.

O gesto captura uma intenção geométrica e resolve o conjunto de objetos de modo
atômico. O índice espacial reduz o custo de consultar a cena inteira em cada
movimento.

### Grupos

Um grupo selecionado pode ser tratado como raiz rígida. Algumas operações
oferecem escopo direto ou expansão explícita em objetos renderizáveis. Não
presuma que selecionar um grupo equivale a editar todos os descendentes.

## 7 - Mover, girar e escalar

### Escolher a ferramenta

Use a barra ou o HUD para ativar mover, girar ou escalar. O gizmo mostra alças
por eixo e, quando aplicável, por plano ou combinação uniforme.

### Frames

| Frame | Interpretação |
| --- | --- |
| Mundo | eixos globais da cena |
| Local | eixos do objeto ou contexto ativo |
| Viewer | eixos derivados da vista atual |
| Plano personalizado | base do plano ativo de autoria |

O frame orienta a transformação. Ele não é o mesmo que plano de desenho nem
trava de visualização 2D.

### Pivô

Políticas comuns:

- mediana;
- centro dos limites;
- objeto ativo;
- posição personalizada.

**Editar pivô** muda o ponto de manipulação, não a geometria do objeto. Um pivô
personalizado pode ser movido pelo HUD e usado em rotação, escala e repetição.

### Snap e travas

Configure passos de grade, ângulo e escala no HUD. Travas podem limitar a
operação a eixos, plano ou ponto. Verifique o indicador do contexto antes de
arrastar; um gizmo aparentemente parado pode estar corretamente bloqueado por
uma restrição ativa.

### Preview e commit

Durante o arrasto, o renderer mostra um preview. Ao concluir, no máximo um
comando persistente entra no sandbox e no histórico. Cancelar descarta o preview
sem mutar o documento.

## 8 - Duplicar, repetir e agrupar

### Duplicação simples

Selecione um objeto ou grupo e pressione **Duplicar**. A cópia inicia uma
sequência de repetição. Transformações confirmadas depois da duplicação compõem
uma matriz delta.

### Repetir

Pressione **Repetir** para aplicar novamente a transformação composta. No
console:

```text
duplicate
move 2 0 0
rotate 0 15 0
repeat count 12
```

O lote é preparado antes da publicação e entra como uma operação editorial.

### Agrupar e desagrupar

**Agrupar** cria uma unidade lógica com transformações locais. **Desagrupar**
remove um nível sem deslocar os filhos no espaço mundial. Grupos aninhados são
permitidos, mas recursos e ocorrências podem usar resolução hierárquica; teste
o preview quando combinar grupos, instâncias e animação.

## 9 - Criar geometrias e luzes

### Painel Criar

Abra **Criar**, escolha uma família, ajuste os parâmetros e use o posicionamento
no viewer. O catálogo é fornecido pelo `GeometryRegistry`; a lista exata deve
ser consultada na versão carregada.

Famílias comuns incluem caixa, esfera, cilindro, cone, plano, polígono,
cápsula, círculo, anel, toro, nó toroidal, poliedros, revolução, tubo, forma,
extrusão e buffer.

### Colocação

Uma geometria pode ser definida em:

- planos mundiais XY, XZ ou YZ;
- plano ativo;
- base formada por origem, normal e tangente;
- três pontos;
- objeto, face ou superfície capturada.

O preview de posicionamento é local. Confirme para criar o objeto ou cancele
para não alterar o projeto.

### Criação pelo console

```text
create box size 2 1 3 color #4488ff
create sphere radius 0.5 origin 2 1 0
create polygon sides 6 radius 2 plane xz
```

Consulte `help create` para parâmetros efetivos.

### Luzes

O workspace Editar oferece criação de luz com valores memorizados. Luzes são
objetos persistentes: podem ser selecionadas, transformadas e salvas. As
preferências gerais de renderização do viewer, por outro lado, permanecem
locais.

## 10 - Usar o plano ativo e ferramentas 2D

### Plano ativo

O SpatialSeed apresenta um único plano ativo de autoria. Ele alimenta criação,
formas 2D, caminhos, medição e gestos de malha. Fontes possíveis incluem:

- viewer;
- XY, XZ ou YZ mundial;
- objeto;
- face;
- três pontos;
- superfície;
- helper personalizado.

**Definir e travar** captura a fonte atual. **Editar helper** permite mover ou
girar o plano. **Liberar plano ativo** retorna ao fallback.

### Formas 2D

O HUD contém ponto, segmento, polilinha, retângulo, círculo, arco e polígono.
Polilinhas possuem ações de concluir, remover último ponto e cancelar.

Essas formas preservam um esboço semântico independente da malha usada para
exibi-las. Um círculo fechado pode servir posteriormente como perfil.

### Medição

Régua e transferidor usam o plano ativo. Medições pertencem ao viewer e servem
de referência durante a autoria; não devem ser confundidas com cotas
persistentes de CAD, ainda pretendidas.

## 11 - Caminhos, tubos, varreduras e distribuição

### Referências espaciais

Objetos podem oferecer papéis de caminho, perfil ou pontos. A resolução produz
snapshots tipados; nesta geração, alterações posteriores na fonte não regeneram
automaticamente todos os resultados como um modificador vinculado.

### Tubo

Selecione ou forneça um caminho e crie um tubo. Ajuste raio, segmentos e
fechamento. A linha central de uma geometria compatível pode ser reutilizada.

### Varredura

Uma varredura recebe perfil e caminho em slots distintos. O frame usa transporte
paralelo para reduzir torção artificial. Verifique orientação, tampas e twist.

### Distribuição ao longo de caminho

Uma seleção pode ser repetida ao longo de um caminho com alinhamento e twist.
No modo desenhado, o gesto cria instâncias progressivamente conforme a distância
acumulada supera o espaçamento configurado.

### Extrusão por caminho

Na edição de malha, `mesh.extrude` aceita:

- normal e distância;
- reta entre início e fim do arrasto;
- polilinha desenhada;
- caminho explícito fornecido por comando.

O preview topológico sempre parte do snapshot-base do gesto. Movimentos de
ponteiro não acumulam extrusões independentes.

## 12 - Editar uma malha

### Entrar na sessão

Selecione um objeto compatível e pressione **Editar** ou **Editar seleção**. A
sessão isola uma malha de trabalho e possui histórico interno. O documento só é
substituído quando você pressiona **Aplicar**.

### Modos de componente

Escolha vértices, arestas ou faces. As operações de seleção incluem todos,
nenhum, inverter, expandir, contrair, conectados e contorno.

### Transformação de componentes

Mover, girar e escalar usam o mesmo contexto de frames, eixos, snap e
proporcionalidade do workspace. A influência proporcional afeta vizinhos
durante o preview conforme as opções da sessão.

### Operações disponíveis

Conforme o modo e a seleção, o HUD expõe:

- criar vértice, aresta ou face;
- preencher contorno;
- soldar;
- extrudar;
- inset;
- dividir ou colapsar aresta;
- inverter diagonal;
- ponte entre contornos compatíveis;
- subdividir;
- inverter ou recalcular normais;
- criar caminho da seleção;
- limpeza da malha.

Nem toda combinação topológica é válida. Uma operação deve falhar sem publicar
resultado parcial quando seus pré-requisitos não forem satisfeitos.

### Undo interno e undo do projeto

Use o undo interno enquanto a sessão está aberta. **Aplicar** transforma o
resultado final em uma única alteração editorial; depois disso, o undo global
pode restaurar a geometria anterior. **Cancelar** descarta a sessão.

### Limites

Knife, bisect, atributos por canto, UV avançado, booleanas robustas e reparo
geral de auto-interseção ainda não formam um conjunto estável completo.

## 13 - Aparência e Inspector

### Edição literal

Selecione objetos, abra **Inspector**, altere uma propriedade e aplique. O
Inspector distingue valor uniforme, misto e propriedade não suportada.

Geometrias paramétricas preservadas, como extrusão, tubo, esfera e lathe,
também publicam no Inspector os parâmetros declarados pelo próprio provider.
Por exemplo, uma extrusão expõe profundidade, passos e bisel. Aplicar vários
campos produz uma única operação de undo; salvar e reabrir preserva os valores.

Propriedades comuns:

- nome;
- posição, rotação e escala;
- cor, opacidade e transparência;
- textura, repetição, deslocamento, rotação e wrapping;
- cor por instância;
- parâmetros específicos de geometria ou luz;
- JSON estruturado para contornos, pontos, furos e outros parâmetros compostos.

### Aplicação procedural em lote

Expressões podem calcular um valor por alvo. Exemplo:

```text
property batch instance.color "hsl(300*u,0.8,0.55)" scope=renderables
property batch transform.position "x; y + 2*sin(tau*u); z"
property batch transform.scale "1; 0.5 + u; 1"
```

O programa é compilado antes da mutação. Se qualquer alvo falhar, o lote inteiro
é rejeitado.

### Camadas de cor

O Inspector distingue **Cor-base do material**, **Fonte da cor**, **Cor
uniforme**, **Matiz final**, **Cor própria da instância** e **Cor efetiva**. A
cor-base pertence ao material compartilhável. A fonte escolhe entre herdar essa
base, usar uma cor uniforme ou obter cor por instância. O matiz é multiplicado
ao resultado; a cor efetiva é somente leitura e mostra a composição vigente.

A cor exibida no HUD pode atuar sobre a ferramenta, a seleção ou ambas, conforme
o campo **Aplicar em**. A cor da ferramenta vale para objetos criados em
seguida; ela não é uma quarta cor persistente do objeto.

### Copiar e colar propriedades

No Inspector, escolha um preset e pressione **Copiar**. **Rotação e escala** é o
preset inicial e não move o destino. **Posição absoluta** fica separado e avisa
que os objetos podem ficar coincidentes. Material e cor-base, textura, regra e
matiz de cor, cor própria da instância e aparência completa também são presets
distintos.

Depois de selecionar o destino, abra **Confirmar propriedades**. Cada linha
mostra o valor da origem, o valor atual do destino e uma caixa de seleção.
Propriedades incompatíveis, não editáveis em lote ou já iguais ficam
desativadas. Marque apenas o que deseja substituir e pressione **Aplicar
propriedades marcadas**. A aplicação confirmada produz uma única entrada de
undo/redo.

Texturas incorporadas não exibem o conteúdo Base64 nessa prévia. O Inspector
mostra apenas o MIME type e o tamanho aproximado, por exemplo
`image/png incorporada · 128 KiB`; o valor real permanece intacto no clipboard
tipado e só é transferido após confirmação.

No console, use `property presets`, `property copy transform`, `property
clipboard` e `property paste all`. Para restringir a colagem, informe IDs, por
exemplo `property paste transform.rotationDeg transform.scale`. A cópia é local
à sessão e não depende de permissão do clipboard do sistema.

No Console, `resource search raposa`, `resource search type:camera` e
`resource search type:path hidden:false` usam o mesmo índice da interface.
`resource select object-id` seleciona um objeto encontrado.

## 14 - Salvar, abrir e recuperar

### Salvar

Pressione **Salvar**. Quando a File System Access API estiver disponível, o
navegador pode permitir escolher e reutilizar um arquivo. Em ambientes móveis,
o fallback produz download.

O arquivo `.spatialseed` representa o projeto lógico. Câmera de navegação,
seleção, painéis, animação efêmera e estado físico do jogo não são gravados como
quadros.

### Abrir

Pressione **Abrir** e escolha um projeto. A substituição integral cancela
sessões transitórias antes de instalar a nova cena. Uma falha operacional deve
ser apresentada de forma recuperável sempre que possível.

### Novo

**Novo** cria uma cena independente na aba atual. O menu de viewers também pode
abrir um novo projeto em outra aba.

### Recuperação local

O navegador mantém checkpoint e journal de comandos confirmados. Ao detectar
rascunho recuperável, a aplicação oferece:

- Continuar;
- Exportar cópia;
- Descartar.

Recuperação local não substitui salvar um arquivo. Ela também não deve persistir
previews, seleção, câmera ou jogo.

Ao recarregar depois de editar, o diálogo de recuperação deve permanecer
visível e operável. **Continuar** restaura o projeto e abre a interface de
autoria, sem reativar o modo jogo. **Descartar** remove o rascunho daquela
origem e permite que o projeto demo volte a ser o fallback. Não é necessário
apagar cache ou dados do site para sair desse fluxo.

## 15 - Importar e exportar STL

### Importar

Use **Importar STL**. O codec aceita STL ASCII ou binário. Por padrão, vértices
coincidentes são reunidos com tolerância proporcional à diagonal da geometria.
STL não informa unidade; ajuste a escala explicitamente quando necessário.

O resultado se torna um descritor `buffer` editável.

### Exportar

Selecione um ou mais objetos e use **Exportar STL**. A exportação materializa a
superfície final, aplica transformações mundiais e agrega os triângulos.

STL não preserva:

- materiais;
- UV;
- hierarquia;
- animações;
- identidade topológica semântica.

Use STL como transporte de superfície, não como formato mestre do projeto.

## 16 - Console e linguagem afim

### Começar pela ajuda

```text
help
help create
help camera
help tool
procedure help
```

A ajuda da versão carregada tem precedência sobre listas estáticas.

### Comandos editoriais

```text
create box size 1 2 3
position 0 1 0
move 2 0 0
rotate 0 30 0
scale 1 2 1
duplicate
repeat
group Estrutura
ungroup
delete
undo
redo
```

### Séries afins

Expressões conhecem `i`, `u`, `count`, posição e escala correntes, constantes e
funções matemáticas:

```text
create sphere radius 0.3 count 40 move "4*cos(i*pi/20)" 0 "4*sin(i*pi/20)"
duplicate count 24 move "3*cos(i*pi/12)" 0 "3*sin(i*pi/12)"
```

`i` começa em 1. `u` percorre o intervalo normalizado de 0 a 1. Rotações
editoriais usam graus; trigonometria comum usa radianos, salvo funções com
sufixo `d`.

### Planejamento por JavaScript

`calc` e `program` executam JavaScript síncrono num Worker isolado por SES. O
programa não recebe DOM, rede ou acesso irrestrito à cena. Quando autorizado,
`spatial.create` produz intenções num plano pendente.

```text
calc sqrt(3 ** 2 + 4 ** 2)
program return spatial.create("box", {size:[2,8,2],position:[0,4,0]})
plan status
plan commit
```

`plan commit` valida revisão e lote antes da publicação. `plan discard` descarta
sem efeito.

### Procedimentos

```text
procedure define tower ({height=8}={}) => spatial.create("box",{size:[2,height,2],position:[0,height/2,0]})
procedure run tower {"height":12}
plan commit
procedure export
```

Importar uma biblioteca armazena fonte; não executa automaticamente.

## 17 - Criar comportamentos por evento

O fluxo atual liga um fato a um comando permitido sem anexar JavaScript livre
ao objeto. Para criar um comportamento sem teclado:

1. selecione exatamente um objeto;
2. abra **Inspector** e expanda **Comportamento**;
3. toque em **+ Evento → ação**;
4. escolha **Quando**, **Fazer** e os parâmetros exibidos;
5. toque em **Adicionar**.

Cada linha pode ser desativada pela caixa de seleção ou removida. A alteração
entra no mesmo histórico de undo/redo do projeto e é preservada ao salvar e
abrir o arquivo `.spatialseed`.

Eventos disponíveis nesta primeira versão:

| Evento | Momento |
| --- | --- |
| `app.start` | runtime web terminou de preparar a aplicação |
| `game.start` | sessão de jogo começou |
| `game.stop` | sessão de jogo terminou |
| `character.jump` | personagem iniciou um salto |
| `character.land` | personagem voltou ao apoio |
| `character.respawn` | personagem foi reposicionado |

As ações publicadas incluem iniciar ou encerrar o jogo, respawn, tocar ou parar
música, tocar um efeito, iniciar um preset de animação e parar a animação. A
lista do diálogo vem do catálogo real de comandos: um comando só aparece se
declarar explicitamente que pode ser usado como ação.

Um teste simples em toque é configurar **Ao iniciar a aplicação → Animar este
objeto com preset**, informar `spin`, salvar e recarregar. Após a recuperação do
projeto, o objeto deve girar. Se o navegador ainda estiver sob um service worker
antigo, use **Atualizar agora** antes de avaliar o resultado.

No Console, com um objeto selecionado:

```text
interaction catalog
interaction list
interaction add app.start animation.preset '{"id":"spin"}'
interaction emit app.start
interaction help
```

`$self` resolve o objeto proprietário; a reentrada imediata do mesmo binding é
bloqueada. Clique, colisão e mudança de propriedade ainda não são gatilhos;
bindings entre propriedades, prefabs, scripts por objeto e exportação autônoma
são próximos contratos, não recursos concluídos.

## 18 - Animação efêmera

### Presets

Selecione objetos e abra **Animação** ou use:

```text
animate spin speed=45 axis=y
animate orbit radius=4 speed=30 axis=y
animate wave amplitude=1 frequency=0.5 mode=objects
animate rainbow speed=60 saturation=0.8 mode=objects
animate status
animate stop
```

`mode=selection` trata raízes selecionadas como unidades rígidas.
`mode=objects` expande grupos em objetos renderizáveis.

### Faixas

O painel permite capturar seleções diferentes e associar presets distintos.
Todas as faixas são avaliadas numa sobreposição temporal comum.

### Persistência

Animação de preview não altera documento, undo ou arquivo. Parar deve restaurar
a projeção canônica. Uma edição persistente pode interromper ou reconciliar a
sessão conforme o contrato da operação.

### Runtime legado

`AnimationRuntime` de passo fixo permanece para regressões históricas. Novas
integrações devem usar `TemporalAnimationRuntime`. Essa distinção é técnica e
não muda o fluxo comum do painel.

## 19 - Câmera e modo somente cena

### Câmera de navegação

O painel **Câmera** controla posição, alvo derivado, projeção, near, far,
enquadramento, órbita e reset. Essa câmera pertence ao viewer e não ao documento.

### Objetos câmera

Objetos câmera são persistentes. Você pode:

- criar a partir da vista atual;
- ativar no viewer;
- selecionar e transformar;
- capturar novamente a vista;
- definir câmera padrão do documento;
- desativar e retornar à navegação livre.

Cada viewer escolhe localmente qual câmera usa.

### Modo somente cena

Esse modo oculta superfícies de autoria para apresentar a cena. Ele não é o
mesmo que modo jogo. Use o hotspot ou a ação de saída para restaurar a interface.

## 20 - Viewers locais

O painel de projetos/viewers descobre sessões da mesma origem. Uma aba pode
abrir outra conectada a um sandbox escolhido. Cada viewer conserva câmera,
seleção e painéis próprios; comandos persistentes são coordenados por revisão.

Se uma intenção foi preparada sobre revisão antiga, ela é rejeitada e o viewer
recebe o estado atual. Essa coordenação usa `BroadcastChannel`; não é
colaboração remota nem multiusuário pela internet.

Também é possível abrir novo projeto ou arquivo em outra aba sem anexá-lo à
sessão atual.

## 21 - Jogar com um personagem

### Projeto demo

Na URL comum, o manifesto demo seleciona o proxy físico. Depois de resolver a
recuperação persistente, a aplicação inicia `game.start` somente se nenhum
projeto anterior tiver sido restaurado. Se o início automático falhar, o editor
deve permanecer recuperável e registrar o erro no console.

### Iniciar manualmente

1. selecione um objeto renderizável;
2. pressione **Jogar** ou use a ação configurada;
3. use `WASD` ou setas, `Shift` e `Espaço`;
4. arraste o viewer para controlar a câmera;
5. pressione **Sair do jogo** ou `Esc`.

Em toque, arraste o botão central dentro do círculo direcional. Ângulo e
distância ao centro controlam, respectivamente, direção e intensidade; isso
também orienta a malha visual em rampas. A OBB física pode conservar por um
instante a última orientação livre quando girar o volume causaria interseção
com o piso ou uma parede. O controle permite diagonais e movimento suave;
soltar recentraliza e interrompe o movimento. Corrida e Pular conservam
ponteiros próprios e podem ser combinados com o círculo.

### Proxy físico e visual GLB

O objeto selecionado é a autoridade física. Seu frame define centro, meia
extensão e yaw. O visual GLB é projetado por uma raiz transitória independente,
com escala e alinhamento próprios. Aumentar o proxy deve aumentar o collider,
sem necessariamente aumentar a raposa ou outro rig.

As malhas do visual GLB emitem e recebem sombras quando sombras estão
habilitadas nas opções do viewer. O piso de sombra continua pertencendo ao
renderer, e não ao asset do personagem.

Use **Carregar personagem GLB** para associar um asset. Clips são vinculados a
`idle`, `walk`, `run`, `jump`, `fall` e `land` quando os nomes permitem. O painel
**Visual do personagem** fica acessível no HUD de jogo.

### Movimento e câmera

O padrão é movimento relativo à câmera. Frente/trás seguem a frente horizontal
da vista; esquerda/direita seguem a lateral. O modo mundial permanece
configurável. A câmera de terceira pessoa mantém órbita livre e recua diante de
obstáculos consultados no mundo de colisão.

### Colisão

O mundo estático usa broad phase espacial. A narrow phase pode representar:

- caixa local;
- esfera analítica válida;
- malha triangular final.

O personagem usa OBB orientada pelo próprio yaw, enquanto a AABB conservadora
fica restrita à busca ampla. A cinemática inclui gravidade, aceleração, atrito,
pulo, tolerância de borda, apoio, subida curta, aderência a rampas transitáveis,
deslizamento em paredes e respawn. Ela ainda não é um motor geral de corpos
rígidos: rampas acima do limite configurado e contatos dinâmicos não são
resolvidos como física completa.

Toque em **Colisão** no HUD de jogo para ativar o diagnóstico. O body OBB real
do personagem fica verde quando `grounded` e vermelho no ar. Caixas locais são
azuis, esferas são violetas e envelopes de broad phase de malhas triangulares
são laranja. Pontos amarelos e setas vermelhas mostram contatos e suas normais.
O contador no topo indica quantos contatos foram publicados no frame. O overlay
é efêmero, limitado aos 160 colisores mais próximos e não é salvo no projeto.

### Áudio e eventos

`game.start` dispara semanticamente a música. Como navegadores podem bloquear
autoplay, a camada web tenta novamente no primeiro gesto de teclado, HUD ou
ponteiro. Salto e aterrissagem podem disparar efeitos.

Comandos úteis:

```text
game status
game start
game stop
game respawn
game collision debug set {"enabled":true}
game config set {"controls":{"movementReference":"camera"}}
game config set {"character":{"stepHeight":0.35}}
game config set {"character":{"groundSnapDistance":0.3}}
game config set {"character":{"maximumSlopeDegrees":50}}
```

O estado físico é efêmero: sair do jogo restaura autoria, câmera e projeção.

## 22 - Diagnóstico e testes

### Perfil diagnóstico

Abra:

```text
https://127.0.0.1:8082/apps/web/?application=diagnostics
```

No console:

```text
runtime test help
runtime test all
runtime resources
runtime performance
```

O perfil normal evita carregar módulos diagnósticos desnecessários.

### Gates locais

Na raiz do checkout:

```bash
python3 tools/run_current_gates.py
```

Gates verificam arquitetura, PWA, alcançabilidade e regressões específicas. Um
gate verde não substitui o teste visual de interações, PWA, animação ou jogo.

### Aviso ESM no Node

Node pode emitir `MODULE_TYPELESS_PACKAGE_JSON` porque vários arquivos `.js`
são ESM sem `type: module` no escopo do pacote. O runner reparsa os arquivos. A
normalização foi adiada para não alterar scripts legados sem auditoria.

## 23 - Solução de problemas

### O build exibido não mudou

- confira `apps/web/build-info.json` na árvore servida;
- confirme que o servidor foi iniciado no checkout correto;
- veja build publicado e controlador no status;
- use **Atualizar agora**;
- feche todas as janelas e reabra;
- não publique código diferente sob o mesmo build.

### Atualizar agora está desabilitado

Isso é normal quando o controlador já coincide com o build publicado. Se você
alterou código sem alterar o build, o sistema não possui um identificador novo
para comparar.

### Tela de erro persistente

Copie o erro e a saída do console. Teste `?project=new` para separar falha do
projeto demo de falha do runtime. Use **Reparar atualização** se o status PWA
indicar controlador incompatível.

### Objeto não seleciona

- ative a ferramenta Selecionar;
- verifique se o modo jogo ou somente cena está ativo;
- confira operação de seleção e modo objeto/componente;
- saia da edição de malha se pretende selecionar outro objeto;
- desative uma trava ou ferramenta que ainda possua o gesto.

### Gizmo move a câmera

Confirme a ferramenta ativa e se o ponteiro foi capturado pela alça. Em toque,
gestos de navegação e edição são arbitrados por quantidade de ponteiros; tente
um gesto isolado e verifique o HUD.

### Personagem penetra paredes

Confira o tamanho e orientação do proxy físico, não apenas o visual GLB. Um
quadrúpede pode ser mais longo em +X que em +Z. A projeção conservadora do corpo
muda com yaw.

### Música não começa

Interaja com teclado, HUD ou viewer para liberar áudio. Verifique
`game.audio.status` e se os assets estão disponíveis na origem.

<!-- PDF_PAGE_BREAK -->

### Teste do Node não executa

No Termux:

```bash
pkg install nodejs-lts
```

Depois, execute novamente o teste específico. Node não é necessário para abrir
o aplicativo web.

## 24 - Atalhos e hábitos seguros

Atalhos comuns incluem undo/redo, duplicar, excluir, enquadrar e ferramentas de
navegação/transformação. O perfil efetivo pode ser configurável; campos de texto
preservam atalhos de edição próprios. Consulte a interface e `help` antes de
depender de uma tecla numa branch diferente.

Hábitos recomendados:

1. confirme o build antes de testar;
2. salve um projeto antes de operações extensas;
3. use preview e cancelar quando explorar;
4. diferencie undo interno da malha e undo global;
5. rode o gate específico e depois a suíte completa;
6. registre dispositivo, navegador, cenário e amostras em benchmarks;
7. trate documentos de build antigos como histórico, não como manual atual.

## 25 - O que ainda não prometer

Esta edição não afirma que o SpatialSeed já oferece:

- servidor colaborativo ou edição multiusuário remota;
- física geral com corpos rígidos, constraints e rede;
- CAD topológico completo;
- booleanas robustas para qualquer malha;
- modificadores procedurais vinculados e regeneração universal;
- bindings reativos entre propriedades, prefabs e exportação autônoma de applets;
- gatilhos autorais gerais de clique, colisão e mudança de propriedade;
- texto, painéis interativos e geometrias implícitas como famílias concluídas;
- compatibilidade rica completa com glTF, Collada e todos os formatos 3D;
- segurança auditada para executar plugins hostis;
- estabilidade comercial do formato de projeto.

Esses itens podem orientar a arquitetura, mas não são passos deste manual.
