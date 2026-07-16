# Configuração declarativa da interface — 0024f

A composição inicial da interface web está em
`apps/web/config/ui.default.json`. Esse manifesto não conhece comandos do
runtime: ele referencia apenas os identificadores dos controles HTML já
existentes.

## Responsabilidades

- `toolbar.primary`: controles sempre visíveis;
- `toolbar.menus`: menus e ordem dos controles;
- `toolbar.hidden`: controles preservados no HTML, mas ocultos pelo perfil;
- `panels.items`: posição e tamanho usados na primeira abertura;
- `presentation.transform`: aparência inicial do gizmo.

As posições e dimensões alteradas pelo usuário continuam persistidas no
`localStorage`. Um valor salvo tem precedência sobre o valor inicial do
manifesto. A chave de persistência também é declarada em `panels.storageKey`.

Propriedades visuais, como tamanho do gizmo e disposição de painéis, não
alteram a cena nem o formato do projeto. Snapping e transformações continuam
sob responsabilidade do editor e do renderer.

## Perfis

O campo `profile` identifica o perfil carregado. Nesta versão existe o perfil
`touch-compact`; novos manifestos podem oferecer composições para desktop,
apresentação ou acessibilidade sem duplicar a lógica dos comandos.

## Validação

O normalizador rejeita versões desconhecidas, identificadores repetidos,
âncoras inválidas e valores visuais fora dos limites. Rode:

```text
runtime test ui-configuration
runtime test all
```

O próximo incremento previsto adicionará alças de redimensionamento adequadas
a toque e importação/exportação das preferências locais.

## Extensão 0024g

O valor especial `"top": "toolbar"` ancora um painel abaixo da altura real da
barra. A altura é observada continuamente, portanto quebra de linha e zoom do
navegador não deixam o painel cobrir os controles.

`presentation.sceneExit` configura a zona de toque que restaura a interface no
modo somente cena. As opções de `corner` são `top-left`, `top-right`,
`bottom-left` e `bottom-right`; `size` é medido em pixels CSS.

## Extensão 0024h

`toolbar.layout` aceita `horizontal`, `vertical` ou `floating`. A escolha feita
no controle **Painéis → Disposição da barra** prevalece sobre o manifesto e é
persistida na chave `toolbar.storageKey`. No modo flutuante, a alça `⠿` move a
barra e sua posição também é preservada.

Os controles primários incluem seleção, seleção múltipla, mover, girar,
escalar, excluir e criar. A composição continua editável no manifesto.

Ao entrar no modo somente cena, um diálogo explica o retorno pelo canto
configurado. A opção **Não mostrar novamente** usa
`presentation.sceneExit.helpStorageKey`; a ajuda pode ser reaberta pelo menu de
painéis e a preferência pode ser desmarcada ali.

## Extensão 0024i

Os menus não se fecham ao executar um comando; isso permite repetir ações sem
reabrir o grupo. **Duplicar** e **Repetir** passam a integrar os controles
primários. O atalho legado **Caixa** fica oculto, pois a família está disponível
no painel **Criar** junto às demais geometrias.
