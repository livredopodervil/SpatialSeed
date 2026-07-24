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

## Dívida conhecida

Os sete snapshots ainda carregam Math.js 11.11.0 por CDN e, portanto, não
cumprem hoje a convenção de dependências vendorizadas. A divergência está
declarada no catálogo e será removida no marco 0029b. Até lá, a auditoria normal
aceita apenas dependências externas declaradas; `--strict-offline` permanece
vermelho de forma intencional.
