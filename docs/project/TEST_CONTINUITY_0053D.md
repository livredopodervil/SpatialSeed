# Continuidade histórica dos testes — 0053d

A auditoria Git mostrou que conjuntos relevantes de cobertura existiram em
commits anteriores e desapareceram depois. O arquivo
`tools/test-history-manifest-0053d.json` registra 37 testes
historicamente observados no commit `6804685d`.

Neste baseline, testes ausentes são marcados explicitamente como `missing`; eles
não são tratados como aprovados nem como descartados. Cada um deve posteriormente
ser reativado ou receber `replacement` e justificativa explícita. Isso impede
que a reorganização arquitetural interprete ausência de teste como ausência de
requisito.
