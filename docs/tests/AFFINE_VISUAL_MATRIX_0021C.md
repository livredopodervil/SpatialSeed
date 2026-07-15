# Ensaios visuais do gerador afim — 0021c

Use uma caixa unitária isolada antes de cada ensaio.

## V01 — linha unitária
`duplicate count 10 move 1 0 0`

Centros esperados: x=1,...,10.

## V02 — semente escalada
Escale a semente para 4,4,4 e execute:
`duplicate count 10 move 0 1 0`

A distância entre centros deve permanecer 1.

## V03 — contas de colar
`duplicate count 41 move 1 0 0 scale "0.2+0.8*abs(sin(u*pi))" "0.2+0.8*abs(sin(u*pi))" "0.2+0.8*abs(sin(u*pi))"`

Esperado: pequena → grande → pequena, com espaçamento constante.

## V04 — cinco ondas
`duplicate count 101 move 0.5 0 0 scale "0.1+0.9*abs(sin(u*5*pi))" "0.1+0.9*abs(sin(u*5*pi))" "0.1+0.9*abs(sin(u*5*pi))"`

Esperado: cinco lóbulos sem crescimento exponencial.

## V05 — escala assinada
`duplicate count 21 move 1 0 0 scale "cos(u*pi)" 1 1`

Esperado: +1 → 0 → -1.

## V06 — rotação e passo
`duplicate count 12 move 1 0 0 rotate 0 30 0`

Cada segmento entre centros deve medir 1.

## V07 — comandos consecutivos
Execute duas vezes:
`duplicate count 5 move 1 0 0`

Nunca deve ocorrer “Objeto não encontrado”.

## V08 — paramétrico consecutivo
Execute duas vezes:
`duplicate count 20 move 0 1 0 scale "0.2+0.8*abs(sin(u*pi))" "0.2+0.8*abs(sin(u*pi))" "0.2+0.8*abs(sin(u*pi))"`

A seleção final deve existir no estado.

## Registro por ensaio

Anote primeira, central e última posição/escala, distância entre centros,
quantidade criada, seleção final, tempo, lotes, materiais e draw calls.
