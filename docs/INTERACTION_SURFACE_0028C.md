# Superfície de interação 0028c

Status: implementado no ciclo `feature/0028-animation-runtime`.

## Objetivo

O marco 0028c introduz uma fronteira única entre intenção do usuário e
comandos existentes. Um clique, um atalho de teclado e um futuro editor de
interface passam a identificar a mesma ação semântica. A ação delega a
mutação da cena ao registro de comandos; ela não modifica diretamente o
modelo espacial.

Este marco estende, sem substituir, as superfícies configuráveis anteriores:

- `ui.default.json` continua descrevendo barra, menus, painéis e apresentação;
- `ToolbarComposer` continua oferecendo barra horizontal, vertical ou flutuante;
- `FloatingPanelManager` continua permitindo vários painéis abertos,
  redimensionados e posicionados, com persistência local;
- o editor de procedimentos continua preservando seu próprio foco e histórico.

## Contrato

`UiActionRegistry` registra ações por identificadores estáveis, como
`history.undo`, `tool.rotate` e `selection.duplicate`. Os controles HTML são
associados a esses identificadores. A configuração de atalhos usa os mesmos
identificadores:

```json
{
  "shortcuts": {
    "profile": "spatialseed",
    "storageKey": "spatialseed.ui.shortcuts.v1",
    "bindings": [
      {
        "action": "history.undo",
        "chord": "Primary+Z",
        "context": "global"
      },
      {
        "action": "tool.rotate",
        "chord": "E",
        "context": "viewport"
      }
    ]
  }
}
```

`Primary` significa Control nas plataformas usuais de PC e Command no macOS.
Atalhos de contexto `viewport` prevalecem sobre atalhos globais com a mesma
tecla. Conflitos dentro do mesmo contexto são rejeitados na carga da
configuração.

## Perfil inicial

O perfil distribuído usa:

| Atalho | Ação |
|---|---|
| `Ctrl/Cmd+Z` | desfazer |
| `Ctrl/Cmd+Shift+Z` ou `Ctrl/Cmd+Y` | refazer |
| `Q`, `S`, `W`, `E`, `R` | navegar, selecionar, mover, girar, escalar |
| `Ctrl/Cmd+D` | duplicar seleção |
| `Delete` ou `Backspace` | excluir seleção |
| `Tab` | alternar modo cena |
| `F` | alternar tela cheia do viewport |

Campos de texto, seletores e regiões editáveis não cedem seus atalhos ao
viewport. Assim, desfazer dentro do editor de catálogos continua sendo uma
operação textual.

## Persistência e extensão

O registro aceita um perfil substituto, valida-o e o persiste em
`localStorage`. A API também permite restaurar o perfil distribuído. Esta é a
base para um editor interno de atalhos; o 0028c ainda não adiciona uma segunda
interface de configuração, evitando duplicar a função do manifesto existente.

A API do registro permite que uma futura fronteira de plugins injete ações sem
conhecer a posição visual do controle. Essa injeção ainda não é publicada como
capacidade de plugin. O compositor de UI poderá, em um marco posterior, listar
as ações publicadas e associá-las a botões, menus ou atalhos personalizados.

## Limites deliberados

Este marco não altera a matemática do pivô, não introduz animação de cor e
não reorganiza os painéis. Essas mudanças dependem agora da mesma fronteira de
ações, mas devem permanecer em incrementos testáveis separados:

1. coerência modal e política de transformação individual;
2. propriedades procedurais e temporais de aparência;
3. controles de reprodução e editor visual do manifesto;
4. perfis de interface intercambiáveis e exportáveis.
