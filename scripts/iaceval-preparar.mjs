// Prepara la muestra de IaC-Eval (Kon et al., NeurIPS 2024; datos CC-BY-4.0).
// Uso: npm run iaceval:preparar [-- --por-nivel 10 --intentos 20]
//
// 1. Descarga el dataset en una versión fijada (a .cache/iaceval/).
// 2. Descarta las tareas que usan otros proveedores además de AWS.
// 3. Para cada candidata (en orden aleatorio con semilla fija, por nivel de dificultad):
//    toma su solución de referencia sin los bloques terraform/provider (apuntan a una
//    cuenta real de los autores), le pone la configuración del emulador y comprueba que
//    planifique, cumpla su propia política Rego, se despliegue sin cambios pendientes y se destruya.
// 4. Guarda en experimento/iaceval/ las tareas aceptadas (requerimiento, política y referencia).
// Es reanudable: los resultados de cada candidata quedan en .cache/iaceval/filtrado.jsonl.

import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { desplegar, destruir } from "../dist/src/despliegue/despliegue.js";
import { evaluarRegoIaCEval } from "../dist/src/experimento/iaceval.js";
import { RAIZ, enRaiz } from "../dist/src/rutas.js";
import { configuracionProveedor } from "../dist/src/traductor/opentofu.js";
import { validarConOpenTofu } from "../dist/src/validador/c4-opentofu.js";

const REVISION = "4a4e68a48d1d2bf3cb553a0afbcd173e1b519ff8";
const URL_DATOS = `https://huggingface.co/datasets/autoiac-project/iac-eval/resolve/${REVISION}/data.csv`;
const SEMILLA = 2026;

const { values } = parseArgs({ options: { "por-nivel": { type: "string", default: "10" }, intentos: { type: "string", default: "20" } } });
const POR_NIVEL = Number(values["por-nivel"]);
const INTENTOS = Number(values.intentos);
for (const [nombre, valor] of [["--por-nivel", POR_NIVEL], ["--intentos", INTENTOS]]) {
  if (!Number.isInteger(valor) || valor < 1) throw new Error(`${nombre} debe ser un entero mayor o igual que 1`);
}

if (existsSync(join(RAIZ, ".env"))) process.loadEnvFile(join(RAIZ, ".env"));
const endpoint = process.env.AWS_ENDPOINT || "http://localhost:4566";
const region = process.env.AWS_REGION || "us-east-1";
const versiones = JSON.parse(readFileSync(enRaiz("versiones.json"), "utf8"));
const cache = enRaiz(".cache", "iaceval");
const destino = enRaiz("experimento", "iaceval");
mkdirSync(cache, { recursive: true });

// --- Datos ---------------------------------------------------------------------------------
const archivoDatos = join(cache, `data-${REVISION.slice(0, 8)}.csv`);
if (!existsSync(archivoDatos)) {
  console.log("Descargando IaC-Eval...");
  const r = await fetch(URL_DATOS);
  if (!r.ok) throw new Error(`No se pudo descargar ${URL_DATOS}: ${r.status}`);
  writeFileSync(archivoDatos, await r.text());
}

/** Lector de CSV (RFC 4180): comillas dobles, saltos de línea dentro de campos. */
function leerCsv(texto) {
  const filas = [];
  let fila = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo); filas.push(fila); fila = []; campo = "";
    } else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  const [cabecera, ...resto] = filas;
  return resto.filter((f) => f.length === cabecera.length).map((f) => Object.fromEntries(cabecera.map((k, i) => [k, f[i]])));
}

const tareas = leerCsv(readFileSync(archivoDatos, "utf8")).map((t, indice) => ({ ...t, indice }));
const tipos = (t) => t.Resource.split(",").map((x) => x.trim()).filter(Boolean);
const candidatas = tareas.filter((t) => tipos(t).every((x) => x.startsWith("aws_")));
console.log(`Tareas: ${tareas.length} · solo AWS: ${candidatas.length}`);

