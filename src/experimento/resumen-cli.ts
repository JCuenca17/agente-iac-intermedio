#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { leerResultados, type FilaResultado } from "./ejecutor.js";
import { paginaResultados } from "./pagina-resultados.js";
import { informeMarkdown, resumir } from "./resumen.js";

// Uso: npm run resumen -- <carpeta del experimento>
// Lee resultados.jsonl y escribe resumen.md, resumen.json y resumen.html (gráficos) en la misma carpeta.
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
// Mismo lector que el ejecutor: tolera una última línea cortada.
const filas: FilaResultado[] = leerResultados(archivo).filas;
const r = resumir(filas);
const md = informeMarkdown(r);
writeFileSync(join(resolve(carpeta), "resumen.md"), md);
writeFileSync(join(resolve(carpeta), "resumen.json"), JSON.stringify(r, null, 2));
writeFileSync(join(resolve(carpeta), "resumen.html"), paginaResultados(r));
console.log(md);
console.log(`Página con gráficos: ${join(resolve(carpeta), "resumen.html")}`);
