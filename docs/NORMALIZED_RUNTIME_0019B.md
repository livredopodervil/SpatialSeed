# Runtime normalizado 0019b

O Sandbox passa a manter `appearanceId` em vez de material e Base64 repetidos.

O renderer ainda recebe uma projeção temporária criada por
`AppearanceRuntime.projectScene()`. Objetos com a mesma aparência recebem a
mesma referência de material legado nessa projeção.

Efeitos esperados:

- duplicações texturizadas deixam de clonar Base64;
- undo/redo e comandos ficam menores;
- abrir esquema 2 não desnormaliza a cena;
- salvar reaproveita o catálogo já carregado.

Esta etapa ainda mantém um Mesh por objeto. Dezenas de milhares de objetos
visíveis exigirão o renderer instanciado do 0019c.
