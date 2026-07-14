# Runtime API 0020b-a

## Fronteira pública

Clientes acessam apenas:

- `runtime.execute(command, args)`;
- `runtime.query(query, args)`;
- `runtime.subscribe(event, listener)`;
- `runtime.capabilities()`;
- `runtime.metrics()`;
- `runtime.dispose()`.

`apps/web/main.js` deixa de construir os subsistemas. A composição está em
`apps/web/bootstrap/createWebRuntime.js`; a interface está em
`apps/web/bootstrap/bindWebInterface.js`.

## Servidor e cliente

O servidor Python continua estático. Runtime, mundo, editor, comandos,
renderer, testes e métricas continuam no navegador.

## Compatibilidade

Esta etapa não altera reducer, renderer, seleção, repetição afim,
persistência nem formato de projeto.
