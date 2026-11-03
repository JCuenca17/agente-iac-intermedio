import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generarMermaid } from "../src/diagrama/mermaid.js";
import type { Artefacto } from "../src/artefacto/tipos.js";

const c03: Artefacto = JSON.parse(readFileSync(new URL("./fixtures/artefactos/c03-valido.json", import.meta.url), "utf8"));

describe("generador del diagrama Mermaid", () => {
  const diagrama = generarMermaid(c03);

  it("es un diagrama de flujo de izquierda a derecha", () => {
    expect(diagrama.startsWith("flowchart LR\n")).toBe(true);
  });

  it("dibuja un nodo por recurso con su id y su tipo", () => {
    expect(diagrama).toMatch(/cola_fallidos\[.*cola_fallidos.*aws_sqs_queue.*\]/);
    expect(diagrama).toMatch(/cola_trabajos\[.*cola_trabajos.*aws_sqs_queue.*\]/);
  });

  it("agrupa los recursos por servicio", () => {
    expect(diagrama).toMatch(/subgraph svc_sqs\["SQS"\]/);
  });

  it("dibuja cada relación con su tipo como etiqueta legible", () => {
    expect(diagrama).toContain('cola_trabajos -->|"escribe en"| cola_fallidos');
  });

  it("dibuja las dependencias explícitas con línea punteada", () => {
    const a = structuredClone(c03);
    a.recursos[1].depende_de = ["cola_fallidos"];
    expect(generarMermaid(a)).toContain("cola_trabajos -.->|depende de| cola_fallidos");
  });

  it("escapa comillas y corchetes en los textos", () => {
    const a = structuredClone(c03);
    a.relaciones[0].tipo = "notifica_a";
    a.recursos[0].id = "cola_x";
    a.relaciones[0].destino = "cola_x";
    const salida = generarMermaid(a);
    expect(salida).not.toMatch(/\["[^"]*"[^"]*"\]/);
  });

  it("es determinista", () => {
    expect(generarMermaid(c03)).toBe(diagrama);
  });
});
