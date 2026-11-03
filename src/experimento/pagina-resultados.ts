import type { Resumen } from "./resumen.js";

/**
 * Página HTML de resultados del experimento: gráficos SVG en línea y tablas, sin
 * dependencias externas, para revisar los resultados o presentarlos. Paleta y reglas de
 * la skill dataviz: colores por identidad en orden fijo (validados para daltonismo en
 * modo claro y oscuro), valores escritos junto a cada barra y una tabla por gráfico.
 */
export interface OpcionesPagina {
  titulo?: string;
}

const escapar = (v: unknown) =>
  String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
const usd = (x: number) => `US$ ${x.toFixed(4)}`;
const pval = (p: number) => (p < 0.001 ? "< 0.001" : p.toFixed(3));

const ANCHO = 680;
const MARGEN_IZQ = 64;
const MARGEN_DER = 120;
const ALTO_BARRA = 16;
const PASO = 30;

interface Barra {
  etiqueta: string;
  valor: number;
  texto: string;
  /** Intervalo (opcional) dibujado como bigote. */
  intervalo?: [number, number];
}

/** Barras horizontales de una sola serie (sin leyenda: el título la nombra). */
function barras(titulo: string, datos: Barra[], maximo: number): string {
  const alto = datos.length * PASO + 34;
  const ancho = ANCHO - MARGEN_IZQ - MARGEN_DER;
  const x = (v: number) => MARGEN_IZQ + (maximo > 0 ? (v / maximo) * ancho : 0);
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = f * maximo;
    return `<line class="grilla" x1="${x(v)}" x2="${x(v)}" y1="8" y2="${alto - 24}"/>`;
  });
  const filas = datos.map((d, i) => {
    const y = 12 + i * PASO;
    const w = Math.max(0, x(d.valor) - MARGEN_IZQ);
    const bigote = d.intervalo
      ? `<line class="bigote" x1="${x(d.intervalo[0])}" x2="${x(d.intervalo[1])}" y1="${y + ALTO_BARRA / 2}" y2="${y + ALTO_BARRA / 2}"/>` +
        `<line class="bigote" x1="${x(d.intervalo[0])}" x2="${x(d.intervalo[0])}" y1="${y + 3}" y2="${y + ALTO_BARRA - 3}"/>` +
        `<line class="bigote" x1="${x(d.intervalo[1])}" x2="${x(d.intervalo[1])}" y1="${y + 3}" y2="${y + ALTO_BARRA - 3}"/>`
      : "";
    const fin = d.intervalo ? x(d.intervalo[1]) : x(d.valor);
    return (
      `<g><title>${escapar(d.etiqueta)}: ${escapar(d.texto)}</title>` +
      `<text class="eje" x="${MARGEN_IZQ - 8}" y="${y + 12}" text-anchor="end">${escapar(d.etiqueta)}</text>` +
      `<rect class="serie-1" x="${MARGEN_IZQ}" y="${y}" width="${w}" height="${ALTO_BARRA}" rx="4"/>` +
      bigote +
      `<text class="valor" x="${Math.max(fin, x(d.valor)) + 6}" y="${y + 12}">${escapar(d.texto)}</text></g>`
    );
  });
  return `<svg viewBox="0 0 ${ANCHO} ${alto}" role="img" aria-label="${escapar(titulo)}">${marcas.join("")}${filas.join("")}</svg>`;
}

