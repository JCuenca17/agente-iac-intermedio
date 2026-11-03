// Genera un índice compacto del esquema del proveedor AWS de OpenTofu.
// Uso: npm run esquema-proveedor
//
// Ejecuta `tofu providers schema -json` con la versión fijada en
// prueba-minima/.terraform.lock.hcl y guarda solo lo que usan el RAG y la capa C2:
// tipos de recurso, atributos, bloques anidados y marcas de deprecado.
// El resultado (.cache/esquema-aws.json) no se sube al repo; cada PC lo genera.

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trabajo = join(raiz, ".cache", "esquema-trabajo");
const salida = join(raiz, ".cache", "esquema-aws.json");

rmSync(trabajo, { recursive: true, force: true });
mkdirSync(trabajo, { recursive: true });
cpSync(join(raiz, "prueba-minima", "proveedor.tf"), join(trabajo, "proveedor.tf"));
cpSync(join(raiz, "prueba-minima", ".terraform.lock.hcl"), join(trabajo, ".terraform.lock.hcl"));

function tofu(args) {
  const r = spawnSync("tofu", args, { cwd: trabajo, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  if (r.error) throw new Error(`No se pudo ejecutar tofu: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`tofu ${args[0]} falló:\n${r.stderr}`);
  return r.stdout;
}

console.log("Descargando el proveedor fijado (solo la primera vez)...");
tofu(["init", "-input=false", "-no-color"]);
console.log("Exportando el esquema...");
const completo = JSON.parse(tofu(["providers", "schema", "-json"]));
const entrada = Object.entries(completo.provider_schemas ?? {}).find(([nombre]) => nombre.endsWith("/aws"));
if (!entrada) throw new Error("El esquema exportado no incluye el proveedor AWS");
const [fuente, proveedor] = entrada;

function compactarBloque(bloque) {
  const atributos = {};
  for (const [nombre, a] of Object.entries(bloque.attributes ?? {})) {
    atributos[nombre] = {
      tipo: a.type ?? (a.nested_type ? "anidado" : "desconocido"),
      ...(a.required && { requerido: true }),
      ...(a.optional && { opcional: true }),
      ...(a.computed && { calculado: true }),
      ...(a.deprecated && { deprecado: true }),
    };
  }
  const bloques = {};
  for (const [nombre, b] of Object.entries(bloque.block_types ?? {})) {
    bloques[nombre] = {
      anidamiento: b.nesting_mode,
      ...(b.min_items && { min: b.min_items }),
      ...(b.max_items && { max: b.max_items }),
      ...compactarBloque(b.block),
    };
  }
  return { ...(bloque.deprecated && { deprecado: true }), atributos, bloques };
}

const recursos = {};
for (const [tipo, s] of Object.entries(proveedor.resource_schemas)) recursos[tipo] = compactarBloque(s.block);

const versionProveedor = JSON.parse(tofu(["version", "-json"])).provider_selections?.[fuente] ?? "desconocida";

mkdirSync(dirname(salida), { recursive: true });
writeFileSync(salida, JSON.stringify({ fuente, version: versionProveedor, recursos }));
rmSync(trabajo, { recursive: true, force: true });
console.log(`Listo: ${Object.keys(recursos).length} tipos de recurso del proveedor ${versionProveedor} en .cache/esquema-aws.json`);
