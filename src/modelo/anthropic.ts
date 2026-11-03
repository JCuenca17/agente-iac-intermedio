import Anthropic from "@anthropic-ai/sdk";
import { estimarCosto } from "./precios.js";
import type { MensajeModelo, ProveedorModelo, RespuestaModelo } from "./tipos.js";

/** Lo mínimo del cliente que se usa; permite probar sin llamar a la API. */
export interface ClienteMensajes {
  messages: { create(peticion: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
}

/**
 * Llama a la API de Anthropic con la clave de quien paga el consumo.
 * El prompt de sistema va con caché para abaratar las iteraciones del ciclo.
 */
export class ProveedorAnthropic implements ProveedorModelo {
  readonly nombre = "anthropic";
  private readonly cliente: ClienteMensajes;

  constructor(
    apiKey: string,
    private readonly modelo: string,
    cliente?: ClienteMensajes,
  ) {
    this.cliente = cliente ?? new Anthropic({ apiKey });
  }

  async completar(sistema: string, mensajes: MensajeModelo[]): Promise<RespuestaModelo> {
    const inicio = Date.now();
    const respuesta = await this.cliente.messages.create({
      model: this.modelo,
      max_tokens: 16000,
      system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
      messages: mensajes.map((m) => ({ role: m.rol === "usuario" ? "user" : "assistant", content: m.texto })),
    });

    const texto = respuesta.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const u = respuesta.usage;
    const uso = {
      entrada: u.input_tokens,
      salida: u.output_tokens,
      cacheEscritura: u.cache_creation_input_tokens ?? 0,
      cacheLectura: u.cache_read_input_tokens ?? 0,
    };
    return {
      texto,
      uso,
      costoUsd: estimarCosto(this.modelo, uso),
      duracionMs: Date.now() - inicio,
      modelo: this.modelo,
      modeloExacto: respuesta.model ?? this.modelo,
      motivoParada: respuesta.stop_reason ?? "desconocido",
    };
  }
}
