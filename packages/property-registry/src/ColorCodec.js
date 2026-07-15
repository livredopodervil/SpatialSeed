export function normalizeHexColor(value) {
  const source = String(value ?? "").trim().toLowerCase();
  const short = /^#([0-9a-f]{3})$/.exec(source);

  if (short) {
    return `#${[...short[1]].map(component => component.repeat(2)).join("")}`;
  }

  if (/^#[0-9a-f]{6}$/.test(source)) {
    return source;
  }

  throw new TypeError(
    `Cor inválida: ${value}. Use #rgb ou #rrggbb.`
  );
}
