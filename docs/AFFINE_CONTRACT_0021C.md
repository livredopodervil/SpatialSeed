# Contrato diagnóstico das transformações afins — 0021c

Esta atualização não altera o gerador. Ela formaliza o comportamento esperado.

Execute:

```text
runtime test affine-contract
runtime test affine-repeat
```

Falhas em `affine-contract` são esperadas nesta etapa e identificam:

- translação contaminada pela escala;
- escala paramétrica acumulada;
- seleção obsoleta após duplicações consecutivas;
- inconsistências de `u`, ordem e determinismo.
