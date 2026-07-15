# Superfícies de propriedades 0022b

## Resultado

O Console e o Inspector deixaram de manter implementações próprias de cor, textura e atributos do objeto. As duas superfícies consultam `properties.describe`, inspecionam `selection.properties.inspect` e publicam `selection.properties.set` ou `selection.properties.unset`.

O `PropertyRegistry` permanece como fonte autoritativa de IDs, tipos, cardinalidade e validação.

## Console

### Descobrir propriedades

```text
property list
property inspect
property inspect appearance.color
```

`property list` é gerado pelos descritores ativos. Plugins futuros podem registrar propriedades sem alterar a gramática do console.

### Aparência e cor

```text
property set appearance.color #3af
property set appearance.color #33aaff
property set appearance.opacity 0.72
property set appearance.transparent true
```

### Textura

```text
property set texture.src "https://example.org/grid.png"
property set texture.repeat 4 2
property set texture.offset 0.25 0
property set texture.rotationDeg 15
property set texture.wrap mirror
property unset texture.src
```

Uma Data URL deve ser escrita entre aspas. O separador `;` dentro das aspas pertence à URI e não encerra o comando.

```text
property set texture.src "data:image/png;base64,..."
```

### Instância

```text
property set instance.color #ff8a3d
property unset instance.color
```

Alterar `instance.color` atualiza o atributo da instância sem trocar a chave geométrica do lote.

### Transformação e geometria existente

```text
property set object.name "Torre central"
property set transform.position 10 2 -4
property set transform.rotationDeg 0 45 0
property set transform.scale 1 2 1
property set geometry.size 4 12 4
```

Nome, posição e rotação exigem seleção única. Escala, dimensões, aparência, textura e atributos de instância podem ser aplicados em lote quando todos os alvos suportam a propriedade.

## Inspector

O Inspector é construído a partir dos mesmos descritores. Para cada propriedade ele mostra:

- valor uniforme;
- valores diferentes em uma seleção múltipla;
- indisponibilidade para a família geométrica selecionada;
- restrição de cardinalidade quando a edição exige um único objeto.

Somente campos tocados pelo usuário entram no patch. Assim, aplicar uma cor a cem objetos não sobrescreve nomes, transformações ou texturas diferentes.

Campos de cor combinam entrada textual arbitrária (`#rgb` ou `#rrggbb`) e seletor visual sincronizado. Propriedades anuláveis oferecem a ação **Remover**. A textura também aceita arquivo local, convertido para Data URL pelo painel antes do comando comum.

## Atomicidade

Uma aplicação do Inspector pode combinar vários campos e vários objetos, mas produz uma única entrada de histórico. O Console usa exatamente o mesmo serviço e as mesmas garantias:

1. todos os valores são interpretados e normalizados antes da mutação;
2. a seleção é resolvida para IDs explícitos;
3. qualquer erro rejeita a operação inteira;
4. valores já vigentes não criam histórico;
5. undo e redo tratam a edição como uma unidade.
