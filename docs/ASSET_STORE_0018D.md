# Asset Store 0018d

Armazenamento isolado e deduplicado de recursos por conteúdo.

## Objetivo

Evitar repetição de:

- geometrias;
- materiais;
- texturas;
- shaders;
- animações;
- outros recursos imutáveis.

Protótipos e instâncias deverão guardar apenas identificadores desses recursos.

## Identidade por conteúdo

O identificador atual usa:

```text
tipo:fnv1a64:hash
```

Exemplo:

```text
texture:fnv1a64:2be913c3...
```

A entrada é serializada canonicamente:

- chaves de objetos ordenadas;
- números finitos;
- arrays preservam ordem;
- `ArrayBuffer` e typed arrays recebem representação explícita;
- estruturas cíclicas são rejeitadas.

O algoritmo FNV-1a de 64 bits é síncrono e adequado para esta etapa local. A interface foi separada para permitir substituição posterior por SHA-256 sem alterar o `AssetStore`.

## Operações

```text
intern
get
has
retain
release
delete
findByKind
stats
export
import
```

Inserir o mesmo conteúdo duas vezes retorna o mesmo ID e aumenta apenas a contagem de referências.

## Coleta

Quando `release()` reduz a contagem a zero, o recurso é removido por padrão.

## Limites desta etapa

Nenhum arquivo existente é alterado.

Ainda não há integração com:

- `PrototypeStore`;
- arquivos `.spatialseed`;
- renderer;
- console;
- dois clientes.

A próxima etapa será um plugin de testes para validar deduplicação, referências, exportação e importação.
