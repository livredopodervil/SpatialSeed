# Painel do desenvolvedor e console

O console executa operações seguras sobre o editor, a seleção, o sandbox e a região. Não usa `eval()`.

## Separação de comandos

Use ponto e vírgula:

```text
select box-1; inspect selection
```

ou quebra de linha:

```text
select box-1
pivot active
move 1 0 0
```

## Comandos

```text
help
inspect selection
inspect input
inspect editor
inspect sandbox
inspect region
inspect objects
list objects
select box-1
select box-1 box-2
clear
pivot median
pivot bounds
pivot active
pivot custom x y z
move dx dy dz
undo
redo
```

## Interface

- ↑ e ↓ percorrem o histórico de entrada;
- `Ctrl+Enter` executa;
- “Copiar saída” copia todo o histórico visível;
- “Copiar último” copia somente o último resultado;
- “Copiar” no diagnóstico copia o diagnóstico atual;
- as saídas são campos somente leitura, isolando “selecionar tudo”.
