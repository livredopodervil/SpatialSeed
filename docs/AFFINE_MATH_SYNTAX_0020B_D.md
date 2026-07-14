# SpatialSeed Math Syntax 0020b-d

Gramática imediata inspirada em Python/SymPy:

- potência canônica: `**`;
- `^` aceito como alias e normalizado para `**`;
- funções exigem parênteses;
- trigonometria comum usa radianos;
- `sind`, `cosd` e `tand` usam graus;
- unidades explícitas: `deg`, `rad`, `turn`;
- AST e expressão normalizada são preservadas;
- nomes e funções são resolvidos somente em listas permitidas;
- backend numérico pode ser substituído sem mudar o parser.

Acesso arbitrário como `objeto.propriedade` não faz parte da gramática.
