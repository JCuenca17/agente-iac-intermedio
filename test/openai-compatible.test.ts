import { describe, expect, it } from "vitest";
import { ProveedorOpenAI, type Fetch } from "../src/modelo/openai-compatible.js";

// Ninguna prueba llama a un servicio real: el proveedor recibe un fetch falso.
interface Llamada {
  url: string;
  init: { method?: string; headers?: Record<string, string>; body?: string };
}

function fetchFalso(respuestas: { status: number; cuerpo: unknown }[]): Fetch & { llamadas: Llamada[] } {
  let i = 0;
  const f = (async (url: string, init: Llamada["init"]) => {
    f.llamadas.push({ url, init });
    const r = respuestas[Math.min(i++, respuestas.length - 1)];
    return { ok: r.status < 300, status: r.status, text: async () => JSON.stringify(r.cuerpo) };
  }) as unknown as Fetch & { llamadas: Llamada[] };
  f.llamadas = [];
  return f;
}

const exito = (contenido: string, finish = "stop", usage: Record<string, unknown> = { prompt_tokens: 1200, completion_tokens: 300, prompt_tokens_details: { cached_tokens: 1000 } }) => ({
  status: 200,
  cuerpo: { model: "meta-llama/llama-3.3-70b-instruct", choices: [{ message: { role: "assistant", content: contenido }, finish_reason: finish }], usage },
});

const crear = (f: Fetch, clave: string | null = "sk-x") =>
  new ProveedorOpenAI({ baseUrl: "https://openrouter.ai/api/v1", apiKey: clave ?? undefined, modelo: "meta-llama/llama-3.3-70b-instruct", fetch: f, esperaMs: 0, costo: () => 0.5 });

describe("proveedor openai-compatible (OpenRouter, NVIDIA, Groq, Ollama)", () => {
  it("envía el prompt de sistema y la conversación en formato chat/completions con la clave", async () => {
    const f = fetchFalso([exito('{"accion":"entregar"}')]);
    await crear(f).completar("SISTEMA", [
      { rol: "usuario", texto: "hola" },
      { rol: "asistente", texto: "respuesta" },
      { rol: "usuario", texto: "corrige" },
    ]);
    expect(f.llamadas).toHaveLength(1);
    expect(f.llamadas[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(f.llamadas[0].init.method).toBe("POST");
    expect(f.llamadas[0].init.headers?.Authorization).toBe("Bearer sk-x");
    const cuerpo = JSON.parse(f.llamadas[0].init.body!);
    expect(cuerpo.model).toBe("meta-llama/llama-3.3-70b-instruct");
    expect(cuerpo.messages).toEqual([
      { role: "system", content: "SISTEMA" },
      { role: "user", content: "hola" },
      { role: "assistant", content: "respuesta" },
      { role: "user", content: "corrige" },
    ]);
  });

  it("sin clave (servidor local) no envía Authorization", async () => {
    const f = fetchFalso([exito("x")]);
    await crear(f, null).completar("S", [{ rol: "usuario", texto: "hola" }]);
    expect(f.llamadas[0].init.headers?.Authorization).toBeUndefined();
  });

  it("devuelve el texto, los tokens (la caché leída aparte) y el costo", async () => {
    const r = await crear(fetchFalso([exito("el artefacto")])).completar("S", [{ rol: "usuario", texto: "hola" }]);
    expect(r).toMatchObject({
      texto: "el artefacto",
      uso: { entrada: 200, salida: 300, cacheEscritura: 0, cacheLectura: 1000 },
      costoUsd: 0.5,
      modelo: "meta-llama/llama-3.3-70b-instruct",
      motivoParada: "stop",
    });
  });

  it("informa el modelo exacto que devuelve el proveedor", async () => {
    const r = await crear(fetchFalso([exito("x")])).completar("S", [{ rol: "usuario", texto: "hola" }]);
    expect(r.modeloExacto).toBe("meta-llama/llama-3.3-70b-instruct");
  });

  it("traduce finish_reason length a max_tokens para que la respuesta cortada se informe", async () => {
    const r = await crear(fetchFalso([exito('{"accion":', "length")])).completar("S", [{ rol: "usuario", texto: "hola" }]);
    expect(r.motivoParada).toBe("max_tokens");
  });

  it("si el contenido viene nulo devuelve texto vacío", async () => {
    const r = await crear(fetchFalso([exito(null as unknown as string)])).completar("S", [{ rol: "usuario", texto: "hola" }]);
    expect(r.texto).toBe("");
  });

  it("reintenta ante 429 y 5xx y luego sigue", async () => {
    const f = fetchFalso([{ status: 429, cuerpo: { error: { message: "rate limit" } } }, { status: 503, cuerpo: {} }, exito("listo")]);
    const r = await crear(f).completar("S", [{ rol: "usuario", texto: "hola" }]);
    expect(f.llamadas).toHaveLength(3);
    expect(r.texto).toBe("listo");
  });

  it("no reintenta un error de la petición (4xx) e informa el mensaje del proveedor", async () => {
    const f = fetchFalso([{ status: 401, cuerpo: { error: { message: "clave inválida" } } }]);
    await expect(crear(f).completar("S", [{ rol: "usuario", texto: "hola" }])).rejects.toThrow(/401.*clave inválida/);
    expect(f.llamadas).toHaveLength(1);
  });

  it("se rinde después de 3 reintentos", async () => {
    const f = fetchFalso([{ status: 500, cuerpo: {} }]);
    await expect(crear(f).completar("S", [{ rol: "usuario", texto: "hola" }])).rejects.toThrow(/500/);
    expect(f.llamadas).toHaveLength(4);
  });
});
