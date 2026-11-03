import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generarMermaid } from "../src/diagrama/mermaid.js";
import { generarPaginaRevision } from "../src/revision/pagina.js";
import type { Artefacto } from "../src/artefacto/tipos.js";

const c03: Artefacto = JSON.parse(readFileSync(new URL("./fixtures/artefactos/c03-valido.json", import.meta.url), "utf8"));
const base = {
  requerimiento: "Una cola de trabajos con cola de fallidos",
  artefacto: c03,
  mermaid: generarMermaid(c03),
  erroresPorIteracion: [[{ capa: "C2" as const, ruta: "/recursos/0/atributos/x", regla: "atributo-inexistente", mensaje: '"x" no existe' }], []],
  resumenPlan: { crear: 2, cambiar: 0, destruir: 0 },
  costoUsd: 0.0123,
  llamadas: 2,
};

describe("página de revisión humana", () => {
  const html = generarPaginaRevision(base);

  it("incluye el diagrama para que Mermaid lo dibuje", () => {
    expect(html).toContain('<pre class="mermaid">flowchart LR');
    expect(html).toMatch(/mermaid@\d+\.\d+\.\d+/);
  });

  it("lista los recursos con su propósito y el requisito que atienden", () => {
    expect(html).toContain("<code>cola_trabajos</code>");
    expect(html).toContain("Recibe los trabajos pendientes.");
    expect(html).toContain("cola de mensajes fallidos");
  });

  it("muestra el resumen del plan, las iteraciones y el costo", () => {
    expect(html).toContain("2 por crear, 0 por cambiar, 0 por destruir");
    expect(html).toContain("2 iteración(es)");
    expect(html).toContain("US$ 0.0123");
  });

  it("muestra los errores de cada iteración", () => {
    expect(html).toContain("[C2] /recursos/0/atributos/x");
    expect(html).toContain("Iteración 2:</strong> pasó todas las capas");
  });

  it("escapa el HTML que venga del requerimiento o del modelo", () => {
    const h = generarPaginaRevision({ ...base, requerimiento: "<script>alert(1)</script>" });
    expect(h).not.toContain("<script>alert(1)</script>");
    expect(h).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
