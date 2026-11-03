import type { Artefacto } from "../artefacto/tipos.js";
import type { ResumenPlan } from "../validador/c4-opentofu.js";
import type { ErrorValidacion } from "../validador/tipos.js";

export interface DatosRevision {
  requerimiento: string;
  artefacto: Artefacto;
  mermaid: string;
  erroresPorIteracion: ErrorValidacion[][];
  resumenPlan?: ResumenPlan;
  costoUsd: number;
  llamadas: number;
}

const MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js";

function escapar(valor: unknown): string {
  return String(valor ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** Fila de un recurso, con sus atributos (cifrado, puertos, permisos...) a la vista. */
function filaRecurso(r: Artefacto["recursos"][number]): string {
  const atributos = `<details><summary>ver</summary><pre>${escapar(JSON.stringify(r.atributos ?? {}, null, 2))}</pre></details>`;
  return `<tr><td><code>${escapar(r.id)}</code></td><td><code>${escapar(r.tipo)}</code></td><td>${escapar(r.proposito)}</td><td>${escapar(r.requisito)}</td><td>${atributos}</td></tr>`;
}

function listaRelaciones(a: Artefacto): string {
  const items = (a.relaciones ?? []).map((x) => `<li><code>${escapar(x.origen)}</code> ${escapar(x.tipo)} <code>${escapar(x.destino)}</code></li>`).join("");
  return items || "<li>Ninguna declarada.</li>";
}

function seccionValidacion(errores: ErrorValidacion[][]): string {
  return errores
    .map((lista, i) => {
      if (lista.length === 0) return `<li><strong>Iteración ${i + 1}:</strong> pasó todas las capas.</li>`;
      const items = lista.map((e) => `<li><code>[${e.capa}] ${escapar(e.ruta)}</code> (${escapar(e.regla)}): ${escapar(e.mensaje)}</li>`).join("");
      return `<li><strong>Iteración ${i + 1}:</strong> ${lista.length} error(es), corregidos en la siguiente.<ul>${items}</ul></li>`;
    })
    .join("");
}

/**
 * Página HTML para la revisión humana: diagrama, recursos con sus atributos, relaciones,
 * supuestos, reporte de validación y resumen del plan. El diagrama lo dibuja Mermaid en el
 * navegador (se carga de un CDN; sin conexión se ve el texto del diagrama).
 */
export function generarPaginaRevision(d: DatosRevision): string {
  const p = d.resumenPlan;
  const plan = p ? `${p.crear} por crear, ${p.cambiar} por cambiar, ${p.destruir} por destruir` : "sin plan";
  const supuestos = (d.artefacto.supuestos ?? []).map((s) => `<li>${escapar(s)}</li>`).join("") || "<li>Ninguno declarado.</li>";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Revisión del diseño</title>
<style>
  :root { --texto: #1f2328; --suave: #59636e; --fondo: #ffffff; --borde: #d1d9e0; --acento: #0969da; }
  @media (prefers-color-scheme: dark) { :root { --texto: #e6edf3; --suave: #9198a1; --fondo: #0d1117; --borde: #3d444d; --acento: #4493f8; } }
  body { font-family: system-ui, sans-serif; color: var(--texto); background: var(--fondo); max-width: 1100px; margin: 0 auto; padding: 24px 16px; line-height: 1.5; }
  h1 { font-size: 1.5rem; } h2 { font-size: 1.15rem; margin-top: 2rem; border-bottom: 1px solid var(--borde); padding-bottom: 4px; }
  blockquote { margin: 0; padding: 8px 16px; border-left: 4px solid var(--acento); color: var(--suave); }
  table { border-collapse: collapse; width: 100%; font-size: 0.92rem; } th, td { border: 1px solid var(--borde); padding: 6px 8px; text-align: left; vertical-align: top; }
  .diagrama { overflow-x: auto; border: 1px solid var(--borde); border-radius: 6px; padding: 12px; background: #fff; }
  .dato { color: var(--suave); }
</style>
</head>
<body>
<h1>Revisión del diseño antes de desplegar</h1>
<blockquote>${escapar(d.requerimiento)}</blockquote>
<p>${escapar(d.artefacto.resumen)}</p>
<p class="dato">Plan: ${plan} · ${d.erroresPorIteracion.length} iteración(es) · ${d.llamadas} llamada(s) al modelo · costo estimado US$ ${d.costoUsd.toFixed(4)}</p>

<h2>Diagrama</h2>
<div class="diagrama"><pre class="mermaid">${escapar(d.mermaid)}</pre></div>

<h2>Recursos (${d.artefacto.recursos.length})</h2>
<table><thead><tr><th>Id</th><th>Tipo</th><th>Propósito</th><th>Requisito que atiende</th><th>Atributos</th></tr></thead>
<tbody>${d.artefacto.recursos.map(filaRecurso).join("")}</tbody></table>

<h2>Relaciones</h2>
<ul>${listaRelaciones(d.artefacto)}</ul>

<h2>Supuestos del modelo</h2>
<ul>${supuestos}</ul>

<h2>Validación</h2>
<ul>${seccionValidacion(d.erroresPorIteracion)}</ul>

<p class="dato">Vuelve a la terminal para aprobar o rechazar el diseño.</p>
<script src="${MERMAID_CDN}"></script>
<script>mermaid.initialize({ startOnLoad: true, securityLevel: "strict", theme: "default" });</script>
</body>
</html>
`;
}
