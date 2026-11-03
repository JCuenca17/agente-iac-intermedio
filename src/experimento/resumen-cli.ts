#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { FilaResultado } from "./ejecutor.js";
import { informeMarkdown, resumir } from "./resumen.js";

// Uso: npm run resumen -- <carpeta del experimento>
// Lee resultados.jsonl y escribe resumen.md y resumen.json en la misma carpeta.
const carpeta = process.argv[2];
if (!carpeta) {
  console.error("Uso: npm run resumen -- <carpeta del experimento (la que tiene resultados.jsonl)>");
  process.exit(2);
}
const archivo = join(resolve(carpeta), "resultados.jsonl");
if (!existsSync(archivo)) {
  console.error(`No existe ${archivo}`);
  process.exit(1);
}
const filas: FilaResultado[] = readFileSync(archivo, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));
const r = resumir(filas);
const md = informeMarkdown(r);
writeFileSync(join(resolve(carpeta), "resumen.md"), md);
writeFileSync(join(resolve(carpeta), "resumen.json"), JSON.stringify(r, null, 2));
console.log(md);
