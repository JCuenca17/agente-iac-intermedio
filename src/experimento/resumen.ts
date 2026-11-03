import type { FilaResultado } from "./ejecutor.js";
import { holm, mcnemarExacta, media, wilcoxon, wilson } from "./estadistica.js";

export interface ResumenConfiguracion {
  configuracion: string;
  /** Corridas con resultado (sin contar las que terminaron con error). */
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
  /** Intentos que terminaron con error de infraestructura (no entran en n ni en M1-M4). */
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
  /** Valores p ajustados con Holm sobre todas las comparaciones de la base. */
  pM1Holm: number;
  pM4Holm: number;
  pCostoHolm: number;
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
  /** Corridas con resultado, una por (caso, configuración, repetición). */
  corridas: number;
  /** Intentos que terminaron con error de infraestructura; se informan aparte. */
  intentosConError: number;
  /** Solo si hay tareas de IaC-Eval: métricas de S12 por configuración. */
  iaceval: ResumenIaCEval[];
  porConfiguracion: ResumenConfiguracion[];
  porNivel: { configuracion: string; nivel: string; n: number; m1: number; m4Media: number }[];
  comparaciones: Comparacion[];
  reglasMasFrecuentes: { regla: string; corridas: number }[];
}

const tokensTotales = (f: FilaResultado) => f.uso.entrada + f.uso.cacheEscritura + f.uso.cacheLectura;
const esPropio = (f: FilaResultado) => !f.iaceval;

/**
 * Separa las corridas con resultado de los intentos con error de infraestructura (API caída,
 * emulador colgado). Si una corrida se repitió, vale el último resultado sin error.
 */
export function separarErrores(todas: FilaResultado[]): { validas: FilaResultado[]; errores: FilaResultado[] } {
  const ultima = new Map<string, FilaResultado>();
  for (const f of todas) if (f.motivo !== "error") ultima.set(`${f.caso}|${f.configuracion}|${f.repeticion}`, f);
  return { validas: [...ultima.values()], errores: todas.filter((f) => f.motivo === "error") };
}

function resumirConfiguracion(configuracion: string, filas: FilaResultado[], errores: FilaResultado[]): ResumenConfiguracion {
  const exitos = filas.filter((f) => f.m1).length;
  const erroresPorCapa: Record<string, number> = {};
  for (const f of filas) for (const [capa, n] of Object.entries(f.erroresPorCapa)) erroresPorCapa[capa] = (erroresPorCapa[capa] ?? 0) + n;
  // El costo total incluye lo que gastaron los intentos con error: es dinero gastado.
  const costoTotalUsd = [...filas, ...errores].reduce((s, f) => s + f.costoUsd, 0);
  return {
    configuracion,
    n: filas.length,
    m1: { exitos, ...wilson(exitos, filas.length) },
    // M4 proporcional solo en los casos propios; en IaC-Eval la corrección se resume aparte.
    m4Media: media(filas.filter(esPropio).map((f) => f.m4)),
    m3Media: media(filas.map((f) => f.m3)),
    iteracionesMedia: media(filas.map((f) => f.iteraciones)),
    llamadasMedia: media(filas.map((f) => f.llamadas)),
    costoTotalUsd,
    costoMedioUsd: media(filas.map((f) => f.costoUsd)),
    tokensEntradaMedia: media(filas.map(tokensTotales)),
    tokensSalidaMedia: media(filas.map((f) => f.uso.salida)),
    duracionMediaS: media(filas.map((f) => f.duracionMs / 1000)),
    errores: errores.length,
    erroresPorCapa,
  };
}

/**
 * Compara dos configuraciones con los pares (caso, repetición) que tienen ambas, sin los
 * intentos con error. M4 se compara solo en los casos propios. Los valores p ajustados
 * con Holm los completa `resumir`, que conoce la familia de comparaciones.
 */
export function comparar(todas: FilaResultado[], base: string, contra: string): Comparacion {
  const { validas: filas } = separarErrores(todas);
  const clave = (f: FilaResultado) => `${f.caso}|${f.repeticion}`;
  const deContra = new Map(filas.filter((f) => f.configuracion === contra).map((f) => [clave(f), f]));
  const pares = filas.filter((f) => f.configuracion === base && deContra.has(clave(f))).map((f) => [f, deContra.get(clave(f))!] as const);
  const b = pares.filter(([x, y]) => x.m1 && !y.m1).length;
  const c = pares.filter(([x, y]) => !x.m1 && y.m1).length;
  const dM4 = pares.filter(([x]) => esPropio(x)).map(([x, y]) => x.m4 - y.m4);
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
    pM1Holm: mcnemarExacta(b, c),
    pM4Holm: wilcoxon(dM4).p,
    pCostoHolm: wilcoxon(dCosto).p,
  };
}

