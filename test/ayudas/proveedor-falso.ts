import type { MensajeModelo, ProveedorModelo, RespuestaModelo } from "../../src/modelo/tipos.js";

/**
 * Proveedor de pruebas que, a diferencia del grabado, registra lo que recibe en cada
 * llamada y permite fijar costo y motivo de parada. No llama a ningún modelo.
 */
export class ProveedorFalso implements ProveedorModelo {
  readonly nombre = "falso";
  readonly recibidos: MensajeModelo[][] = [];
  private i = 0;

  constructor(
    private readonly respuestas: string[],
    private readonly costoUsd = 0,
    private readonly motivoParada = "end_turn",
  ) {}

  async completar(_sistema: string, mensajes: MensajeModelo[]): Promise<RespuestaModelo> {
    this.recibidos.push(mensajes.map((m) => ({ ...m })));
    const texto = this.respuestas[Math.min(this.i++, this.respuestas.length - 1)];
    return {
      texto,
      uso: { entrada: 10, salida: 10, cacheEscritura: 0, cacheLectura: 0 },
      costoUsd: this.costoUsd,
      duracionMs: 1,
      modelo: "falso",
      motivoParada: this.motivoParada,
    };
  }
}