/** Barras agrupadas: un grupo por categoría y una barra por serie, con leyenda. */
function barrasAgrupadas(titulo: string, grupos: string[], series: string[], valor: (g: string, s: string) => number | null): string {
  const altoGrupo = series.length * (ALTO_BARRA + 2) + 14;
  const alto = grupos.length * altoGrupo + 30;
  const ancho = ANCHO - MARGEN_IZQ - MARGEN_DER;
  const x = (v: number) => MARGEN_IZQ + v * ancho;
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line class="grilla" x1="${x(f)}" x2="${x(f)}" y1="4" y2="${alto - 22}"/>`);
  const cuerpo = grupos.map((g, gi) => {
    const y0 = 6 + gi * altoGrupo;
    const barrasGrupo = series.map((s, si) => {
      const v = valor(g, s);
      const y = y0 + si * (ALTO_BARRA + 2);
      if (v === null) return "";
      return (
        `<g><title>${escapar(g)} · ${escapar(s)}: ${pct(v)}</title>` +
        `<rect class="serie-${(si % 6) + 1}" x="${MARGEN_IZQ}" y="${y}" width="${Math.max(0, x(v) - MARGEN_IZQ)}" height="${ALTO_BARRA}" rx="4"/>` +
        `<text class="valor" x="${x(v) + 6}" y="${y + 12}">${escapar(s)} ${pct(v)}</text></g>`
      );
    });
    return `<text class="eje" x="${MARGEN_IZQ - 8}" y="${y0 + 12}" text-anchor="end">${escapar(g)}</text>${barrasGrupo.join("")}`;
  });
  return `<svg viewBox="0 0 ${ANCHO} ${alto}" role="img" aria-label="${escapar(titulo)}">${marcas.join("")}${cuerpo.join("")}</svg>${leyenda(series)}`;
}

/** Barras apiladas por configuración (una franja por capa), con 2 px de separación y leyenda. */
function barrasApiladas(titulo: string, filas: { etiqueta: string; partes: number[] }[], capas: string[]): string {
  const total = Math.max(1, ...filas.map((f) => f.partes.reduce((s, x) => s + x, 0)));
  const alto = filas.length * PASO + 34;
  const ancho = ANCHO - MARGEN_IZQ - MARGEN_DER;
  const cuerpo = filas.map((f, i) => {
    const y = 12 + i * PASO;
    let x0 = MARGEN_IZQ;
    const segmentos = f.partes.map((n, ci) => {
      if (!n) return "";
      const w = (n / total) * ancho;
      const seg = `<g><title>${escapar(f.etiqueta)} · ${escapar(capas[ci])}: ${n}</title><rect class="serie-${ci + 1}" x="${x0}" y="${y}" width="${Math.max(1, w - 2)}" height="${ALTO_BARRA}" rx="2"/></g>`;
      x0 += w;
      return seg;
    });
    const suma = f.partes.reduce((s, x) => s + x, 0);
    return `<text class="eje" x="${MARGEN_IZQ - 8}" y="${y + 12}" text-anchor="end">${escapar(f.etiqueta)}</text>${segmentos.join("")}<text class="valor" x="${x0 + 6}" y="${y + 12}">${suma}</text>`;
  });
  return `<svg viewBox="0 0 ${ANCHO} ${alto}" role="img" aria-label="${escapar(titulo)}">${cuerpo.join("")}</svg>${leyenda(capas)}`;
}

function leyenda(series: string[]): string {
  return `<p class="leyenda">${series.map((s, i) => `<span><i class="serie-${(i % 6) + 1}"></i>${escapar(s)}</span>`).join("")}</p>`;
}

function tabla(cabecera: string[], filas: (string | number)[][]): string {
  const th = cabecera.map((c) => `<th>${escapar(c)}</th>`).join("");
  const tr = filas.map((f) => `<tr>${f.map((c) => `<td>${escapar(c)}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

function seccion(titulo: string, nota: string, grafico: string, datos: string): string {
  return `<section><h2>${escapar(titulo)}</h2><p class="nota">${escapar(nota)}</p>${grafico}<details><summary>Ver los datos</summary>${datos}</details></section>`;
}

export function paginaResultados(r: Resumen, o: OpcionesPagina = {}): string {
  const titulo = o.titulo ?? "Resultados del experimento";
  const cfg = r.porConfiguracion;
  const configs = cfg.map((c) => c.configuracion);
  const niveles = [...new Set(r.porNivel.map((x) => x.nivel))];
  const CAPAS = ["C0", "C1", "C2", "C3", "C4"];
  const maxCosto = Math.max(0, ...cfg.map((c) => c.costoMedioUsd));

  const secciones = [
    seccion(
      "M1: despliegue exitoso",
      "Proporción de corridas que se aplicaron sin errores y quedaron sin cambios pendientes. El bigote es el intervalo de confianza del 95 % (Wilson).",
      barras(
        "M1 por configuración",
        cfg.map((c) => ({ etiqueta: c.configuracion, valor: c.m1.p, texto: pct(c.m1.p), intervalo: [c.m1.inferior, c.m1.superior] as [number, number] })),
        1,
      ),
      tabla(
        ["Config.", "n", "Éxitos", "M1", "IC 95 %"],
        cfg.map((c) => [c.configuracion, c.n, c.m1.exitos, pct(c.m1.p), `${pct(c.m1.inferior)} – ${pct(c.m1.superior)}`]),
      ),
    ),
    seccion(
      "M1 por nivel de dificultad",
      "Proporción de despliegues exitosos de cada configuración en cada nivel.",
      barrasAgrupadas("M1 por nivel", niveles, configs, (g, s) => {
        const x = r.porNivel.find((y) => y.configuracion === s && y.nivel === g);
        return x && x.n ? x.m1 : null;
      }),
      tabla(["Nivel", ...configs], niveles.map((n) => [n, ...configs.map((c) => {
        const x = r.porNivel.find((y) => y.configuracion === c && y.nivel === n);
        return x && x.n ? `${pct(x.m1)} (n=${x.n})` : "—";
      })])),
    ),
    seccion(
      "M4: cumplimiento del requerimiento",
      "Proporción media de la lista de verificación de cada caso que se cumple en lo desplegado (casos propios).",
      barras("M4 por configuración", cfg.map((c) => ({ etiqueta: c.configuracion, valor: c.m4Media, texto: pct(c.m4Media) })), 1),
      tabla(["Config.", "M4 medio", "M3 medio (violaciones)"], cfg.map((c) => [c.configuracion, pct(c.m4Media), c.m3Media.toFixed(2)])),
    ),
    seccion(
      "Costo medio por corrida",
      "Costo estimado a precio de lista de la API, por corrida (M6).",
      barras("Costo medio por configuración", cfg.map((c) => ({ etiqueta: c.configuracion, valor: c.costoMedioUsd, texto: usd(c.costoMedioUsd) })), maxCosto || 1),
      tabla(
        ["Config.", "Costo medio", "Costo total", "Iteraciones", "Llamadas", "Tokens de entrada", "Tokens de salida", "Duración media (s)"],
        cfg.map((c) => [c.configuracion, usd(c.costoMedioUsd), usd(c.costoTotalUsd), c.iteracionesMedia.toFixed(2), c.llamadasMedia.toFixed(2), c.tokensEntradaMedia.toFixed(0), c.tokensSalidaMedia.toFixed(0), c.duracionMediaS.toFixed(1)]),
      ),
    ),
    seccion(
      "M2: errores detectados antes del despliegue",
      "Errores encontrados por cada capa en todas las iteraciones (C0: respuesta ilegible).",
      barrasApiladas("M2 por capa", cfg.map((c) => ({ etiqueta: c.configuracion, partes: CAPAS.map((k) => c.erroresPorCapa[k] ?? 0) })), CAPAS),
      tabla(["Config.", ...CAPAS], cfg.map((c) => [c.configuracion, ...CAPAS.map((k) => c.erroresPorCapa[k] ?? 0)])),
    ),
  ];

  const comparaciones = r.comparaciones.length
    ? `<section><h2>Comparaciones pareadas</h2><p class="nota">Mismo caso y repetición. Diferencias de la configuración base menos la otra; entre paréntesis, el valor p ajustado con Holm.</p>${tabla(
        ["Comparación", "Pares", "Diferencia M1", "p McNemar (Holm)", "Diferencia M4", "p Wilcoxon (Holm)", "Diferencia de costo", "p Wilcoxon (Holm)"],
        r.comparaciones.map((c) => [
          `${c.base} vs ${c.contra}`,
          c.pares,
          `${c.diferenciaM1pp.toFixed(1)} pp`,
          `${pval(c.pM1)} (${pval(c.pM1Holm)})`,
          `${(c.diferenciaM4 * 100).toFixed(1)} pp`,
          `${pval(c.pM4)} (${pval(c.pM4Holm)})`,
          `US$ ${c.diferenciaCostoUsd.toFixed(5)}`,
          `${pval(c.pCosto)} (${pval(c.pCostoHolm)})`,
        ]),
      )}</section>`
    : "";

  const iaceval = r.iaceval.length
    ? `<section><h2>IaC-Eval</h2><p class="nota">Protocolo de IaC-Eval sobre el plan. Referencia publicada (S12, Tabla 2, otros modelos y AWS real): Claude Sonnet 3.7 35.37 % de corrección; GPT-4.1 25.98 %; TerraFormer 14B 31.44 %.</p>${tabla(
        ["Config.", "Tareas", "Compilabilidad", "Desplegabilidad", "Corrección", "IC 95 %", "M1 en el emulador"],
        r.iaceval.map((x) => [x.configuracion, x.n, pct(x.compilabilidad), pct(x.desplegabilidad), pct(x.correccion.p), `${pct(x.correccion.inferior)} – ${pct(x.correccion.superior)}`, pct(x.m1)]),
      )}</section>`
    : "";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)}</title>
<style>
:root {
  color-scheme: light;
  --surface: #fcfcfb; --text-primary: #0b0b0b; --text-secondary: #52514e; --grid: #e4e3df; --border: #d6d5d0;
  --serie-1: #2a78d6; --serie-2: #eb6834; --serie-3: #1baf7a; --serie-4: #eda100; --serie-5: #e87ba4; --serie-6: #008300;
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    color-scheme: dark;
    --surface: #1a1a19; --text-primary: #f0efec; --text-secondary: #c3c2b7; --grid: #34332f; --border: #44433e;
    --serie-1: #3987e5; --serie-2: #d95926; --serie-3: #199e70; --serie-4: #c98500; --serie-5: #d55181; --serie-6: #008300;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --surface: #1a1a19; --text-primary: #f0efec; --text-secondary: #c3c2b7; --grid: #34332f; --border: #44433e;
  --serie-1: #3987e5; --serie-2: #d95926; --serie-3: #199e70; --serie-4: #c98500; --serie-5: #d55181; --serie-6: #008300;
}
body { margin: 0; background: var(--surface); color: var(--text-primary); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 1.5rem; margin: 0 0 4px; } h2 { font-size: 1.1rem; margin: 32px 0 4px; }
.nota, .resumen { color: var(--text-secondary); margin: 0 0 12px; }
svg { width: 100%; height: auto; display: block; }
svg text { font-size: 12px; fill: var(--text-primary); } svg .eje { fill: var(--text-secondary); }
.grilla { stroke: var(--grid); stroke-width: 1; } .bigote { stroke: var(--text-secondary); stroke-width: 2; }
${[1, 2, 3, 4, 5, 6].map((i) => `.serie-${i} { fill: var(--serie-${i}); background: var(--serie-${i}); }`).join("\n")}
.leyenda { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 8px 0 0; color: var(--text-secondary); font-size: 13px; }
.leyenda i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; }
details { margin-top: 8px; } summary { cursor: pointer; color: var(--text-secondary); font-size: 13px; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; display: block; overflow-x: auto; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); white-space: nowrap; }
th { color: var(--text-secondary); font-weight: 600; }
</style>
</head>
<body>
<main>
<h1>${escapar(titulo)}</h1>
<p class="resumen">${r.corridas} corridas con resultado · ${r.intentosConError} intentos con error de infraestructura (fuera de n, M1 y M4; su costo se suma al total).</p>
${secciones.join("\n")}
${comparaciones}
${iaceval}
</main>
</body>
</html>
`;
}
