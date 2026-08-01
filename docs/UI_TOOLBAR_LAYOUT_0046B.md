# SpatialSeed 0046b — toolbar declarativa, perfis e edição direta

## Escopo

Este ciclo continua exclusivamente no branch `feature/0046-ui-toolbar-layout`.
A implementação não altera reducers, comandos, ferramentas, renderizadores,
geometria ou estado persistente do projeto. O pacote de UI recebe apenas uma
função `execute(commandId, arguments)` já existente.

## Documento de perfil

A chave local é `spatialseed.edit.hud.layout.v3`.

```javascript
{
  schemaVersion: "spatial-seed-hud-layout-v3",
  activeProfile: "modelagem",
  profiles: {
    modelagem: {
      label: "Modelagem",
      sections: {
        quick: {
          label: "Essenciais",
          color: "#9a6eff",
          visibility: "always",
          zone: "fixed-start",
          order: 0,
          columns: 4,
          rows: 2,
          scrollMode: "rotate",
          showHeader: true
        }
      },
      items: {
        "edit-hud-undo": {
          label: "Voltar",
          icon: "↶",
          section: "quick",
          visibility: "always",
          zone: "fixed-start",
          order: 0,
          cellWidth: 1,
          cellHeight: 1,
          command: {
            id: "history.undo",
            arguments: {}
          },
          activation: {
            mode: "momentary",
            group: null,
            activates: [],
            deactivates: [],
            activatesOnDeactivate: [],
            deactivatesOnDeactivate: [],
            onActivate: null,
            onDeactivate: null
          }
        }
      }
    }
  }
}
```

## Fronteira com o núcleo

- `edit-hud-layout` não importa módulos do núcleo.
- IDs de comandos e argumentos são dados locais do perfil.
- `null` em `command` mantém o listener nativo já instalado pelo `EditHud`.
- Um comando configurado intercepta o clique e chama a fachada `execute`.
- Relações de ativação mudam o estado visual e só alteram o núcleo quando o
  perfil também fornece comandos de ativação ou desativação.
- Erros de comandos configurados são encaminhados ao tratamento já existente
  no `EditHud`.

## Seções e células

Cada seção possui grade própria com `columns × rows`. O elemento da seção
ocupa a área correspondente na grade externa. Itens podem ocupar múltiplas
células com `cellWidth` e `cellHeight`.

Quando a capacidade é excedida:

- `rotate`: a grade interna cresce em páginas e os botões ‹ e › percorrem a
  viewport;
- `scroll`: a viewport aceita rolagem livre por toque, roda ou trackpad.

O conteúdo é movido no DOM sem clonagem, preservando listeners nativos.

## Interação direta

- toque curto: executa a ação;
- toque longo sem deslocamento: abre o editor daquele ícone;
- toque longo seguido de arrasto: move o item para outra seção ou posição;
- o modo de ajuda `?` continua prevalecendo quando está explicitamente ativo;
- hover, foco e feedback de toque curto continuam mostrando a ajuda.

## Perfis

O usuário pode criar, duplicar, renomear, remover, importar e exportar perfis.
Todos os perfis ficam no armazenamento local do dispositivo e não entram no
projeto, histórico, colaboração ou sincronização da cena.

## Invariantes de integração

1. O perfil nunca substitui a implementação de um comando.
2. Um botão sem override continua executando seu listener nativo.
3. Mover um item não o clona e não recria listeners.
4. Novos itens de branches paralelos são normalizados com valores padrão.
5. Seções desconhecidas podem ser criadas sem alterar o HTML estático.
6. A migração v2 preserva visibilidade, zona e ordem existentes.
7. O estado ativo do núcleo continua autoritativo no modo `native`.
8. Relações declarativas não são recursivas, evitando ciclos de ativação.
