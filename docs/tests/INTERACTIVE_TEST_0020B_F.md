# Teste interativo 0020b-f

1. Abra o Inspector e selecione uma caixa.
2. Marque `Usar cor própria`.
3. Escolha uma cor distinta e aplique.
4. Selecione e deselecione o objeto. A seleção deve destacar temporariamente
   e a cor própria deve reaparecer.
5. Duplique o objeto. A cópia deve preservar `instanceState.color`.
6. Altere apenas a cor da cópia. `runtime resources` deve manter o mesmo
   número de lotes e materiais.
7. Execute `undo` e `redo`; a cor deve acompanhar o estado.
8. Salve e reabra o projeto; a cor deve persistir.

Registre:

- `runtime test instance-batches`;
- `runtime test all`;
- `runtime resources` antes e depois de mudar a cor;
- tempo do teste `dez mil cores mantêm um único lote`.
