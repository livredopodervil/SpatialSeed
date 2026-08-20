const PORTABLE_BINARY_ENCODING = "base64";

export function portableBinaryValue(data, {
  mediaType = "application/octet-stream"
} = {}) {
  const bytes = toUint8Array(data);
  return Object.freeze({
    encoding: PORTABLE_BINARY_ENCODING,
    mediaType: String(mediaType || "application/octet-stream"),
    data: encodeBase64(bytes),
    bytes: bytes.byteLength
  });
}

export function portableBinarySource(record, {
  filename = null
} = {}) {
  if (!record || record.kind !== "binary") {
    throw new TypeError("Asset binário portátil inválido.");
  }
  const value = record.value ?? {};
  if (value.encoding !== PORTABLE_BINARY_ENCODING || typeof value.data !== "string") {
    throw new TypeError("Codificação do asset binário portátil inválida.");
  }
  const bytes = decodeBase64(value.data);
  return Object.freeze({
    data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    filename: filename ?? record.metadata?.filename ?? null,
    mediaType: String(value.mediaType ?? "application/octet-stream")
  });
}

export function validatePortableBinaryRecord(record) {
  portableBinarySource(record);
  const declared = Number(record.value?.bytes);
  if (!Number.isInteger(declared) || declared < 0) {
    throw new TypeError("Tamanho do asset binário portátil inválido.");
  }
  const actual = decodeBase64(record.value.data).byteLength;
  if (actual !== declared) {
    throw new Error(
      `Tamanho do asset binário incompatível: declarado ${declared}, recebido ${actual}.`
    );
  }
  return true;
}

function toUint8Array(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new TypeError("Asset binário exige ArrayBuffer ou TypedArray.");
}

function encodeBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
    binary += String.fromCharCode(...chunk);
  }
  if (typeof globalThis.btoa === "function") return globalThis.btoa(binary);
  if (typeof globalThis.Buffer !== "undefined") {
    return globalThis.Buffer.from(bytes).toString("base64");
  }
  throw new Error("Codificador Base64 indisponível.");
}

function decodeBase64(text) {
  let binary;
  if (typeof globalThis.atob === "function") {
    binary = globalThis.atob(String(text));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  if (typeof globalThis.Buffer !== "undefined") {
    const buffer = globalThis.Buffer.from(String(text), "base64");
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  throw new Error("Decodificador Base64 indisponível.");
}
