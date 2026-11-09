import { describe, expect, it } from "vitest";
import { traducir } from "../src/traductor/opentofu.js";
import type { EsquemaProveedor } from "../src/proveedor/esquema.js";
import type { Artefacto } from "../src/artefacto/tipos.js";

const opciones = { endpoint: "http://localhost:4566", region: "us-east-1", versionProveedor: "6.71.0" };

const esquema: EsquemaProveedor = {
  fuente: "prueba",
  version: "6.71.0",
  recursos: {
    aws_security_group: {
      atributos: {
        name: { tipo: "string", opcional: true },
        ingress: {
          tipo: ["set", ["object", {
            cidr_blocks: ["list", "string"],
            description: "string",
            from_port: "number",
            ipv6_cidr_blocks: ["list", "string"],
            self: "bool",
          }]],
          opcional: true,
          calculado: true,
        },
        anidado: {
          tipo: ["list", ["object", { interno: ["list", ["object", { a: "string", b: "string" }]], c: "string" }]],
          opcional: true,
        },
        etiquetas_libres: { tipo: ["list", "string"], opcional: true },
      },
      bloques: {},
    },
  },
};

function traducirGrupo(atributos: Record<string, unknown>) {
  const artefacto = { recursos: [{ id: "grupo", tipo: "aws_security_group", proposito: "prueba", atributos }] } as unknown as Artefacto;
  return traducir(artefacto, esquema, opciones).codigo.resource.aws_security_group.grupo;
}

describe("traductor: objetos dentro de atributos, que en JSON exigen todas sus claves", () => {
  it("completa con null las claves que el artefacto omite", () => {
    const g = traducirGrupo({ ingress: [{ from_port: 443, cidr_blocks: ["10.0.0.0/16"] }] });
    expect(g.ingress).toEqual([
      { from_port: 443, cidr_blocks: ["10.0.0.0/16"], description: null, ipv6_cidr_blocks: null, self: null },
    ]);
  });

  it("no altera los valores que el artefacto sí declara y sigue convirtiendo sus referencias", () => {
    const g = traducirGrupo({ ingress: [{ description: "${ref:grupo.name}", self: false }] });
    expect(g.ingress[0].description).toBe("${aws_security_group.grupo.name}");
    expect(g.ingress[0].self).toBe(false);
  });

  it("completa también los objetos anidados", () => {
    const g = traducirGrupo({ anidado: [{ interno: [{ a: "x" }] }] });
    expect(g.anidado).toEqual([{ interno: [{ a: "x", b: null }], c: null }]);
  });

  it("deja igual las listas de texto, una lista vacía y una expresión en lugar de la lista", () => {
    expect(traducirGrupo({ etiquetas_libres: ["a"] }).etiquetas_libres).toEqual(["a"]);
    expect(traducirGrupo({ ingress: [] }).ingress).toEqual([]);
    expect(traducirGrupo({ ingress: "${ref:grupo.ingress}" }).ingress).toBe("${aws_security_group.grupo.ingress}");
  });

  it("conserva una clave que el esquema no conoce, para que la rechace la validación", () => {
    const g = traducirGrupo({ ingress: [{ inventada: 1 }] });
    expect(g.ingress[0].inventada).toBe(1);
  });
});
