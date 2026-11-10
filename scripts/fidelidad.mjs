// Fidelidad del diagrama: compara lo que vería el revisor (diagrama del artefacto) con el
// código que se despliega (main.tf.json final) y con lo desplegado (estado de OpenTofu).
// Uso: node scripts/fidelidad.mjs resultados/<carpeta>   (escribe fidelidad.json y fidelidad.md)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const carpeta = process.argv[2];
if (!carpeta) throw new Error("Uso: node scripts/fidelidad.mjs <carpeta de resultados>");
const filas = readFileSync(join(carpeta, "resultados.jsonl"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

const par = (a, b) => [a, b].sort().join(" ~ ");

/** Recursos y referencias directas del main.tf.json (dirección tipo.id). */
function codigo(archivo) {
  const tf = JSON.parse(readFileSync(archivo, "utf8"));
  const recursos = new Set();
  const aristas = new Set();
  for (const [tipo, porId] of Object.entries(tf.resource ?? {})) for (const id of Object.keys(porId)) recursos.add(`${tipo}.${id}`);
  for (const [tipo, porId] of Object.entries(tf.resource ?? {})) {
    for (const [id, cuerpo] of Object.entries(porId)) {
      const origen = `${tipo}.${id}`;
      const texto = JSON.stringify(cuerpo);
      for (const m of texto.matchAll(/\$\{(aws_[a-z0-9_]+)\.([a-z0-9_]+)\./g)) {
        const destino = `${m[1]}.${m[2]}`;
        if (destino !== origen && recursos.has(destino)) aristas.add(par(origen, destino));
      }
      for (const d of cuerpo.depends_on ?? []) if (recursos.has(d) && d !== origen) aristas.add(par(origen, d));
    }
  }
  return { recursos, aristas };
}

/**
 * Recursos administrados justo después del apply. El destroy reescribe terraform.tfstate y
 * deja el estado anterior en el respaldo; si el destroy quedó a medias, el estado actual solo
 * tiene lo que no se pudo borrar. Por eso se toma el de más recursos.
 */
function desplegado(dir) {
  let mayor = null;
  for (const nombre of ["terraform.tfstate", "terraform.tfstate.backup"]) {
    const archivo = join(dir, nombre);
    if (!existsSync(archivo)) continue;
    const estado = JSON.parse(readFileSync(archivo, "utf8"));
    const rs = (estado.resources ?? []).filter((r) => r.mode === "managed");
    if (rs.length && (!mayor || rs.length > mayor.size)) mayor = new Set(rs.map((r) => `${r.type}.${r.name}`));
  }
  return mayor;
}

/** Nodos y flechas del diagrama, leídos del diagrama.mmd que se mostró. */
function diagrama(archivo, tipoPorId) {
  const mmd = readFileSync(archivo, "utf8");
  const nodos = new Set([...mmd.matchAll(/^\s+r_([a-z0-9_]+)[[(]/gm)].map((m) => `${tipoPorId.get(m[1])}.${m[1]}`));
  const aristas = new Set();
  for (const m of mmd.matchAll(/r_([a-z0-9_]+) -\.?->\|[^|]*\| r_([a-z0-9_]+)/g)) {
    if (m[1] !== m[2]) aristas.add(par(`${tipoPorId.get(m[1])}.${m[1]}`, `${tipoPorId.get(m[2])}.${m[2]}`));
  }
  return { nodos, aristas };
}

/** ¿Están a dos pasos en el grafo del código (por ejemplo, Lambda → política IAM → tabla)? */
function aDosPasos(a, b, aristasCodigo) {
  const vecinos = (x) => [...aristasCodigo].flatMap((p) => { const [u, v] = p.split(" ~ "); return u === x ? [v] : v === x ? [u] : []; });
  const va = new Set(vecinos(a));
  return vecinos(b).some((v) => va.has(v));
}

const iguales = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const salida = [];
for (const f of filas) {
  const dir = join(carpeta, "corridas", f.caso, f.configuracion, `rep-${f.repeticion}`);
  if (!existsSync(join(dir, "artefacto.json"))) continue;
  const artefacto = JSON.parse(readFileSync(join(dir, "artefacto.json"), "utf8"));
  const tipoPorId = new Map(artefacto.recursos.map((r) => [r.id, r.tipo]));
  const iters = readdirSync(join(dir, "trabajo")).filter((d) => d.startsWith("iter-")).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
  const final = join(dir, "trabajo", iters.at(-1));
  const c = codigo(join(final, "main.tf.json"));
  const d = diagrama(join(dir, "diagrama.mmd"), tipoPorId);
  const e = f.aplicado ? desplegado(final) : null;
  const cubiertas = [...c.aristas].filter((x) => d.aristas.has(x));
  const sinDirecta = [...d.aristas].filter((x) => !c.aristas.has(x));
  const logicas = sinDirecta.filter((x) => aDosPasos(...x.split(" ~ "), c.aristas));
  salida.push({
    caso: f.caso,
    m1: f.m1,
    recursos: c.recursos.size,
    diagramaIgualCodigo: iguales(d.nodos, c.recursos),
    desplegadoIgualCodigo: e ? iguales(e, c.recursos) : null,
    referenciasCodigo: c.aristas.size,
    referenciasEnDiagrama: cubiertas.length,
    flechasDiagrama: d.aristas.size,
    flechasConReferencia: d.aristas.size - sinDirecta.length,
    flechasLogicas: logicas.length,
    flechasSinRespaldo: sinDirecta.filter((x) => !logicas.includes(x)),
    referenciasFaltantes: [...c.aristas].filter((x) => !d.aristas.has(x)),
  });
}

writeFileSync(join(carpeta, "fidelidad.json"), JSON.stringify(salida, null, 2));
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)} %` : "—");
const suma = (k) => salida.reduce((s, x) => s + x[k], 0);
const lineas = [
  "# Fidelidad del diagrama", "",
  "| Caso | M1 | Recursos | Diagrama = código | Desplegado = código | Referencias del código en el diagrama | Flechas con referencia directa | Flechas lógicas (a dos pasos) | Flechas sin respaldo |",
  "|---|---|---|---|---|---|---|---|---|",
  ...salida.map((x) => `| ${x.caso} | ${x.m1 ? "sí" : "no"} | ${x.recursos} | ${x.diagramaIgualCodigo ? "sí" : "no"} | ${x.desplegadoIgualCodigo === null ? "—" : x.desplegadoIgualCodigo ? "sí" : "no"} | ${x.referenciasEnDiagrama}/${x.referenciasCodigo} | ${x.flechasConReferencia}/${x.flechasDiagrama} | ${x.flechasLogicas} | ${x.flechasSinRespaldo.length} |`),
  "",
  `Total: ${salida.length} corridas con artefacto; diagrama igual al código en ${salida.filter((x) => x.diagramaIgualCodigo).length}; desplegado igual al código en ${salida.filter((x) => x.desplegadoIgualCodigo).length} de ${salida.filter((x) => x.desplegadoIgualCodigo !== null).length} desplegadas.`,
  `Referencias del código que el diagrama muestra: ${suma("referenciasEnDiagrama")} de ${suma("referenciasCodigo")} (${pct(suma("referenciasEnDiagrama"), suma("referenciasCodigo"))}).`,
  `Flechas del diagrama: ${suma("flechasDiagrama")}; con referencia directa ${suma("flechasConReferencia")}, lógicas a dos pasos ${suma("flechasLogicas")}, sin respaldo ${salida.reduce((s, x) => s + x.flechasSinRespaldo.length, 0)}.`,
];
writeFileSync(join(carpeta, "fidelidad.md"), lineas.join("\n") + "\n");
console.log(lineas.join("\n"));
