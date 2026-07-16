import {
  canonicalStringify
} from "./CanonicalValue.js";

const OFFSET_HIGH = 0xcbf29ce4;
const OFFSET_LOW = 0x84222325;
const PRIME_LOW = 0x1b3;

export function contentId(
  kind,
  value
) {
  return contentIdFromCanonical(
    kind,
    canonicalStringify(value)
  );
}

export function contentIdFromCanonical(
  kind,
  canonical
) {
  const namespace =
    String(kind).trim();

  if (!namespace) {
    throw new TypeError(
      "O tipo do recurso não pode ser vazio."
    );
  }

  return (
    `${namespace}:fnv1a64:` +
    fnv1a64(canonical)
  );
}

export function fnv1a64(text) {
  const bytes =
    new TextEncoder().encode(
      String(text)
    );

  let high = OFFSET_HIGH;
  let low = OFFSET_LOW;

  for (const byte of bytes) {
    low = (low ^ byte) >>> 0;

    /*
     * Multiplicação FNV-1a de 64 bits por 0x100000001b3 usando dois
     * words de 32 bits. Evita BigInt por byte, particularmente caro
     * para texturas incorporadas em Base64, e preserva os mesmos IDs.
     */
    const originalLow = low;
    const lowProduct = (originalLow & 0xffff) * PRIME_LOW;
    const middleProduct =
      (originalLow >>> 16) * PRIME_LOW +
      (lowProduct >>> 16);
    const carry = middleProduct >>> 16;
    high = (
      Math.imul(high, PRIME_LOW) +
      carry +
      (originalLow << 8)
    ) >>> 0;
    low = (
      (lowProduct & 0xffff) |
      ((middleProduct & 0xffff) << 16)
    ) >>> 0;
  }

  return high.toString(16).padStart(8, "0") +
    low.toString(16).padStart(8, "0");
}
