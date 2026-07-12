# Camada de comandos, pivôs e teste local

## Camada canônica

Console, botões e futuras interfaces chamam os mesmos comandos:

```text
selection.duplicate
selection.rotate
pivot.relative
vertices.set
```

## Pivô relativo

`pivot relative dx dy dz` armazena um deslocamento relativo à origem mundial do objeto ativo. O pivô acompanha o objeto ativo quando ele é movido e é recalculado quando a seleção muda.

`pivot absolute x y z` permanece fixo em coordenadas mundiais.

## Vértices

Os marcadores representam os oito cantos da caixa delimitadora mundial da seleção. Eles usam pontos de oito pixels, sem teste de profundidade, para permanecerem visíveis em telas móveis.

## Teste local

```bash
bash tools/seedctl test
```

Esse comando sincroniza, verifica, reinicia o servidor em segundo plano, espera a aplicação responder e abre a URL no navegador.
