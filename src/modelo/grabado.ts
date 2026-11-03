import { readFileSync } from "node:fs";
import { USO_CERO, type MensajeModelo, type ProveedorModelo, type RespuestaModelo } from "./tipos.js";

/**
 * Devuelve respuestas guardadas de antemano, en orden. No llama a ningún servicio
 * y no cuesta nada: sirve para desarrollar y probar el ciclo completo.
 */
export class ProveedorGrabado implements ProveedorModelo {
  readonly nombre = "grabado";
  private siguiente = 0;

  constructor(private readonly respuestas: string[]) {}

  /** Lee un archivo JSON con la forma { "respuestas": ["...", "..."] }. */
  static desdeArchivo(ruta: string): ProveedorGrabado {
    const datos = JSON.parse(readFileSync(ruta, "utf8")) as { respuestas: unknown[] };
    return new ProveedorGrabado(datos.respuestas.map((r) => (typeof r === "string" ? r : JSON.stringify(r))));
  }

  async completar(_sistema: string, _mensajes: MensajeModelo[]): Promise<RespuestaModelo> {
    if (this.siguiente >= this.respuestas.length) {
      throw new Error(`Se acabaron las respuestas grabadas (había ${this.respuestas.length})`);
    }
    const texto = this.respuestas[this.siguiente++];
    return { texto, uso: { ...USO_CERO }, costoUsd: 0, duracionMs: 0, modelo: "grabado", motivoParada: "end_turn" };
  }
}
