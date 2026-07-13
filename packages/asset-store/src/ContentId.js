import {
  canonicalStringify
} from "./CanonicalValue.js";

const OFFSET =
  0xcbf29ce484222325n;
const PRIME =
  0x100000001b3n;
const MASK =
  0xffffffffffffffffn;

export function contentId(
  kind,
  value
) {
  const namespace =
    String(kind).trim();

  if (!namespace) {
    throw new TypeError(
      "O tipo do recurso não pode ser vazio."
    );
  }

  const canonical =
    canonicalStringify(value);

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

  let hash = OFFSET;

  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash =
      (hash * PRIME) & MASK;
  }

  return hash
    .toString(16)
    .padStart(16, "0");
}