/** Ajusta con Holm los valores p de cada métrica sobre la familia de comparaciones. */
function ajustarHolm(comparaciones: Comparacion[]): Comparacion[] {
  const m1 = holm(comparaciones.map((c) => c.pM1));
  const m4 = holm(comparaciones.map((c) => c.pM4));
  const costo = holm(comparaciones.map((c) => c.pCosto));
  return comparaciones.map((c, i) => ({ ...c, pM1Holm: m1[i], pM4Holm: m4[i], pCostoHolm: costo[i] }));
}

/** Resume un experimento: métricas por configuración y por nivel, y comparaciones pareadas de T. */
export function resumir(todas: FilaResultado[], base = "T"): Resumen {
  const { validas: filas, errores } = separarErrores(todas);
  const configuraciones = [...new Set(todas.map((f) => f.configuracion))].sort((a, b) => (a === base ? -1 : b === base ? 1 : a.localeCompare(b)));
  const niveles = [...new Set(filas.map((f) => f.nivel))].sort();

  const porNivel = configuraciones.flatMap((configuracion) =>
    niveles.map((nivel) => {
      const fs = filas.filter((f) => f.configuracion === configuracion && f.nivel === nivel);
      return { configuracion, nivel, n: fs.length, m1: fs.length ? fs.filter((f) => f.m1).length / fs.length : 0, m4Media: media(fs.filter(esPropio).map((f) => f.m4)) };
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
    intentosConError: errores.length,
    iaceval,
    porConfiguracion: configuraciones.map((c) =>
      resumirConfiguracion(
        c,
        filas.filter((f) => f.configuracion === c),
        errores.filter((f) => f.configuracion === c),
      ),
    ),
    porNivel,
    comparaciones: filas.some((f) => f.configuracion === base)
      ? ajustarHolm(configuraciones.filter((c) => c !== base).map((c) => comparar(filas, base, c)))
      : [],
    reglasMasFrecuentes: [...reglas].map(([regla, corridas]) => ({ regla, corridas })).sort((a, b) => b.corridas - a.corridas || a.regla.localeCompare(b.regla)).slice(0, 15),
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
const pval = (p: number) => (p < 0.001 ? "< 0.001" : p.toFixed(3));

/** Informe en Markdown, listo para revisar o copiar al artículo. */
export function informeMarkdown(r: Resumen): string {
  const l: string[] = [
    `# Resumen del experimento`,
    "",
    `Corridas con resultado: ${r.corridas}. Intentos con error de infraestructura: ${r.intentosConError} (no entran en n, M1 ni M4; su costo sí se suma al total).`,
    "",
  ];

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
    l.push("| Comparación | Pares | Solo base acierta | Solo la otra acierta | Diferencia M1 (pp) | p McNemar (Holm) | Diferencia M4 | p Wilcoxon (Holm) | Diferencia de costo (USD) | p Wilcoxon (Holm) |");
    l.push("|---|---|---|---|---|---|---|---|---|---|");
    for (const c of r.comparaciones) {
      l.push(
        `| ${c.base} vs ${c.contra} | ${c.pares} | ${c.b} | ${c.c} | ${c.diferenciaM1pp.toFixed(1)} | ${pval(c.pM1)} (${pval(c.pM1Holm)}) | ${(c.diferenciaM4 * 100).toFixed(1)} pp | ${pval(c.pM4)} (${pval(c.pM4Holm)}) | ${c.diferenciaCostoUsd.toFixed(4)} | ${pval(c.pCosto)} (${pval(c.pCostoHolm)}) |`,
      );
    }
    l.push(
      "",
      "Las diferencias son de la configuración base menos la otra. Entre paréntesis, el valor p ajustado con Holm sobre todas las comparaciones de la base. Las repeticiones de un mismo caso se tratan como pares distintos (como en S08); no son del todo independientes, lo que se declara como amenaza a la validez. Con pocas corridas, una diferencia puede no ser significativa: se reporta su tamaño junto con el valor p.",
    );
  }
  return l.join("\n") + "\n";
}
