import type { FilaResultado } from "./ejecutor.js";
import { mcnemarExacta, media, wilcoxon, wilson } from "./estadistica.js";

export interface ResumenConfiguracion {
  configuracion: string;
  n: number;
  m1: { exitos: number; p: number; inferior: number; superior: number };
  m4Media: number;
  m3Media: number;
  iteracionesMedia: number;
  llamadasMedia: number;
  costoTotalUsd: number;
  costoMedioUsd: number;
  tokensEntradaMedia: number;
  tokensSalidaMedia: number;
  duracionMediaS: number;
  errores: number;
  /** M2: errores detectados antes del despliegue, por capa (suma de todas las corridas). */
  erroresPorCapa: Record<string, number>;
}

export interface Comparacion {
  base: string;
  contra: string;
  pares: number;
  /** M1: pares donde solo `base` acierta (b) y donde solo `contra` acierta (c). */
  b: number;
  c: number;
  diferenciaM1pp: number;
  pM1: number;
  diferenciaM4: number;
  pM4: number;
  diferenciaCostoUsd: number;
  pCosto: number;
}

export interface ResumenIaCEval {
  configuracion: string;
  n: number;
  compilabilidad: number;
  desplegabilidad: number;
  correccion: { p: number; inferior: number; superior: number };
  m1: number;
}

export interface Resumen {
  corridas: number;
  /** Solo si hay tareas de IaC-Eval: métricas de S12 por configuración. */
  iaceval: ResumenIaCEval[];
  porConfiguracion: ResumenConfiguracion[];
  porNivel: { configuracion: string; nivel: string; n: number; m1: number; m4Media: number }[];
  comparaciones: Comparacion[];
  reglasMasFrecuentes: { regla: string; corridas: number }[];
}

const tokensTotales = (f: FilaResultado) => f.uso.entrada + f.uso.cacheEscritura + f.uso.cacheLectura;

function resumirConfiguracion(configuracion: string, filas: FilaResultado[]): ResumenConfiguracion {
  const exitos = filas.filter((f) => f.m1).length;
  const erroresPorCapa: Record<string, number> = {};
  for (const f of filas) for (const [capa, n] of Object.entries(f.erroresPorCapa)) erroresPorCapa[capa] = (erroresPorCapa[capa] ?? 0) + n;
  const costoTotalUsd = filas.reduce((s, f) => s + f.costoUsd, 0);
  return {
    configuracion,
    n: filas.length,
    m1: { exitos, ...wilson(exitos, filas.length) },
    m4Media: media(filas.map((f) => f.m4)),
    m3Media: media(filas.map((f) => f.m3)),
    iteracionesMedia: media(filas.map((f) => f.iteraciones)),
    llamadasMedia: media(filas.map((f) => f.llamadas)),
    costoTotalUsd,
    costoMedioUsd: filas.length ? costoTotalUsd / filas.length : 0,
    tokensEntradaMedia: media(filas.map(tokensTotales)),
    tokensSalidaMedia: media(filas.map((f) => f.uso.salida)),
    duracionMediaS: media(filas.map((f) => f.duracionMs / 1000)),
    errores: filas.filter((f) => f.motivo === "error").length,
    erroresPorCapa,
  };
}

/** Compara dos configuraciones con los pares (caso, repetición) que tienen ambas. */
export function comparar(filas: FilaResultado[], base: string, contra: string): Comparacion {
  const clave = (f: FilaResultado) => `${f.caso}|${f.repeticion}`;
  const deContra = new Map(filas.filter((f) => f.configuracion === contra).map((f) => [clave(f), f]));
  const pares = filas.filter((f) => f.configuracion === base && deContra.has(clave(f))).map((f) => [f, deContra.get(clave(f))!] as const);
  const b = pares.filter(([x, y]) => x.m1 && !y.m1).length;
  const c = pares.filter(([x, y]) => !x.m1 && y.m1).length;
  const dM4 = pares.map(([x, y]) => x.m4 - y.m4);
  const dCosto = pares.map(([x, y]) => x.costoUsd - y.costoUsd);
  return {
    base,
    contra,
    pares: pares.length,
    b,
    c,
    diferenciaM1pp: pares.length ? ((b - c) / pares.length) * 100 : 0,
    pM1: mcnemarExacta(b, c),
    diferenciaM4: media(dM4),
    pM4: wilcoxon(dM4).p,
    diferenciaCostoUsd: media(dCosto),
    pCosto: wilcoxon(dCosto).p,
  };
}

