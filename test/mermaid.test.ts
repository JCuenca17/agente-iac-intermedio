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
    expect(diagrama).toContain('r_cola_trabajos -->|"escribe en"| r_cola_fallidos');
  });

  it("dibuja las dependencias explícitas con línea punteada", () => {
    const a = structuredClone(c03);
    a.recursos[1].depende_de = ["cola_fallidos"];
    expect(generarMermaid(a)).toContain("r_cola_trabajos -.->|depende de| r_cola_fallidos");
  });

  it("escapa comillas y corchetes en los textos", () => {
    const a = structuredClone(c03);
    a.relaciones[0].tipo = "notifica_a";
    a.recursos[0].id = "cola_x";
    a.relaciones[0].destino = "cola_x";
    const salida = generarMermaid(a);
    expect(salida).not.toMatch(/\["[^"]*"[^"]*"\]/);
  });

  it("un recurso llamado como una palabra reservada de Mermaid no rompe el diagrama", () => {
    const a = structuredClone(c03);
    a.recursos[0].id = "end";
    a.relaciones[0].destino = "end";
    const salida = generarMermaid(a);
    expect(salida).toContain("r_end[");
    expect(salida).not.toMatch(/^\s+end\[/m);
  });

  it("tolera un artefacto sin relaciones o con un tipo de relación desconocido", () => {
    const sin = structuredClone(c03) as Partial<Artefacto> & Artefacto;
    delete (sin as Partial<Artefacto>).relaciones;
    expect(() => generarMermaid(sin)).not.toThrow();
    const raro = structuredClone(c03);
    (raro.relaciones[0] as { tipo: string }).tipo = "habla_con";
    expect(generarMermaid(raro)).toContain('|"habla_con"|');
  });

  it("es determinista", () => {
    expect(generarMermaid(c03)).toBe(diagrama);
  });
});
