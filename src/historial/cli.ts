#!/usr/bin/env node
import { leerHistorial, resumirHistorial, textoHistorial } from "./historial.js";
import { enRaiz } from "../rutas.js";

// Uso: npm run historial            -> totales de tokens y costo por sesión
//      npm run historial -- <sesión> -> cada corrida de esa sesión
const sesion = process.argv[2];
if (sesion === "-h" || sesion === "--ayuda") {
  console.log("Uso: npm run historial [-- <sesión>]\n\nMuestra los tokens de entrada (con la parte en caché), de salida y el costo estimado\nde las corridas de npm run agente, por sesión. Con una sesión, lista cada corrida.");
  process.exit(0);
}
console.log(textoHistorial(resumirHistorial(leerHistorial(enRaiz("historial", "historial.jsonl")), sesion)));