/** Quita los bloques de nivel superior terraform { } y provider "..." { } del código. */
function quitarBloques(codigo) {
  let salida = "";
  let i = 0;
  const inicio = /^(terraform|provider\s+"[^"]*")\s*\{/m;
  while (i < codigo.length) {
    const resto = codigo.slice(i);
    const m = resto.match(inicio);
    if (!m) { salida += resto; break; }
    salida += resto.slice(0, m.index);
    let j = i + m.index + m[0].length;
    let nivel = 1;
    let enTexto = false;
    while (j < codigo.length && nivel > 0) {
      const c = codigo[j];
      if (c === '"' && codigo[j - 1] !== "\\") enTexto = !enTexto;
      else if (!enTexto && c === "{") nivel++;
      else if (!enTexto && c === "}") nivel--;
      j++;
    }
    i = j;
  }
  return salida.trim() + "\n";
}

/** Aleatorio reproducible (mulberry32). */
function aleatorio(semilla) {
  return () => {
    semilla |= 0; semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Filtrado -----------------------------------------------------------------------------
const registro = join(cache, "filtrado.jsonl");
// Al reanudar se ignora una última línea cortada, y las tareas que fallaron por un error
// pasajero (por ejemplo, el emulador no respondía) se vuelven a probar.
const hechas = new Map();
if (existsSync(registro)) {
  for (const linea of readFileSync(registro, "utf8").split("\n").filter(Boolean)) {
    try {
      const x = JSON.parse(linea);
      if (x.etapa !== "error") hechas.set(x.indice, x);
    } catch {
      // línea incompleta de una ejecución interrumpida
    }
  }
}

/** Deja el emulador limpio: MiniStack tiene un endpoint de reinicio; Floci se reinicia. */
async function reiniciarEmulador() {
  if ((process.env.EMULADOR || "floci") === "ministack") {
    await fetch(`${endpoint}/_ministack/reset`, { method: "POST" }).catch(() => undefined);
    return;
  }
  spawnSync("docker", ["restart", process.env.FLOCI_CONTENEDOR || "floci"]);
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(endpoint, { signal: AbortSignal.timeout(2000) });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function probar(t) {
  const dir = join(cache, "trabajo", String(t.indice));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "main.tf"), quitarBloques(t["Reference output"]));
  writeFileSync(join(dir, "proveedor.tf.json"), JSON.stringify(configuracionProveedor({ endpoint, region, versionProveedor: versiones.proveedor_aws }), null, 2));
  copyFileSync(enRaiz("prueba-minima", ".terraform.lock.hcl"), join(dir, ".terraform.lock.hcl"));
  const r = { indice: t.indice, dificultad: t.Difficulty, aceptada: false, etapa: "" };
  const c4 = await validarConOpenTofu(dir);
  if (!c4.valido) return { ...r, etapa: "plan", detalle: c4.errores[0]?.mensaje?.slice(0, 200) };
  const rego = evaluarRegoIaCEval(t["Rego intent"], c4.plan);
  if (!rego.correcto) return { ...r, etapa: "rego", detalle: rego.error || "la referencia no cumple su propia política" };
  let d;
  let destruido;
  try {
    d = await desplegar(dir);
  } finally {
    destruido = await destruir(dir);
  }
  if (!d.aplicado) return { ...r, etapa: "apply", detalle: d.errores[0]?.mensaje?.slice(0, 200), destruido };
  if (!d.sinCambios) return { ...r, etapa: "plan-posterior", detalle: JSON.stringify(d.cambiosPendientes).slice(0, 200), destruido };
  return { ...r, aceptada: true, etapa: "ok", destruido, recursos: c4.resumen?.crear };
}

const azar = aleatorio(SEMILLA);
const niveles = ["1", "2", "3", "4", "5", "6"];
for (const nivel of niveles) {
  const pool = candidatas.filter((t) => t.Difficulty === nivel).map((t) => ({ t, k: azar() })).sort((a, b) => a.k - b.k).map((x) => x.t);
  let aceptadas = [...hechas.values()].filter((x) => x.dificultad === nivel && x.aceptada).length;
  let intentos = [...hechas.values()].filter((x) => x.dificultad === nivel).length;
  for (const t of pool) {
    if (aceptadas >= POR_NIVEL || intentos >= INTENTOS) break;
    if (hechas.has(t.indice)) continue;
    process.stdout.write(`Nivel ${nivel} · tarea ${t.indice}: `);
    let r;
    try {
      r = await probar(t);
    } catch (e) {
      r = { indice: t.indice, dificultad: nivel, aceptada: false, etapa: "error", detalle: String(e.message).slice(0, 200) };
    }
    if (r.destruido === false || r.etapa === "error") await reiniciarEmulador();
    appendFileSync(registro, JSON.stringify(r) + "\n");
    if (r.etapa !== "error") hechas.set(t.indice, r);
    intentos++;
    if (r.aceptada) aceptadas++;
    console.log(r.aceptada ? "aceptada" : `descartada en ${r.etapa}`);
  }
  console.log(`Nivel ${nivel}: ${aceptadas} aceptadas en ${intentos} intentos`);
}

// --- Selección final ----------------------------------------------------------------------
// Como mucho POR_NIVEL por nivel (si se reanuda con un valor menor que el anterior).
const aceptadas = niveles
  .flatMap((n) => [...hechas.values()].filter((x) => x.aceptada && x.dificultad === n).slice(0, POR_NIVEL))
  .sort((a, b) => a.dificultad.localeCompare(b.dificultad) || a.indice - b.indice);
if (!aceptadas.length) throw new Error("No se aceptó ninguna tarea; no se cambia la selección anterior");
rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
for (const a of aceptadas) {
  const t = tareas[a.indice];
  const d = join(destino, `IE${String(a.indice).padStart(3, "0")}`);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "requerimiento.md"), t.Prompt.trim() + "\n");
  writeFileSync(join(d, "policy.rego"), t["Rego intent"]);
  writeFileSync(join(d, "referencia.tf"), quitarBloques(t["Reference output"]));
  writeFileSync(join(d, "tarea.json"), JSON.stringify({ indice: a.indice, dificultad: Number(a.dificultad), recursos: tipos(t), intencion: t.Intent }, null, 2) + "\n");
}
const resumenNiveles = Object.fromEntries(niveles.map((n) => [n, aceptadas.filter((a) => a.dificultad === n).length]));
writeFileSync(
  join(destino, "seleccion.json"),
  JSON.stringify({ fuente: "autoiac-project/iac-eval", revision: REVISION, semilla: SEMILLA, porNivel: POR_NIVEL, intentosPorNivel: INTENTOS, aceptadasPorNivel: resumenNiveles, tareas: aceptadas.map((a) => a.indice) }, null, 2) + "\n",
);
writeFileSync(
  join(destino, "ATRIBUCION.md"),
  `# IaC-Eval\n\nLas tareas de esta carpeta (requerimiento, política Rego e implementación de referencia) provienen del dataset IaC-Eval:\n\nP. T. J. Kon et al., "IaC-Eval: A code generation benchmark for cloud infrastructure-as-code programs", NeurIPS 2024, Datasets and Benchmarks Track.\nhttps://huggingface.co/datasets/autoiac-project/iac-eval (revisión ${REVISION})\n\nLicencia de los datos: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).\n\nCambios: de cada implementación de referencia se quitaron los bloques \`terraform\` y \`provider\`, porque apuntaban a una cuenta real de AWS; la herramienta los reemplaza por la configuración del emulador. Se seleccionaron solo las tareas cuya referencia funciona en el emulador (ver seleccion.json y scripts/iaceval-preparar.mjs).\n`,
);
console.log(`\nSeleccionadas: ${aceptadas.length} · por nivel: ${JSON.stringify(resumenNiveles)} · en ${destino}`);
