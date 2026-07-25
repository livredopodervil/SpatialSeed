# Experimentos de estruturas algébricas

Protótipos independentes para:

- geração procedural por fórmulas;
- transformações afins cumulativas;
- números complexos;
- visualização modular e de primos;
- foco de câmera;
- importação e exportação de cenas.

Estes arquivos não fazem parte do cliente estável em `apps/web`.

O catálogo público, com maturidade, dependências e limites por arquivo, está em
`apps/web/experiments/catalog.json`.

## Convenções

- não modificar arquivos do núcleo;
- usar dependências em `vendor/`;
- manter cada protótipo executável isoladamente;
- promover código ao núcleo somente após testes;
- registrar problemas conhecidos no próprio experimento.

## Linha de base compartilhada

Desde o 0029b, os sete snapshots carregam Math.js 11.11.0 de `vendor/` e usam
`legacy-experiment-controls.js` para:

- alternar multisseleção por toque;
- selecionar todos os objetos;
- validar e aplicar os planos `near` e `far`;
- salvar com nome escolhido, por seletor nativo ou download compatível.

Depois de cada atualização das matrizes de instância, os volumes de seleção e
recorte são recalculados. A auditoria `--strict-offline` é um gate verde.

Essa camada oferece paridade operacional mínima, mas não transforma snapshots
históricos em superfícies mantidas. Novas capacidades devem nascer no runtime
canônico e não nesta camada.
