# Arquitetura de mundo distribuído

## Níveis

```text
ViewerClient
    câmera, seleção, hover, painéis e ferramentas
            |
            | comandos editoriais
            v
EditorSession
    previews, pivôs, gizmos e manipulações transitórias
            |
            | operação final
            v
SandboxReplica
    estado especulativo, undo/redo e propostas
            |
            | CommitEnvelope
            v
RegionAuthority
    estado canônico, versão e validação
            |
            | RegionDelta
            v
SandboxReplica / viewers
            |
            | snapshot + mudanças aceitas
            v
Renderer
```

## Fronteiras de conhecimento

O ViewerClient conhece câmera, seleção, hover, painéis, ferramentas e marcadores. Não é persistente nem autoritativo.

A EditorSession conhece arrastes, previews, pivôs, vértices e manipulações transitórias. A região não recebe cada atualização intermediária.

A SandboxReplica mantém o snapshot aceito, comandos locais, undo/redo, versão-base e propostas.

A RegionAuthority mantém somente entidades persistentes, protótipos, instâncias, componentes, versões, comandos aceitos e deltas. Não conhece gizmos, seleção ou hover.

O Renderer é uma projeção derivada. Nunca altera diretamente o estado autoritativo.

## Protótipos, instâncias e copy-on-write

Objetos idênticos compartilham geometria e material por meio de protótipos. Instâncias armazenam apenas identidade, referência ao protótipo e transformação.

Ao editar apenas uma instância compartilhada, cria-se um novo protótipo derivado e apenas essa instância passa a referenciá-lo. As demais continuam no protótipo original.

Comandos previstos:

```text
instance.makeUnique
instance.setPrototype
prototype.edit
prototype.applyToAll
geometry.commit
```

## Tipos de transformação

```text
editor.preview.transform
instance.transform
selection.group.transform
prototype.geometry.transform
vertex.preview
geometry.commit
```

Manipulações editoriais intermediárias não atravessam a fronteira da região. Somente o resultado persistente final é publicado.

## Invariantes

1. Todo snapshot compartilhado é imutável.
2. Toda alteração persistente passa por comando.
3. Toda alteração aceita produz delta versionado.
4. Renderer e Viewer nunca são autoritativos.
5. A região não conhece estado transitório do editor.
6. Réplicas conhecem a versão do snapshot que possuem.
7. Protótipos são compartilhados; edição individual usa copy-on-write.
8. Sincronização distribui deltas, não o mundo inteiro.
