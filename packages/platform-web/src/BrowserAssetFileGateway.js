export class BrowserAssetFileGateway {
  static apiVersion = "browser-asset-files-v1";

  constructor({
    windowRef = window,
    documentRef = document,
    urlApi = URL,
    BlobCtor = Blob,
    fileType
  } = {}) {
    this.window = windowRef;
    this.document = documentRef;
    this.urlApi = urlApi;
    this.BlobCtor = BlobCtor;
    this.fileType = normalizeFileType(fileType);
    this.nativeOpenBlocked = false;
    this.nativeSaveBlocked = false;
    this.fallbackSaveApproved = false;
  }

  capabilities() {
    return Object.freeze({
      nativeOpen:
        !this.nativeOpenBlocked &&
        typeof this.window.showOpenFilePicker === "function",
      nativeSave:
        !this.nativeSaveBlocked &&
        typeof this.window.showSaveFilePicker === "function",
      fallbackOpen: true,
      fallbackSave: true
    });
  }

  async open() {
    if (!this.capabilities().nativeOpen) {
      return { opened: false, fallbackRequired: true };
    }
    try {
      const handles = await this.window.showOpenFilePicker({
        multiple: false,
        types: [this.fileType]
      });
      const handle = handles?.[0];
      if (!handle) return { opened: false, cancelled: true };
      const file = await handle.getFile();
      return { ...(await this.readFile(file)), method: "native-picker" };
    } catch (error) {
      if (isAbort(error)) return { opened: false, cancelled: true };
      if (isPlatformBlock(error)) {
        this.nativeOpenBlocked = true;
        return {
          opened: false,
          fallbackRequired: true,
          fallbackReason: error.name
        };
      }
      throw error;
    }
  }

  async readFile(file) {
    if (!file || typeof file.arrayBuffer !== "function") {
      throw new TypeError("Arquivo binário inválido.");
    }
    const data = await file.arrayBuffer();
    return Object.freeze({
      opened: true,
      filename: file.name || "asset.bin",
      data,
      bytes: Number(file.size) || data.byteLength,
      mediaType: String(file.type || "application/octet-stream"),
      method: "file-input"
    });
  }

  async save(payload, { saveAs = true } = {}) {
    const asset = normalizePayload(payload);
    if (this.capabilities().nativeSave) {
      try {
        return await this.#saveNative(asset);
      } catch (error) {
        if (!isPlatformBlock(error)) throw error;
        this.nativeSaveBlocked = true;
        return fallbackRequest(error.name);
      }
    }
    if (saveAs && this.nativeSaveBlocked && !this.fallbackSaveApproved) {
      return fallbackRequest("platform-blocked");
    }
    return this.#download(asset);
  }

  saveFallback(payload, { fallbackReason = "platform-blocked" } = {}) {
    this.fallbackSaveApproved = true;
    return this.#download(normalizePayload(payload), { fallbackReason });
  }

  async #saveNative(asset) {
    let writable = null;
    try {
      const handle = await this.window.showSaveFilePicker({
        suggestedName: asset.filename,
        types: [this.fileType]
      });
      if (!handle) return { saved: false, cancelled: true };
      writable = await handle.createWritable();
      await writable.write(asset.data);
      await writable.close();
      return {
        saved: true,
        filename: handle.name || asset.filename,
        bytes: asset.bytes,
        method: "native-picker"
      };
    } catch (error) {
      if (writable && typeof writable.abort === "function") {
        try { await writable.abort(); } catch {}
      }
      if (isAbort(error)) return { saved: false, cancelled: true };
      throw error;
    }
  }

  #download(asset, { fallbackReason = null } = {}) {
    const blob = new this.BlobCtor([asset.data], { type: asset.mediaType });
    const url = this.urlApi.createObjectURL(blob);
    const link = this.document.createElement("a");
    link.href = url;
    link.download = asset.filename;
    this.document.body.appendChild(link);
    link.click();
    link.remove();
    this.window.setTimeout(() => this.urlApi.revokeObjectURL(url), 1000);
    return {
      saved: true,
      downloaded: true,
      filename: asset.filename,
      bytes: blob.size,
      method: "download",
      fallbackReason
    };
  }
}

function normalizeFileType(value) {
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.description !== "string" ||
    !value.accept ||
    typeof value.accept !== "object"
  ) {
    throw new TypeError("Tipo de arquivo incompatível.");
  }
  return structuredClone(value);
}

function normalizePayload(payload) {
  if (!payload?.prepared || payload.data === undefined || payload.data === null) {
    throw new TypeError("Arquivo binário não preparado.");
  }
  const data = payload.data;
  const valid = typeof data === "string" ||
    data instanceof ArrayBuffer ||
    ArrayBuffer.isView(data);
  if (!valid) throw new TypeError("Conteúdo do arquivo incompatível.");
  const bytes = typeof data === "string"
    ? new TextEncoder().encode(data).byteLength
    : data.byteLength;
  return Object.freeze({
    filename: String(payload.filename || "asset.bin"),
    mediaType: String(payload.mediaType || "application/octet-stream"),
    data,
    bytes: Number(payload.bytes) || bytes
  });
}

function isAbort(error) {
  return error?.name === "AbortError";
}

function isPlatformBlock(error) {
  return ["NotAllowedError", "SecurityError", "NotSupportedError"].includes(error?.name);
}

function fallbackRequest(reason) {
  return {
    saved: false,
    fallbackRequired: true,
    fallbackReason: reason
  };
}
