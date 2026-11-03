import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** Un evento de la corrida. `t` es el tiempo en milisegundos desde el inicio de la corrida. */
export interface Evento {
  t: number;
  evento: string;
  [dato: string]: unknown;
}

/**
 * Registro de trazas de una corrida en formato JSON Lines (un evento por línea).
 * Sin archivo, guarda los eventos solo en memoria (útil en pruebas).
 */
export class Registro {
  readonly eventos: Evento[] = [];
  private readonly inicio = Date.now();

  constructor(private readonly archivo?: string) {
    if (archivo) mkdirSync(dirname(archivo), { recursive: true });
  }

  anotar(evento: string, datos: Record<string, unknown> = {}): Evento {
    const e: Evento = { t: Date.now() - this.inicio, evento, ...datos };
    this.eventos.push(e);
    if (this.archivo) appendFileSync(this.archivo, JSON.stringify(e) + "\n");
    return e;
  }

  /** Mide la duración de una etapa y la anota al terminar, aunque falle. */
  async medir<T>(etapa: string, fn: () => Promise<T> | T, datos: Record<string, unknown> = {}): Promise<T> {
    const antes = Date.now();
    try {
      return await fn();
    } finally {
      this.anotar("etapa", { etapa, duracionMs: Date.now() - antes, ...datos });
    }
  }
}
