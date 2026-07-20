import { normalizeUiConfiguration } from "../../packages/ui-config/src/index.js?build=20260720-0028c";

export async function loadUiConfiguration({
  url = "./config/ui.default.json",
  fetchImpl = fetch
} = {}) {
  const response = await fetchImpl(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Falha ao carregar configuração da UI (${response.status}).`);
  }
  return normalizeUiConfiguration(await response.json());
}
