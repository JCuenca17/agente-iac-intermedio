/** Un turno de la conversación con el modelo. */
export interface MensajeModelo {
  rol: "usuario" | "asistente";
  texto: string;
}

/** Tokens consumidos en una llamada. */
export interface UsoTokens {
  entrada: number;
  salida: number;
  cacheEscritura: number;
  cacheLectura: number;
}

export interface RespuestaModelo {
  texto: string;
  uso: UsoTokens;
  /** Costo estimado a precio de lista de la API (USD). Con claude-code no se cobra: es una medida. */
  costoUsd: number;
  duracionMs: number;
  modelo: string;
  /** Motivo de parada que informa el proveedor (end_turn, max_tokens, refusal...). */
  motivoParada: string;
}

/** Interfaz común de los tres proveedores: grabado, claude-code y anthropic. */
export interface ProveedorModelo {
  readonly nombre: string;
  completar(sistema: string, mensajes: MensajeModelo[]): Promise<RespuestaModelo>;
}

export const USO_CERO: UsoTokens = { entrada: 0, salida: 0, cacheEscritura: 0, cacheLectura: 0 };
