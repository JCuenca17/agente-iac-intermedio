// Revisa que esta PC tenga todo lo necesario para ejecutar la herramienta.
// Uso: npm run doctor
// No llama a ningún servicio de pago: solo consulta versiones y el emulador local.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const versiones = JSON.parse(readFileSync(join(raiz, "versiones.json"), "utf8"));
const hayEnv = existsSync(join(raiz, ".env"));
if (hayEnv) process.loadEnvFile(join(raiz, ".env"));

let problemas = 0;
const ok = (m) => console.log(`  [ok]    ${m}`);
const aviso = (m) => console.log(`  [aviso] ${m}`);
const falla = (m) => {
  problemas++;
  console.log(`  [falta] ${m}`);
};

function version(comando, args, patron) {
  // En Windows los comandos instalados con winget o npm son alias que requieren la consola.
  // Los argumentos son fijos de este script, así que se pasan como una sola línea.
  const r =
    process.platform === "win32"
      ? spawnSync(`${comando} ${args.join(" ")}`, { encoding: "utf8", shell: true })
      : spawnSync(comando, args, { encoding: "utf8" });
  if (r.error || r.status !== 0) return null;
  const m = ((r.stdout || "") + (r.stderr || "")).match(patron);
  return m ? m[1] : "desconocida";
}

console.log("Herramientas");
const node = process.versions.node;
if (Number(node.split(".")[0]) >= 22) ok(`Node ${node}`);
else falla(`Node ${node}: se necesita 22 o superior`);

for (const [nombre, comando, args, patron] of [
  ["OpenTofu", "tofu", ["version"], /OpenTofu v(\d+\.\d+\.\d+)/],
  ["OPA", "opa", ["version"], /Version: (\d+\.\d+\.\d+)/],
]) {
  const esperado = versiones[nombre === "OpenTofu" ? "opentofu" : "opa"];
  const v = version(comando, args, patron);
  if (!v) falla(`${nombre} no está instalado o no está en el PATH (versión esperada ${esperado})`);
  else if (v !== esperado) aviso(`${nombre} ${v}; la versión fijada es ${esperado}`);
  else ok(`${nombre} ${v}`);
}

console.log("Esquema del proveedor");
const rutaEsquema = join(raiz, ".cache", "esquema-aws.json");
if (!existsSync(rutaEsquema)) falla("no existe .cache/esquema-aws.json. Genéralo con: npm run esquema-proveedor");
else {
  const { version: v } = JSON.parse(readFileSync(rutaEsquema, "utf8"));
  if (v === versiones.proveedor_aws) ok(`proveedor AWS ${v}`);
  else aviso(`el esquema es del proveedor ${v}; la versión fijada es ${versiones.proveedor_aws}. Vuelve a ejecutar npm run esquema-proveedor`);
}

console.log("Configuración");
if (hayEnv) ok(".env encontrado");
else aviso("no hay .env: se usan los valores por defecto (proveedor 'grabado', sin costo). Copia .env.example como .env para cambiarlos");

const proveedor = process.env.LLM_PROVEEDOR || "grabado";
if (proveedor === "grabado") ok("LLM_PROVEEDOR=grabado: no se llama a ningún modelo ni se gasta dinero");
else if (proveedor === "claude-code") {
  const v = version("claude", ["--version"], /(\d+\.\d+\.\d+)/);
  if (v) ok(`LLM_PROVEEDOR=claude-code con Claude Code ${v}. Verifica que el "uso extra" esté desactivado en claude.ai`);
  else falla("LLM_PROVEEDOR=claude-code pero el comando 'claude' no está instalado");
} else if (proveedor === "anthropic") {
  if (process.env.ANTHROPIC_API_KEY?.trim()) ok("LLM_PROVEEDOR=anthropic con ANTHROPIC_API_KEY definida (el consumo se cobra al dueño de esa clave)");
  else falla("LLM_PROVEEDOR=anthropic pero falta ANTHROPIC_API_KEY");
} else falla(`LLM_PROVEEDOR="${proveedor}" no es válido (grabado, claude-code o anthropic)`);

console.log("Emulador");
const endpoint = process.env.AWS_ENDPOINT || "http://localhost:4566";
try {
  const r = await fetch(endpoint, { signal: AbortSignal.timeout(3000) });
  ok(`responde en ${endpoint} (HTTP ${r.status})`);
} catch {
  falla(`no responde en ${endpoint}. Inicia MiniStack ('ministack') o Floci y vuelve a intentar`);
}

console.log(problemas === 0 ? "\nTodo listo." : `\n${problemas} problema(s) por resolver.`);
process.exit(problemas === 0 ? 0 : 1);
