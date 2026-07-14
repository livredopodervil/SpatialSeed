# Instance color 0020b-f

Implementa cor estática por instância usando `InstancedMesh.instanceColor`.

## Modelo

```js
instanceState: {
  color: "#cc6633"
}
```

A ausência de `color` usa a cor compartilhada do material.

A seleção continua usando uma cor visual temporária. Ao deselecionar, o
renderer restaura a cor lógica da instância.

## Invariantes

- alterar cor não muda `batchKey`;
- alterar cor não cria material;
- alterar cor não cria geometria;
- um índice reutilizado recebe a nova cor;
- o estado permanece serializável;
- memória nominal adicional: 12 bytes por capacidade de instância.

## Testes esperados

A suíte `instance-batches` ganha cinco testes:

- armazenamento e atualização;
- manutenção do lote;
- reutilização de índice;
- reducer;
- 10.000 cores em um lote.

Execute também os testes existentes e faça os testes visuais descritos em
`docs/tests/INTERACTIVE_TEST_0020B_F.md`.
