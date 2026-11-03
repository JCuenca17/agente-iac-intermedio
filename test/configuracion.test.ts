import { describe, expect, it } from "vitest";
import { cargarConfiguracion } from "../src/configuracion.js";

describe("cargarConfiguracion", () => {
  it("usa valores por defecto que no gastan dinero cuando no hay variables", () => {
    const config = cargarConfiguracion({});
    expect(config.llmProveedor).toBe("grabado");
    expect(config.llmModelo).toBe("claude-haiku-5-5");
    expect(config.awsEndpoint).toBe("http://localhost:4566");
    expect(config.awsRegion).toBe("us-east-1");
    expect(config.emulador).toBe("floci");
    expect(config.maxIteraciones).toBe(3);
    expect(config.limiteGastoUsd).toBe(5);
  });

  it("lee los valores del entorno", () => {
    const config = cargarConfiguracion({
      LLM_PROVEEDOR: "claude-code",
      LLM_MODELO: "claude-sonnet-5-5",
      AWS_ENDPOINT: "http://127.0.0.1:4567",
      AWS_REGION: "eu-west-1",
      EMULADOR: "ministack",
      MAX_ITERACIONES: "5",
      LIMITE_GASTO_USD: "2.5",
    });
    expect(config.llmProveedor).toBe("claude-code");
    expect(config.llmModelo).toBe("claude-sonnet-5-5");
    expect(config.awsEndpoint).toBe("http://127.0.0.1:4567");
    expect(config.awsRegion).toBe("eu-west-1");
    expect(config.emulador).toBe("ministack");
    expect(config.maxIteraciones).toBe(5);
    expect(config.limiteGastoUsd).toBe(2.5);
  });

  it("rechaza un emulador desconocido", () => {
    expect(() => cargarConfiguracion({ EMULADOR: "localstack-pro" })).toThrow(/EMULADOR/);
  });

  it("rechaza un proveedor desconocido", () => {
    expect(() => cargarConfiguracion({ LLM_PROVEEDOR: "openai" })).toThrow(/LLM_PROVEEDOR/);
  });

  it("exige la clave solo cuando el proveedor es anthropic", () => {
    expect(() => cargarConfiguracion({ LLM_PROVEEDOR: "anthropic" })).toThrow(/ANTHROPIC_API_KEY/);
    const config = cargarConfiguracion({ LLM_PROVEEDOR: "anthropic", ANTHROPIC_API_KEY: "sk-prueba" });
    expect(config.anthropicApiKey).toBe("sk-prueba");
  });

  it("no guarda la clave cuando el proveedor no la necesita", () => {
    const config = cargarConfiguracion({ LLM_PROVEEDOR: "grabado", ANTHROPIC_API_KEY: "sk-prueba" });
    expect(config.anthropicApiKey).toBeUndefined();
  });

  it("rechaza números inválidos", () => {
    expect(() => cargarConfiguracion({ MAX_ITERACIONES: "0" })).toThrow(/MAX_ITERACIONES/);
    expect(() => cargarConfiguracion({ MAX_ITERACIONES: "tres" })).toThrow(/MAX_ITERACIONES/);
    expect(() => cargarConfiguracion({ LIMITE_GASTO_USD: "-1" })).toThrow(/LIMITE_GASTO_USD/);
  });
});
