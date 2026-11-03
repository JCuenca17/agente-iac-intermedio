/** Capas del validador, de la más barata a la más costosa. */
export type Capa = "C1" | "C2" | "C3" | "C4";

/**
 * Un error encontrado por alguna capa. Se usa tanto para el reporte a la persona
 * como para la retroalimentación al modelo, por eso indica dónde está el problema.
 */
export interface ErrorValidacion {
  capa: Capa;
  /** Ruta dentro del artefacto en formato JSON Pointer, por ejemplo /recursos/0/id. */
  ruta: string;
  /** Regla que se incumplió. */
  regla: string;
  mensaje: string;
}

export interface ResultadoValidacion {
  valido: boolean;
  errores: ErrorValidacion[];
}
