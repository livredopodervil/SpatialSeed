const PROJECT_ACCEPT = Object.freeze({
  "application/json": [".spatialseed"]
});

export class BrowserProjectFileGateway {
  static apiVersion = "browser-project-files-v1";

  constructor({
    windowRef = window,
    documentRef = document,
    urlApi = URL,
    BlobCtor = Blob
  } = {}) {
    this.window = windowRef;
    this.document = documentRef;
    this.urlApi = urlApi;
    this.BlobCtor = BlobCtor;
    this.fileHandle = null;
  }

  capabilities() {
    return Object.freeze({
      nativeOpen: typeof this.window.showOpenFilePicker === "function",
      nativeSave: typeof this.window.showSaveFilePicker === "function",
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
        types: [projectFileType()]
      });
      const handle = handles?.[0];
      if (!handle) return { opened: false, cancelled: true };

      const file = await handle.getFile();
      const result = await this.readFile(file);
      this.fileHandle = handle;
      return { ...result, method: "native-picker" };
    } catch (error) {
      if (isAbort(error)) return { opened: false, cancelled: true };
      throw error;
    }
  }

  async readFile(file) {
    if (!file || typeof file.text !== "function") {
      throw new TypeError("Arquivo de projeto inválido.");
    }
    return {
      opened: true,
      filename: file.name || "projeto.spatialseed",
      text: await file.text(),
      bytes: Number(file.size) || 0,
      method: "file-input"
    };
  }

  async save(payload, { saveAs = false } = {}) {
    const project = normalizePayload(payload);
    if (this.capabilities().nativeSave) {
      return this.#saveNative(project, { saveAs });
    }
    return this.#download(project);
  }

  reset() {
    this.fileHandle = null;
  }

  async #saveNative(project, { saveAs }) {
    let writable = null;
    try {
      const handle = !saveAs && this.fileHandle
        ? this.fileHandle
        : await this.window.showSaveFilePicker({
          suggestedName: project.filename,
          types: [projectFileType()]
        });
      if (!handle) return { saved: false, cancelled: true };

      writable = await handle.createWritable();
      await writable.write(project.text);
      await writable.close();
      this.fileHandle = handle;
      return {
        saved: true,
        filename: handle.name || project.filename,
        bytes: project.bytes,
        method: "native-picker"
      };
    } catch (error) {
      if (writable && typeof writable.abort === "function") {
        try {
          await writable.abort();
        } catch {}
      }
      if (isAbort(error)) return { saved: false, cancelled: true };
      throw error;
    }
  }

  #download(project) {
    const blob = new this.BlobCtor([project.text], {
      type: project.mediaType
    });
    const url = this.urlApi.createObjectURL(blob);
    const link = this.document.createElement("a");
    link.href = url;
    link.download = project.filename;
    this.document.body.appendChild(link);
    link.click();
    link.remove();
    this.window.setTimeout(() => this.urlApi.revokeObjectURL(url), 1000);
    return {
      saved: true,
      downloaded: true,
      filename: project.filename,
      bytes: blob.size,
      method: "download"
    };
  }
}

function projectFileType() {
  return {
    description: "Projeto Spatial Seed",
    accept: PROJECT_ACCEPT
  };
}

function normalizePayload(payload) {
  if (!payload?.prepared || typeof payload.text !== "string") {
    throw new TypeError("Documento de projeto não preparado.");
  }
  return {
    filename: String(payload.filename || "projeto.spatialseed"),
    mediaType: String(
      payload.mediaType || "application/json;charset=utf-8"
    ),
    text: payload.text,
    bytes: Number(payload.bytes) ||
      new TextEncoder().encode(payload.text).byteLength
  };
}

function isAbort(error) {
  return error?.name === "AbortError";
}
