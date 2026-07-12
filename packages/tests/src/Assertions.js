export function assert(condition, message = "Falha de asserção.") {
  if (!condition) throw new Error(message);
}

export function assertEqual(actual, expected, message = "Valores diferentes.") {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${message} Esperado: ${JSON.stringify(expected)}; ` +
      `recebido: ${JSON.stringify(actual)}.`
    );
  }
}

export function assertDeepEqual(actual, expected, message = "Estruturas diferentes.") {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`${message}\nEsperado: ${right}\nRecebido: ${left}`);
  }
}

export function assertThrows(callback, message = "Era esperada uma exceção.") {
  let threw = false;
  try { callback(); } catch { threw = true; }
  assert(threw, message);
}