/** Resume un experimento: métricas por configuración y por nivel, y comparaciones pareadas de T. */
export function resumir(filas: FilaResultado[], base = "T"): Resumen {
  const configuraciones = [...new Set(filas.map((f) => f.configuracion))].sort((a, b) => (a === base ? -1 : b === base ? 1 : a.localeCompare(b)));
  const niveles = [...new Set(filas.map((f) => f.nivel))].sort();

  const porNivel = configuraciones.flatMap((configuracion) =>
    niveles.map((nivel) => {
      const fs = filas.filter((f) => f.configuracion === configuracion && f.nivel === nivel);
      return { configuracion, nivel, n: fs.length, m1: fs.length ? fs.filter((f) => f.m1).length / fs.length : 0, m4Media: media(fs.map((f) => f.m4)) };
    }),
  );

  const reglas = new Map<string, number>();
  for (const f of filas) for (const r of f.reglasDetectadas) reglas.set(r, (reglas.get(r) ?? 0) + 1);

  const deIaCEval = filas.filter((f) => f.iaceval);
  const iaceval = configuraciones
    .map((configuracion) => {
      const fs = deIaCEval.filter((f) => f.configuracion === configuracion);
      return {
        configuracion,
        n: fs.length,
        compilabilidad: media(fs.map((f) => (f.iaceval!.compila ? 1 : 0))),
        desplegabilidad: media(fs.map((f) => (f.iaceval!.desplegable ? 1 : 0))),
        correccion: wilson(fs.filter((f) => f.iaceval!.correcto).length, fs.length),
        m1: media(fs.map((f) => (f.m1 ? 1 : 0))),
      };
    })
    .filter((x) => x.n > 0);

  return {
    corridas: filas.length,
    iaceval,
    porConfiguracion: configuraciones.map((c) => resumirConfiguracion(c, filas.filter((f) => f.configuracion === c))),
    porNivel,
    comparaciones: filas.some((f) => f.configuracion === base)
      ? configuraciones.filter((c) => c !== base).map((c) => comparar(filas, base, c))
      : [],
    reglasMasFrecuentes: [...reglas].map(([regla, corridas]) => ({ regla, corridas })).sort((a, b) => b.corridas - a.corridas || a.regla.localeCompare(b.regla)).slice(0, 15),
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
const pval = (p: number) => (p < 0.001 ? "< 0.001" : p.toFixed(3));

/** Informe en Markdown, listo para revisar o copiar al artículo. */
export function informeMarkdown(r: Resumen): string {
  const l: string[] = [`# Resumen del experimento`, "", `Corridas: ${r.corridas}.`, ""];

  l.push("## Por configuración", "");
  l.push("| Config. | n | M1 despliegue exitoso [IC 95 %] | M4 cumplimiento | M3 violaciones | Iteraciones | Llamadas | Tokens entrada | Tokens salida | Costo medio (USD) | Costo total (USD) | Duración media (s) | Errores |");
  l.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const c of r.porConfiguracion) {
    l.push(
      `| ${c.configuracion} | ${c.n} | ${pct(c.m1.p)} [${pct(c.m1.inferior)}, ${pct(c.m1.superior)}] | ${pct(c.m4Media)} | ${c.m3Media.toFixed(2)} | ${c.iteracionesMedia.toFixed(2)} | ${c.llamadasMedia.toFixed(2)} | ${c.tokensEntradaMedia.toFixed(0)} | ${c.tokensSalidaMedia.toFixed(0)} | ${c.costoMedioUsd.toFixed(4)} | ${c.costoTotalUsd.toFixed(4)} | ${c.duracionMediaS.toFixed(1)} | ${c.errores} |`,
    );
  }

  const niveles = [...new Set(r.porNivel.map((x) => x.nivel))];
  l.push("", "## M1 por nivel de dificultad", "", `| Config. | ${niveles.join(" | ")} |`, `|---|${niveles.map(() => "---").join("|")}|`);
  for (const c of r.porConfiguracion) {
    const celdas = niveles.map((n) => {
      const x = r.porNivel.find((y) => y.configuracion === c.configuracion && y.nivel === n)!;
      return x.n ? `${pct(x.m1)} (n=${x.n})` : "—";
    });
    l.push(`| ${c.configuracion} | ${celdas.join(" | ")} |`);
  }

  l.push("", "## M2: errores detectados antes del despliegue, por capa", "", "| Config. | C0 | C1 | C2 | C3 | C4 |", "|---|---|---|---|---|---|");
  for (const c of r.porConfiguracion) {
    l.push(`| ${c.configuracion} | ${["C0", "C1", "C2", "C3", "C4"].map((k) => c.erroresPorCapa[k] ?? 0).join(" | ")} |`);
  }
  if (r.reglasMasFrecuentes.length) {
    l.push("", "Reglas detectadas con más frecuencia (número de corridas en que aparecen):", "");
    for (const x of r.reglasMasFrecuentes) l.push(`- ${x.regla}: ${x.corridas}`);
  }

  if (r.iaceval.length) {
    l.push("", "## IaC-Eval: métricas de S12 (protocolo de IaC-Eval, sobre el plan)", "");
    l.push("| Config. | Tareas | Compilabilidad | Desplegabilidad | Corrección [IC 95 %] | M1 en el emulador |", "|---|---|---|---|---|---|");
    for (const x of r.iaceval) {
      l.push(`| ${x.configuracion} | ${x.n} | ${pct(x.compilabilidad)} | ${pct(x.desplegabilidad)} | ${pct(x.correccion.p)} [${pct(x.correccion.inferior)}, ${pct(x.correccion.superior)}] | ${pct(x.m1)} |`);
    }
    l.push("", "Referencia publicada (S12, Tabla 2, otros modelos y AWS real para el plan): Claude Sonnet 3.7 35.37 % de corrección y 70.09 % de desplegabilidad; GPT-4.1 25.98 % y 56.99 %; TerraFormer 14B 31.44 % y 72.93 %.");
  }

  if (r.comparaciones.length) {
    l.push("", "## Comparaciones pareadas (mismo caso y repetición)", "");
    l.push("| Comparación | Pares | Solo base acierta | Solo la otra acierta | Diferencia M1 (pp) | p McNemar | Diferencia M4 | p Wilcoxon | Diferencia de costo (USD) | p Wilcoxon |");
    l.push("|---|---|---|---|---|---|---|---|---|---|");
    for (const c of r.comparaciones) {
      l.push(
        `| ${c.base} vs ${c.contra} | ${c.pares} | ${c.b} | ${c.c} | ${c.diferenciaM1pp.toFixed(1)} | ${pval(c.pM1)} | ${(c.diferenciaM4 * 100).toFixed(1)} pp | ${pval(c.pM4)} | ${c.diferenciaCostoUsd.toFixed(4)} | ${pval(c.pCosto)} |`,
      );
    }
    l.push("", "Las diferencias son de la configuración base menos la otra. Con pocas corridas, una diferencia puede no ser significativa: se reporta su tamaño junto con el valor p.");
  }
  return l.join("\n") + "\n";
}
