import { estimarCosto } from "./precios.js";
import type { MensajeModelo, ProveedorModelo, RespuestaModelo, UsoTokens } from "./tipos.js";

/** Lo mínimo de fetch que se usa; permite probar sin llamar a ningún servicio. */
export type Fetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface OpcionesOpenAI {
  /** URL base de la API, por ejemplo https://openrouter.ai/api/v1 o https://integrate.api.nvidia.com/v1. */
  baseUrl: string;
  /** Clave de quien paga el consumo; sin clave (servidor local como Ollama) no se envía. */
  apiKey?: string;
  modelo: string;
  fetch?: Fetch;
  /** Espera base entre reintentos (ms); se duplica en cada intento. */
  esperaMs?: number;
  /** Para pruebas: reemplaza la estimación de costo. */
  costo?: (modelo: string, uso: UsoTokens) => number;
}

const REINTENTOS = 3;
const TIEMPO_LIMITE_MS = 600_000;

/**
 * Proveedor para cualquier API con el formato chat/completions de OpenAI: OpenRouter,
 * NVIDIA (build.nvidia.com), Groq, Ollama local, etc. El agente no usa funciones propias
 * de un proveedor (pide JSON en texto), así que basta con este formato común.
 */
export class ProveedorOpenAI implements ProveedorModelo {
  readonly nombre = "openai-compatible";

  constructor(private readonly o: OpcionesOpenAI) {}

  async completar(sistema: string, mensajes: MensajeModelo[]): Promise<RespuestaModelo> {
    const inicio = Date.now();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.o.apiKey) headers.Authorization = `Bearer ${this.o.apiKey}`;
    const body = JSON.stringify({
      model: this.o.modelo,
      max_tokens: 16000,
      messages: [
        { role: "system", content: sistema },
        ...mensajes.map((m) => ({ role: m.rol === "usuario" ? "user" : "assistant", content: m.texto })),
      ],
    });
    const datos = await this.pedir(`${this.o.baseUrl}/chat/completions`, { method: "POST", headers, body });

    const eleccion = datos.choices?.[0];
    const u = datos.usage ?? {};
    const cacheLectura = u.prompt_tokens_details?.cached_tokens ?? 0;
    const uso: UsoTokens = {
      entrada: Math.max(0, (u.prompt_tokens ?? 0) - cacheLectura),
      salida: u.completion_tokens ?? 0,
      cacheEscritura: 0,
      cacheLectura,
    };
    const finish = eleccion?.finish_reason ?? "desconocido";
    return {
      texto: typeof eleccion?.message?.content === "string" ? eleccion.message.content : "",
      uso,
      costoUsd: (this.o.costo ?? estimarCosto)(this.o.modelo, uso),
      duracionMs: Date.now() - inicio,
      modelo: this.o.modelo,
      modeloExacto: typeof datos.model === "string" ? datos.model : this.o.modelo,
      // "length" es el equivalente de max_tokens: así el agente informa la respuesta cortada.
      motivoParada: finish === "length" ? "max_tokens" : finish,
    };
  }

  /** Hace la petición y reintenta ante 429 (límite de solicitudes) o errores 5xx del servidor. */
  private async pedir(url: string, init: { method: string; headers: Record<string, string>; body: string }): Promise<RespuestaChat> {
    const fetchReal = this.o.fetch ?? (globalThis.fetch as unknown as Fetch);
    const espera = this.o.esperaMs ?? 2000;
    for (let intento = 0; ; intento++) {
      const r = await fetchReal(url, { ...init, signal: AbortSignal.timeout(TIEMPO_LIMITE_MS) });
      const texto = await r.text();
      if (r.ok) return JSON.parse(texto) as RespuestaChat;
      const transitorio = r.status === 429 || r.status >= 500;
      if (!transitorio || intento >= REINTENTOS) {
        let mensaje = texto.slice(0, 300);
        try {
          mensaje = JSON.parse(texto)?.error?.message ?? mensaje;
        } catch {
          // el cuerpo no es JSON
        }
        throw new Error(`La API respondió ${r.status}: ${mensaje}`);
      }
      await new Promise((listo) => setTimeout(listo, espera * 2 ** intento));
    }
  }
}

interface RespuestaChat {
  model?: string;
  choices?: { message?: { content?: unknown }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
}
