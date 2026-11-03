import type { Configuracion } from "../configuracion.js";
import { ProveedorAnthropic } from "./anthropic.js";
import { ProveedorClaudeCode } from "./claude-code.js";
import { ProveedorGrabado } from "./grabado.js";
import { ProveedorOpenAI } from "./openai-compatible.js";
import { tienePrecio } from "./precios.js";
import type { ProveedorModelo } from "./tipos.js";

/** Crea el proveedor del modelo indicado en la configuración. */
export function crearProveedor(config: Configuracion, archivoRespuestas?: string): ProveedorModelo {
  // Sin precio no se puede medir el costo ni aplicar los límites de gasto: se avisa antes de
  // la primera llamada, no después de que la API ya cobró.
  if (config.llmProveedor !== "grabado" && !tienePrecio(config.llmModelo)) {
    throw new Error(
      `No hay precio para el modelo "${config.llmModelo}": agrégalo a precios.json o define LLM_PRECIO_ENTRADA_MTOK y LLM_PRECIO_SALIDA_MTOK (0 si es gratuito)`,
    );
  }
  switch (config.llmProveedor) {
    case "grabado":
      if (!archivoRespuestas) {
        throw new Error("LLM_PROVEEDOR=grabado necesita un archivo de respuestas: --respuestas archivo.json");
      }
      return ProveedorGrabado.desdeArchivo(archivoRespuestas);
    case "claude-code":
      return new ProveedorClaudeCode(config.llmModelo);
    case "anthropic":
      return new ProveedorAnthropic(config.anthropicApiKey!, config.llmModelo);
    case "openai-compatible":
      return new ProveedorOpenAI({ baseUrl: config.llmBaseUrl!, apiKey: config.llmApiKey, modelo: config.llmModelo });
  }
}
