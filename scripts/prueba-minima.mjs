// Prueba mínima: despliega la solución de referencia de cada caso en el emulador
// y registra qué funciona. Uso: node scripts/prueba-minima.mjs [C01 C02 ...]
//
// Por cada caso: tofu init -> apply -> plan (debe salir sin cambios) -> destroy.
// Lee AWS_ENDPOINT y AWS_REGION del entorno o del .env. No usa ningún servicio de pago.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(raiz, ".env"))) process.loadEnvFile(join(raiz, ".env"));

const endpoint = process.env.AWS_ENDPOINT || "http://localhost:4566";
const region = process.env.AWS_REGION || "us-east-1";
const emulador = process.env.EMULADOR || "floci";
const dirPrueba = join(raiz, "prueba-minima");
const dirCasos = join(dirPrueba, "casos");
const dirTrabajo = join(dirPrueba, ".trabajo");
const cachePlugins = join(dirPrueba, ".cache-plugins");
const zipLambda = join(raiz, "recursos", "lambda", "minima.zip").replaceAll("\\", "/");

mkdirSync(cachePlugins, { recursive: true });

const pedidos = process.argv.slice(2);
const casos = readdirSync(dirCasos, { withFileTypes: true })
  .filter((e) => e.isDirectory() && (pedidos.length === 0 || pedidos.includes(e.name)))
  .map((e) => e.name)
  .sort();

function tofu(args, cwd) {
  const r = spawnSync("tofu", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      // Todo servicio va al emulador, también los que no están en la lista de endpoints.
      AWS_ENDPOINT_URL: endpoint,
      AWS_ACCESS_KEY_ID: "test",
      AWS_SECRET_ACCESS_KEY: "test",
      AWS_SESSION_TOKEN: "",
      AWS_PROFILE: "",
      AWS_EC2_METADATA_DISABLED: "true",
      TF_PLUGIN_CACHE_DIR: cachePlugins,
      TF_IN_AUTOMATION: "1",
    },
  });
  if (r.error) throw new Error(`No se pudo ejecutar tofu: ${r.error.message}. ¿Está instalado y en el PATH?`);
  return { codigo: r.status, salida: (r.stdout || "") + (r.stderr || "") };
}

function primerError(salida) {
  const lineas = salida.split(/\r?\n/);
  const i = lineas.findIndex((l) => l.includes("Error:"));
  if (i < 0) return "";
  return lineas.slice(i, i + 4).map((l) => l.replace(/[│╷╵]/g, "").trim()).filter(Boolean).join(" ").slice(0, 300);
}

async function reiniciarEmulador() {
  // MiniStack expone /_ministack/reset. Floci no tiene un endpoint equivalente; no hace
  // falta, porque cada caso usa nombres propios y se destruye al terminar.
  if (emulador !== "ministack") return;
  try {
    await fetch(`${endpoint}/_ministack/reset`, { method: "POST" });
  } catch {
    /* sin reinicio disponible */
  }
}

const vars = ["-var", `endpoint=${endpoint}`, "-var", `region=${region}`, "-var", `ruta_lambda_zip=${zipLambda}`];
const resultados = [];

for (const caso of casos) {
  const trabajo = join(dirTrabajo, caso);
  rmSync(trabajo, { recursive: true, force: true });
  mkdirSync(trabajo, { recursive: true });
  cpSync(join(dirPrueba, "proveedor.tf"), join(trabajo, "proveedor.tf"));
  // La carpeta completa del caso: main.tf y sus archivos auxiliares (por ejemplo, plantillas de R2).
  cpSync(join(dirCasos, caso), trabajo, { recursive: true });
  if (existsSync(join(dirPrueba, ".terraform.lock.hcl"))) {
    cpSync(join(dirPrueba, ".terraform.lock.hcl"), join(trabajo, ".terraform.lock.hcl"));
  }

  await reiniciarEmulador();
  const r = { caso, init: false, apply: false, planSinCambios: false, destroy: false, error: "" };
  process.stdout.write(`${caso}: `);

  const init = tofu(["init", "-input=false", "-no-color"], trabajo);
  r.init = init.codigo === 0;
  if (!r.init) r.error = primerError(init.salida);
  else if (!existsSync(join(dirPrueba, ".terraform.lock.hcl"))) {
    cpSync(join(trabajo, ".terraform.lock.hcl"), join(dirPrueba, ".terraform.lock.hcl"));
  }

  if (r.init) {
    const apply = tofu(["apply", "-auto-approve", "-input=false", "-no-color", ...vars], trabajo);
    r.apply = apply.codigo === 0;
    if (!r.apply) r.error = primerError(apply.salida);
  }

  if (r.apply) {
    // -detailed-exitcode: 0 = sin cambios, 2 = hay cambios pendientes, 1 = error
    const plan = tofu(["plan", "-detailed-exitcode", "-input=false", "-no-color", ...vars], trabajo);
    r.planSinCambios = plan.codigo === 0;
    if (plan.codigo === 2) {
      const cambios = plan.salida.split(/\r?\n/).filter((l) => /^\s*# .* (will|must) be/.test(l)).map((l) => l.trim());
      r.error = `Cambios pendientes tras apply: ${cambios.join("; ").slice(0, 300)}`;
    } else if (plan.codigo === 1) r.error = primerError(plan.salida);
  }

  if (r.init) {
    const destroy = tofu(["destroy", "-auto-approve", "-input=false", "-no-color", ...vars], trabajo);
    r.destroy = destroy.codigo === 0;
    if (!r.destroy && !r.error) r.error = primerError(destroy.salida);
  }

  console.log(r.apply && r.planSinCambios ? "OK" : `FALLA (${r.error || "sin detalle"})`);
  resultados.push(r);
}

// Si se corrieron solo algunos casos, se conservan los resultados previos de los demás.
const archivoJson = join(dirPrueba, `resultados-${emulador}.json`);
if (pedidos.length > 0 && existsSync(archivoJson)) {
  const previos = JSON.parse(readFileSync(archivoJson, "utf8"));
  if (previos.emulador === emulador) {
    for (const r of previos.resultados) if (!resultados.some((x) => x.caso === r.caso)) resultados.push(r);
    resultados.sort((x, y) => x.caso.localeCompare(y.caso));
  }
}

const marca = (v) => (v ? "sí" : "no");
const tabla = [
  `Emulador: ${emulador} en ${endpoint} · Región: ${region} · Fecha: ${new Date().toISOString()}`,
  "",
  "| Caso | init | apply | plan sin cambios | destroy | Detalle |",
  "|---|---|---|---|---|---|",
  ...resultados.map((r) => `| ${r.caso} | ${marca(r.init)} | ${marca(r.apply)} | ${marca(r.planSinCambios)} | ${marca(r.destroy)} | ${r.error.replaceAll("|", "/")} |`),
].join("\n");

writeFileSync(archivoJson, JSON.stringify({ emulador, endpoint, region, resultados }, null, 2));
writeFileSync(join(dirPrueba, `resultados-${emulador}.md`), tabla + "\n");
console.log(`\n${resultados.filter((r) => r.apply && r.planSinCambios).length}/${resultados.length} casos OK`);
