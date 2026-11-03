import { afterEach, describe, expect, it } from "vitest";
import { entornoTofu, tiempoLimiteTofuMs } from "../src/tofu.js";

const guardado = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in guardado)) delete process.env[k];
  Object.assign(process.env, guardado);
});

describe("entorno y tiempo límite de OpenTofu", () => {
  it("no pasa claves de API ni variables AWS propias, y fuerza el emulador", () => {
    process.env.ANTHROPIC_API_KEY = "sk-secreta";
    process.env.AWS_ENDPOINT_URL_S3 = "https://s3.amazonaws.com";
    process.env.AWS_SHARED_CREDENTIALS_FILE = "/home/x/.aws/credentials";
    process.env.AWS_ENDPOINT = " http://localhost:4567 ";
    const e = entornoTofu();
    expect(e.ANTHROPIC_API_KEY).toBeUndefined();
    expect(e.AWS_ENDPOINT_URL_S3).toBeUndefined();
    expect(e.AWS_SHARED_CREDENTIALS_FILE).toBeUndefined();
    expect(e.AWS_ENDPOINT_URL).toBe("http://localhost:4567");
    expect(e.AWS_ACCESS_KEY_ID).toBe("test");
    expect(e.PATH ?? e.Path).toBeDefined();
  });

  it("el tiempo límite se configura con TOFU_TIEMPO_LIMITE_S y vale 20 minutos por defecto", () => {
    delete process.env.TOFU_TIEMPO_LIMITE_S;
    expect(tiempoLimiteTofuMs()).toBe(1_200_000);
    process.env.TOFU_TIEMPO_LIMITE_S = "30";
    expect(tiempoLimiteTofuMs()).toBe(30_000);
    process.env.TOFU_TIEMPO_LIMITE_S = "nada";
    expect(tiempoLimiteTofuMs()).toBe(1_200_000);
  });
});
