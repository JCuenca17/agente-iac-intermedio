import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generarArtefacto, interpretarRespuesta } from "../src/agente/agente.js";
import { construirSistema, mensajeRetroalimentacion } from "../src/agente/prompt.js";
import { ProveedorGrabado } from "../src/modelo/grabado.js";
import type { EsquemaProveedor } from "../src/proveedor/esquema.js";

const esquema: EsquemaProveedor = JSON.parse(
  readFileSync(new URL("./fixtures/esquema-aws-mini.json", import.meta.url), "utf8"),
);
const c03 = JSON.parse(readFileSync(new URL("./fixtures/artefactos/c03-valido.json", import.meta.url), "utf8"));
const entregar = (a: unknown) => JSON.stringify({ accion: "entregar", artefacto: a });

describe("interpretarRespuesta", () => {
  it("reconoce una entrega", () => {
    expect(interpretarRespuesta(entregar(c03))).toEqual({ tipo: "artefacto", artefacto: c03 });
  });

  it("reconoce una consulta al esquema", () => {
    expect(interpretarRespuesta('{"accion":"consultar_esquema","tipos":["aws_sqs_queue"]}')).toEqual({
      tipo: "consulta",
      tipos: ["aws_sqs_queue"],
    });
  });

  it("tolera bloques de código y texto alrededor del JSON", () => {
    const r = interpretarRespuesta("Aquí está:\n```json\n" + entregar(c03) + "\n```\nListo.");
    expect(r.tipo).toBe("artefacto");
  });

  it("marca como inválida una respuesta sin JSON o con una acción desconocida", () => {
    expect(interpretarRespuesta("no sé").tipo).toBe("invalida");
    expect(interpretarRespuesta('{"accion":"bailar"}').tipo).toBe("invalida");
    expect(interpretarRespuesta('{"accion":"entregar"}').tipo).toBe("invalida");
  });
});

describe("prompt", () => {
  it("explica el protocolo, el formato de referencias y las políticas", () => {
    const s = construirSistema({ conRag: true, versionProveedor: "6.71.0" });
    expect(s).toContain("consultar_esquema");
    expect(s).toContain("${ref:");
    expect(s).toContain("6.71.0");
    expect(s).toMatch(/cifr/i);
  });

  it("sin RAG no ofrece la consulta al esquema", () => {
    expect(construirSistema({ conRag: false, versionProveedor: "6.71.0" })).not.toContain("consultar_esquema");
  });

  it("la retroalimentación lista cada error con su capa, ruta y regla", () => {
    const m = mensajeRetroalimentacion([
      { capa: "C2", ruta: "/recursos/0/atributos/x", regla: "atributo-inexistente", mensaje: '"x" no existe' },
    ]);
    expect(m).toContain("[C2] /recursos/0/atributos/x (atributo-inexistente)");
    expect(m).toMatch(/completo/);
  });
});

describe("generarArtefacto", () => {
  it("entrega el artefacto en una sola llamada", async () => {
    const r = await generarArtefacto("una cola", [], { proveedor: new ProveedorGrabado([entregar(c03)]), esquema, conRag: true });
    expect(r.artefacto).toEqual(c03);
    expect(r.llamadas).toHaveLength(1);
    expect(r.consultas).toEqual([]);
  });

  it("responde una consulta con el esquema y luego recibe el artefacto", async () => {
    const proveedor = new ProveedorGrabado(['{"accion":"consultar_esquema","tipos":["aws_sqs_queue"]}', entregar(c03)]);
    const r = await generarArtefacto("una cola", [], { proveedor, esquema, conRag: true });
    expect(r.artefacto).toEqual(c03);
    expect(r.consultas).toEqual([["aws_sqs_queue"]]);
    expect(r.mensajes.some((m) => m.rol === "usuario" && m.texto.includes("sqs_managed_sse_enabled"))).toBe(true);
  });

  it("sin RAG, rechaza la consulta y pide entregar", async () => {
    const proveedor = new ProveedorGrabado(['{"accion":"consultar_esquema","tipos":["aws_sqs_queue"]}', entregar(c03)]);
    const r = await generarArtefacto("una cola", [], { proveedor, esquema, conRag: false });
    expect(r.artefacto).toEqual(c03);
    expect(r.consultas).toEqual([]);
    expect(r.mensajes.at(-2)?.texto).toMatch(/no está disponible/);
  });

  it("limita las consultas y luego exige la entrega", async () => {
    const consulta = '{"accion":"consultar_esquema","tipos":["aws_sqs_queue"]}';
    const proveedor = new ProveedorGrabado([consulta, consulta, consulta, entregar(c03)]);
    const r = await generarArtefacto("una cola", [], { proveedor, esquema, conRag: true, maxConsultas: 2 });
    expect(r.consultas).toHaveLength(2);
    expect(r.artefacto).toEqual(c03);
  });

  it("devuelve el error cuando la respuesta no es válida", async () => {
    const r = await generarArtefacto("una cola", [], { proveedor: new ProveedorGrabado(["texto suelto"]), esquema, conRag: true });
    expect(r.artefacto).toBeNull();
    expect(r.errorFormato).toMatch(/JSON/);
  });

  it("continúa una conversación previa (retroalimentación)", async () => {
    const previos = [
      { rol: "usuario" as const, texto: "una cola" },
      { rol: "asistente" as const, texto: entregar({ malo: true }) },
    ];
    const proveedor = new ProveedorGrabado([entregar(c03)]);
    const r = await generarArtefacto(mensajeRetroalimentacion([]), previos, { proveedor, esquema, conRag: true });
    expect(r.mensajes[0]).toEqual(previos[0]);
    expect(r.mensajes).toHaveLength(4);
  });
});
