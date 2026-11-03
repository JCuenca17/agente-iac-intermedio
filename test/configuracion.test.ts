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
    expect(config.limiteGastoExperimentoUsd).toBe(10);
    expect(config.flociContenedor).toBe("floci");
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

describe("configuración del proveedor openai-compatible (OpenRouter, NVIDIA, Groq, Ollama)", () => {
  it("lee la URL base, la clave y el modelo", () => {
    const c = cargarConfiguracion({
      LLM_PROVEEDOR: "openai-compatible",
      LLM_BASE_URL: "https://openrouter.ai/api/v1/",
      LLM_API_KEY: "sk-or-x",
      LLM_MODELO: "meta-llama/llama-3.3-70b-instruct",
    });
    expect(c).toMatchObject({ llmProveedor: "openai-compatible", llmBaseUrl: "https://openrouter.ai/api/v1", llmApiKey: "sk-or-x", llmModelo: "meta-llama/llama-3.3-70b-instruct" });
  });

  it("exige la URL base y el modelo", () => {
    expect(() => cargarConfiguracion({ LLM_PROVEEDOR: "openai-compatible", LLM_API_KEY: "x", LLM_MODELO: "m" })).toThrow(/LLM_BASE_URL/);
    expect(() => cargarConfiguracion({ LLM_PROVEEDOR: "openai-compatible", LLM_BASE_URL: "https://x/v1", LLM_API_KEY: "x" })).toThrow(/LLM_MODELO/);
  });

  it("exige la clave salvo en un servidor local (Ollama)", () => {
    expect(() => cargarConfiguracion({ LLM_PROVEEDOR: "openai-compatible", LLM_BASE_URL: "https://integrate.api.nvidia.com/v1", LLM_MODELO: "m" })).toThrow(/LLM_API_KEY/);
    const local = cargarConfiguracion({ LLM_PROVEEDOR: "openai-compatible", LLM_BASE_URL: "http://localhost:11434/v1", LLM_MODELO: "llama3.2" });
    expect(local.llmApiKey).toBeUndefined();
  });

  it("con otros proveedores no guarda la clave de openai-compatible", () => {
    expect(cargarConfiguracion({ LLM_PROVEEDOR: "grabado", LLM_API_KEY: "x" }).llmApiKey).toBeUndefined();
  });
});
