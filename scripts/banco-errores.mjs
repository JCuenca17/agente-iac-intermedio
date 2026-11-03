// Corre el banco de errores insertados con el validador real (C1-C4) y el emulador.
// Uso: npm run banco-errores
// No usa ningún modelo ni cuesta nada. Escribe experimento/banco-errores/resultados.{json,md}.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validarPorCapas } from "../dist/src/ciclo/ciclo.js";
import { evaluarBanco, generarBanco, TIPOS_ERROR } from "../dist/src/experimento/banco-errores.js";
import { cargarEsquemaProveedor } from "../dist/src/proveedor/esquema.js";
import { RAIZ, enRaiz } from "../dist/src/rutas.js";
import { Registro } from "../dist/src/trazas/registro.js";

if (existsSync(join(RAIZ, ".env"))) process.loadEnvFile(join(RAIZ, ".env"));
const leer = (n) => JSON.parse(readFileSync(enRaiz("test", "fixtures", "artefactos", `${n}.json`), "utf8"));
const versiones = JSON.parse(readFileSync(enRaiz("versiones.json"), "utf8"));
const esquema = cargarEsquemaProveedor();
const ctx = {
  esquema,
  endpoint: process.env.AWS_ENDPOINT || "http://localhost:4566",
  region: process.env.AWS_REGION || "us-east-1",
  versionProveedor: versiones.proveedor_aws,
  registro: new Registro(),
  iteracion: 1,
};

const casos = generarBanco({ c01: leer("c01-valido"), c03: leer("c03-valido"), c07: leer("c07-valido") });
const trabajo = mkdtempSync(join(tmpdir(), "banco-errores-"));
console.log(`Banco de errores: ${casos.length} casos · emulador ${ctx.endpoint}\n`);
const r = await evaluarBanco(casos, async (caso) => {
  const v = await validarPorCapas(caso.artefacto, join(trabajo, caso.id), ctx);
  const capa = v.valido ? "ninguna" : v.capaFallida;
  console.log(`${caso.id.padEnd(24)} esperada ${caso.capaEsperada} · detectada ${capa}${capa === caso.capaEsperada ? "" : "  <-- distinta"}`);
  return v;
});
rmSync(trabajo, { recursive: true, force: true });

const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(0)} %` : "—");
const filas = TIPOS_ERROR.map((t) => {
  const x = r.porTipo[t] ?? { casos: 0, detectados: 0, enCapaEsperada: 0, porCapa: {} };
  const capas = ["C1", "C2", "C3", "C4"].map((c) => x.porCapa[c] ?? 0).join(" | ");
  return `| ${t} | ${x.casos} | ${pct(x.detectados, x.casos)} | ${pct(x.enCapaEsperada, x.casos)} | ${capas} |`;
});
const distintos = r.resultados.filter((x) => !x.enCapaEsperada);
const md = [
  "# Banco de errores insertados: resultados",
  "",
  `Fecha: ${new Date().toISOString().slice(0, 10)} · Emulador: ${ctx.endpoint} · Proveedor AWS ${versiones.proveedor_aws}`,
  "",
  "Cada caso es un artefacto válido (C01, C03 o C07) con un solo error insertado a mano. Se valida con las capas C1-C4 reales, sin modelo.",
  "",
  "| Tipo de error | Casos | Detectados | En la capa esperada | C1 | C2 | C3 | C4 |",
  "|---|---|---|---|---|---|---|---|",
  ...filas,
  `| Total | ${r.total.casos} | ${pct(r.total.detectados, r.total.casos)} | ${pct(r.total.enCapaEsperada, r.total.casos)} | | | | |`,
  "",
  distintos.length ? "Casos detectados en otra capa o no detectados:" : "Todos los casos se detectaron en la capa esperada.",
  "",
  ...distintos.map((x) => `- ${x.id}: esperada ${x.capaEsperada}, detectada ${x.capaDetecta ?? "ninguna"} (${x.reglas.join(", ") || "sin errores"})`),
  "",
].join("\n");

const destino = enRaiz("experimento", "banco-errores");
mkdirSync(destino, { recursive: true });
writeFileSync(join(destino, "resultados.json"), JSON.stringify(r, null, 2) + "\n");
writeFileSync(join(destino, "resultados.md"), md);
console.log(`\n${md}`);
