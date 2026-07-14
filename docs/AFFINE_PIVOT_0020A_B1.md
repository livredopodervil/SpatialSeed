# Pivô explícito na duplicação afim

A duplicação afim agora registra o pivô efetivamente utilizado.

Sintaxes:

```text
duplicate count 12 move 3 0 2 rotate 0 15 15 pivot median
duplicate count 12 move 3 0 2 pivot bounds rotate 0 15 0
duplicate count 12 pivot active rotate 0 15 0
duplicate count 12 pivot absolute 1 1 0 rotate 0 15 0
duplicate count 12 pivot relative 1 1 0 rotate 0 15 0
```

Sem cláusula `pivot`, o comando resolve e registra a política atual do editor.
