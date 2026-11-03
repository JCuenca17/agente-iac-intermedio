import { existsSync } from "node:fs";

/** Proveedores del modelo. Solo `anthropic` cobra, y lo hace a la cuenta dueña de la clave. */
export const PROVEEDORES = ["grabado", "claude-code", "anthropic"] as const;
export type ProveedorLlm = (typeof PROVEEDORES)[number];

/** Emuladores de AWS soportados. Los dos escuchan en el puerto 4566. */
export const EMULADORES = ["floci", "ministack"] as const;
export type Emulador = (typeof EMULADORES)[number];

export interface Configuracion {
  llmProveedor: ProveedorLlm;
  llmModelo: string;
  /** Solo se guarda cuando el proveedor es `anthropic`. */
  anthropicApiKey?: string;
  awsEndpoint: string;
  awsRegion: string;
  emulador: Emulador;
  maxIteraciones: number;
  limiteGastoUsd: number;
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

  return {
    llmProveedor,
    llmModelo: texto(entorno, "LLM_MODELO", "claude-haiku-5-5"),
    anthropicApiKey,
    awsEndpoint: texto(entorno, "AWS_ENDPOINT", "http://localhost:4566"),
    awsRegion: texto(entorno, "AWS_REGION", "us-east-1"),
    emulador: emulador as Emulador,
    maxIteraciones: numero(entorno, "MAX_ITERACIONES", 3, { entero: true, minimo: 1 }),
    limiteGastoUsd: numero(entorno, "LIMITE_GASTO_USD", 5, { entero: false, minimo: 0 }),
  };
}

/** Carga `.env` en `process.env` si existe. No falla si no hay archivo. */
export function cargarArchivoEnv(ruta = ".env"): void {
  if (existsSync(ruta)) process.loadEnvFile(ruta);
}
