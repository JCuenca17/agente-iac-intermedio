import { describe, expect, it } from "vitest";
import { ProveedorGrabado } from "../src/modelo/grabado.js";
import { ProveedorClaudeCode, type EjecutarClaude } from "../src/modelo/claude-code.js";
import { ProveedorAnthropic, type ClienteMensajes } from "../src/modelo/anthropic.js";
import { estimarCosto } from "../src/modelo/precios.js";

// Ninguna prueba llama a un servicio real: los proveedores reciben un ejecutor o cliente falso.

describe("estimarCosto", () => {
  it("usa el precio de lista de Haiku 5.5 y los multiplicadores de caché", () => {
    const c = estimarCosto("claude-haiku-5-5", { entrada: 1_000_000, salida: 1_000_000, cacheEscritura: 0, cacheLectura: 0 });
    expect(c).toBeCloseTo(0.6, 10);
    const cache = estimarCosto("claude-haiku-5-5", { entrada: 0, salida: 0, cacheEscritura: 1_000_000, cacheLectura: 1_000_000 });
    expect(cache).toBeCloseTo(0.1 * 1.25 + 0.1 * 0.1, 10);
  });

  it("falla si el modelo no tiene precio", () => {
    expect(() => estimarCosto("modelo-inventado", { entrada: 1, salida: 1, cacheEscritura: 0, cacheLectura: 0 })).toThrow(/precios.json/);
  });
});

describe("proveedor grabado", () => {
  it("devuelve las respuestas en orden, sin costo", async () => {
    const p = new ProveedorGrabado(["uno", "dos"]);
    expect((await p.completar("s", [])).texto).toBe("uno");
    const r = await p.completar("s", []);
    expect(r).toMatchObject({ texto: "dos", costoUsd: 0, modelo: "grabado" });
  });

  it("avisa cuando se acaban las respuestas", async () => {
    const p = new ProveedorGrabado(["uno"]);
    await p.completar("s", []);
    await expect(p.completar("s", [])).rejects.toThrow(/respuestas grabadas/);
  });
});

describe("proveedor claude-code", () => {
  const salidaReal = JSON.stringify({
    type: "result",
    is_error: false,
    stop_reason: "end_turn",
    result: '{"ok":true}',
    duration_ms: 1671,
    total_cost_usd: 0.0001917,
    usage: { input_tokens: 2, output_tokens: 9, cache_creation_input_tokens: 935, cache_read_input_tokens: 0 },
  });

  it("llama a claude -p sin herramientas, con el modelo y el prompt de sistema, y lee el JSON", async () => {
    let llamada: { args: string[]; entrada: string; env: NodeJS.ProcessEnv } | undefined;
    const ejecutar: EjecutarClaude = (args, entrada, env) => {
      llamada = { args, entrada, env };
      return { codigo: 0, salida: salidaReal, error: "" };
    };
    const p = new ProveedorClaudeCode("claude-haiku-5-5", ejecutar);
    const r = await p.completar("SISTEMA", [{ rol: "usuario", texto: "hola" }]);

    expect(llamada!.args).toEqual(expect.arrayContaining(["-p", "--output-format", "json", "--no-session-persistence"]));
    expect(llamada!.args.join(" ")).toContain("--model claude-haiku-5-5");
    expect(llamada!.args.join(" ")).toContain('--tools ');
    expect(llamada!.args[llamada!.args.indexOf("--tools") + 1]).toBe("");
    expect(llamada!.args[llamada!.args.indexOf("--system-prompt") + 1]).toBe("SISTEMA");
    expect(llamada!.entrada).toContain("hola");
    expect(r).toMatchObject({
      texto: '{"ok":true}',
      uso: { entrada: 2, salida: 9, cacheEscritura: 935, cacheLectura: 0 },
      motivoParada: "end_turn",
      modelo: "claude-haiku-5-5",
    });
    expect(r.costoUsd).toBeGreaterThan(0);
  });

  it("nunca pasa una clave de API al proceso, para que se use la sesión del plan", async () => {
    const anterior = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-no-usar";
    let env: NodeJS.ProcessEnv = {};
    const p = new ProveedorClaudeCode("claude-haiku-5-5", (_a, _e, e) => {
      env = e;
      return { codigo: 0, salida: salidaReal, error: "" };
    });
    await p.completar("s", [{ rol: "usuario", texto: "x" }]);
    if (anterior === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = anterior;
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  });

  it("incluye los turnos anteriores en el texto que recibe", async () => {
    let entrada = "";
    const p = new ProveedorClaudeCode("claude-haiku-5-5", (_a, e) => {
      entrada = e;
      return { codigo: 0, salida: salidaReal, error: "" };
    });
    await p.completar("s", [
      { rol: "usuario", texto: "pedido" },
      { rol: "asistente", texto: "primera respuesta" },
      { rol: "usuario", texto: "corrige esto" },
    ]);
    expect(entrada.indexOf("pedido")).toBeLessThan(entrada.indexOf("primera respuesta"));
    expect(entrada.indexOf("primera respuesta")).toBeLessThan(entrada.indexOf("corrige esto"));
  });

  it("falla con un mensaje claro si Claude Code informa un error", async () => {
    const p = new ProveedorClaudeCode("claude-haiku-5-5", () => ({
      codigo: 1,
      salida: JSON.stringify({ is_error: true, result: "límite de uso alcanzado" }),
      error: "",
    }));
    await expect(p.completar("s", [{ rol: "usuario", texto: "x" }])).rejects.toThrow(/límite de uso alcanzado/);
  });
});

describe("proveedor anthropic", () => {
  it("envía el sistema con caché, convierte los turnos y lee el uso", async () => {
    let peticion: Record<string, unknown> = {};
    const cliente: ClienteMensajes = {
      messages: {
        create: async (p) => {
          peticion = p as unknown as Record<string, unknown>;
          return {
            content: [
              { type: "thinking", thinking: "" },
              { type: "text", text: "respuesta" },
            ],
            stop_reason: "end_turn",
            usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 2000, cache_read_input_tokens: 0 },
          } as never;
        },
      },
    };
    const p = new ProveedorAnthropic("sk-prueba", "claude-haiku-5-5", cliente);
    const r = await p.completar("SISTEMA", [
      { rol: "usuario", texto: "a" },
      { rol: "asistente", texto: "b" },
      { rol: "usuario", texto: "c" },
    ]);

    expect(peticion.model).toBe("claude-haiku-5-5");
    expect(peticion.system).toEqual([{ type: "text", text: "SISTEMA", cache_control: { type: "ephemeral" } }]);
    expect(peticion.messages).toEqual([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
    ]);
    expect(r).toMatchObject({ texto: "respuesta", motivoParada: "end_turn", uso: { entrada: 100, salida: 50, cacheEscritura: 2000, cacheLectura: 0 } });
    expect(r.costoUsd).toBeCloseTo(estimarCosto("claude-haiku-5-5", r.uso), 12);
  });
});
