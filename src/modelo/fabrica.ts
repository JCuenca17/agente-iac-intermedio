import type { Configuracion } from "../configuracion.js";
import { ProveedorAnthropic } from "./anthropic.js";
import { ProveedorClaudeCode } from "./claude-code.js";
import { ProveedorGrabado } from "./grabado.js";
import type { ProveedorModelo } from "./tipos.js";

/** Crea el proveedor del modelo indicado en la configuración. */
export function crearProveedor(config: Configuracion, archivoRespuestas?: string): ProveedorModelo {
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
  }
}
