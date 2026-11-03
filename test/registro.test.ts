import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Registro } from "../src/trazas/registro.js";

let dir: string | undefined;
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

describe("registro de trazas", () => {
  it("guarda un evento por línea en JSON, con el tiempo desde el inicio", () => {
    dir = mkdtempSync(join(tmpdir(), "trazas-"));
    const archivo = join(dir, "sub", "corrida.jsonl");
    const r = new Registro(archivo);
    r.anotar("inicio", { caso: "C03" });
    r.anotar("fin", { exito: true });
    const lineas = readFileSync(archivo, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toMatchObject({ evento: "inicio", caso: "C03" });
    expect(lineas[1].t).toBeGreaterThanOrEqual(lineas[0].t);
  });

  it("mide la duración de una etapa aunque falle", async () => {
    const r = new Registro();
    await expect(
      r.medir("c4", () => {
        throw new Error("falló");
      }),
    ).rejects.toThrow("falló");
    expect(r.eventos[0]).toMatchObject({ evento: "etapa", etapa: "c4" });
    expect(typeof r.eventos[0].duracionMs).toBe("number");
  });
});
