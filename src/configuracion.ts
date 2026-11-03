import { existsSync } from "node:fs";

/**
 * Proveedores del modelo. `anthropic` y `openai-compatible` cobran a la cuenta dueña de la
 * clave. `openai-compatible` sirve para cualquier API con el formato de OpenAI
 * (OpenRouter, NVIDIA, Groq, Ollama local...).
 */
export const PROVEEDORES = ["grabado", "claude-code", "anthropic", "openai-compatible"] as const;
export type ProveedorLlm = (typeof PROVEEDORES)[number];

/** Emuladores de AWS soportados. Los dos escuchan en el puerto 4566. */
export const EMULADORES = ["floci", "ministack"] as const;
export type Emulador = (typeof EMULADORES)[number];

export interface Configuracion {
  llmProveedor: ProveedorLlm;
  llmModelo: string;
  /** Solo se guarda cuando el proveedor es `anthropic`. */
  anthropicApiKey?: string;
  /** URL base de la API con formato de OpenAI, sin la barra final (solo `openai-compatible`). */
  llmBaseUrl?: string;
  /** Clave de esa API (solo `openai-compatible`; no hace falta con un servidor local). */
  llmApiKey?: string;
  awsEndpoint: string;
  awsRegion: string;
  emulador: Emulador;
  maxIteraciones: number;
  limiteGastoUsd: number;
  /** Tope de gasto de todo un experimento (USD). */
  limiteGastoExperimentoUsd: number;
  /** Contenedor de Docker de Floci, para reiniciarlo si una corrida deja recursos. */
  flociContenedor: string;
}

type Entorno = Record<string, string | undefined>;

function texto(entorno: Entorno, nombre: string, porDefecto: string): string {
  const valor = entorno[nombre]?.trim();
  return valor ? valor : porDefecto;
}

function numero(entorno: Entorno, nombre: string, porDefecto: number, opciones: { entero: boolean; minimo: number }): number {
  const crudo = entorno[nombre]?.trim();
  if (!crudo) return porDefecto;
  const valor = Number(crudo);
  const valido = Number.isFinite(valor) && valor >= opciones.minimo && (!opciones.entero || Number.isInteger(valor));
  if (!valido) {
    const tipo = opciones.entero ? "un entero" : "un número";
    throw new Error(`${nombre} debe ser ${tipo} mayor o igual a ${opciones.minimo}; se recibió "${crudo}"`);
  }
  return valor;
}

/**
 * Arma la configuración a partir de variables de entorno.
 * Los valores por defecto nunca gastan dinero: el proveedor por defecto es `grabado`.
 */
export function cargarConfiguracion(entorno: Entorno = process.env): Configuracion {
  const proveedor = texto(entorno, "LLM_PROVEEDOR", "grabado");
  if (!(PROVEEDORES as readonly string[]).includes(proveedor)) {
    throw new Error(`LLM_PROVEEDOR debe ser uno de: ${PROVEEDORES.join(", ")}; se recibió "${proveedor}"`);
  }
  const llmProveedor = proveedor as ProveedorLlm;

  const emulador = texto(entorno, "EMULADOR", "floci");
  if (!(EMULADORES as readonly string[]).includes(emulador)) {
    throw new Error(`EMULADOR debe ser uno de: ${EMULADORES.join(", ")}; se recibió "${emulador}"`);
  }

  let anthropicApiKey: string | undefined;
  if (llmProveedor === "anthropic") {
    anthropicApiKey = entorno.ANTHROPIC_API_KEY?.trim();
    if (!anthropicApiKey) {
      throw new Error("LLM_PROVEEDOR=anthropic necesita ANTHROPIC_API_KEY (la clave de quien paga el consumo)");
    }
  }

  let llmBaseUrl: string | undefined;
  let llmApiKey: string | undefined;
  if (llmProveedor === "openai-compatible") {
    llmBaseUrl = entorno.LLM_BASE_URL?.trim().replace(/\/+$/, "");
    if (!llmBaseUrl) throw new Error("LLM_PROVEEDOR=openai-compatible necesita LLM_BASE_URL (por ejemplo https://openrouter.ai/api/v1)");
    if (!entorno.LLM_MODELO?.trim()) throw new Error("LLM_PROVEEDOR=openai-compatible necesita LLM_MODELO con el nombre del modelo en ese proveedor");
    llmApiKey = entorno.LLM_API_KEY?.trim() || undefined;
    const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(llmBaseUrl + "/");
    if (!llmApiKey && !local) throw new Error("LLM_PROVEEDOR=openai-compatible necesita LLM_API_KEY (la clave de quien paga el consumo)");
  }

  return {
    llmProveedor,
    llmModelo: texto(entorno, "LLM_MODELO", "claude-haiku-5-5"),
    anthropicApiKey,
    llmBaseUrl,
    llmApiKey,
    awsEndpoint: texto(entorno, "AWS_ENDPOINT", "http://localhost:4566"),
    awsRegion: texto(entorno, "AWS_REGION", "us-east-1"),
    emulador: emulador as Emulador,
    maxIteraciones: numero(entorno, "MAX_ITERACIONES", 3, { entero: true, minimo: 1 }),
    limiteGastoUsd: numero(entorno, "LIMITE_GASTO_USD", 5, { entero: false, minimo: 0 }),
    limiteGastoExperimentoUsd: numero(entorno, "LIMITE_GASTO_EXPERIMENTO_USD", 10, { entero: false, minimo: 0 }),
    flociContenedor: texto(entorno, "FLOCI_CONTENEDOR", "floci"),
  };
}

/** Carga `.env` en `process.env` si existe. No falla si no hay archivo. */
export function cargarArchivoEnv(ruta = ".env"): void {
  if (existsSync(ruta)) process.loadEnvFile(ruta);
}
