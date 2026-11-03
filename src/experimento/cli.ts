#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { cargarArchivoEnv, cargarConfiguracion, type Configuracion as ConfigHerramienta } from "../configuracion.js";
import { crearProveedor } from "../modelo/fabrica.js";
import { ProveedorGrabado } from "../modelo/grabado.js";
import { cargarEsquemaProveedor } from "../proveedor/esquema.js";
import { enRaiz } from "../rutas.js";
import { CONFIGURACIONES, DEPENDENCIAS_REALES, ejecutarExperimento, type Configuracion } from "./ejecutor.js";

const AYUDA = `Uso: npm run experimento -- [opciones]

Ejecuta el experimento: casos × configuraciones × repeticiones. Cada corrida genera,
despliega en el emulador, mide M1-M6 y destruye. Se puede interrumpir y reanudar con la
misma --salida: las corridas hechas no se repiten.

Opciones:
  --casos C01,C02        Casos (por defecto, C01-C12). "grandes" agrega P1 y P2; "iaceval", todas las tareas
                         seleccionadas de IaC-Eval; también se pueden listar (IE264,...)
  --config T,B0,B1       Configuraciones: ${CONFIGURACIONES.join(", ")} (por defecto, todas)
  --repeticiones 3       Repeticiones de cada combinación (por defecto 3)
  --salida <carpeta>     Carpeta de resultados (por defecto resultados/<fecha-hora>)
  --respuestas <carpeta> Con LLM_PROVEEDOR=grabado: archivos <caso>-<config>.json
  -h, --ayuda            Muestra esta ayuda

El proveedor del modelo y los límites de gasto se leen de .env
(LIMITE_GASTO_USD por corrida y LIMITE_GASTO_EXPERIMENTO_USD en total).`;

async function esperarEmulador(endpoint: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(endpoint, { signal: AbortSignal.timeout(2000) });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`El emulador no responde en ${endpoint}`);
}

/** Deja el emulador sin recursos: MiniStack tiene un endpoint de reinicio; Floci se reinicia (guarda el estado en memoria). */
function crearReinicio(config: ConfigHerramienta): () => Promise<void> {
  return async () => {
    if (config.emulador === "ministack") {
      const r = await fetch(`${config.awsEndpoint}/_ministack/reset`, { method: "POST" });
      if (!r.ok) throw new Error(`MiniStack no se reinició (HTTP ${r.status})`);
      return;
    }
    const r = spawnSync("docker", ["restart", config.flociContenedor], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`docker restart ${config.flociContenedor} falló: ${(r.stderr || r.error?.message || "").trim()}`);
    await esperarEmulador(config.awsEndpoint);
  };
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      casos: { type: "string" },
      config: { type: "string" },
      repeticiones: { type: "string", default: "3" },
      salida: { type: "string" },
      respuestas: { type: "string" },
      ayuda: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.ayuda) {
    console.log(AYUDA);
    return 0;
  }

  cargarArchivoEnv(enRaiz(".env"));
  const config = cargarConfiguracion();
  const versiones = JSON.parse(readFileSync(enRaiz("versiones.json"), "utf8"));
  const propios = readdirSync(enRaiz("experimento", "casos")).filter((c) => /^[CP]\d+$/.test(c)).sort();
  const todos = propios.filter((c) => c.startsWith("C"));
  const grandes = propios.filter((c) => c.startsWith("P"));
  const dirIaCEval = enRaiz("experimento", "iaceval");
  const tareasIaCEval = existsSync(dirIaCEval) ? readdirSync(dirIaCEval).filter((c) => /^IE\d+$/.test(c)).sort() : [];
  const lista = values.casos
    ? values.casos.split(",").map((c) => c.trim()).flatMap((c) => (c.toLowerCase() === "iaceval" ? tareasIaCEval : c.toLowerCase() === "grandes" ? grandes : [c.toUpperCase()]))
    : todos;
  // Sin duplicados: la misma combinación dos veces escribiría en la misma carpeta.
  const casos = [...new Set(lista)];
  const configuraciones = [
    ...new Set(values.config ? values.config.split(",").map((c) => c.trim().toUpperCase()) : [...CONFIGURACIONES]),
  ] as Configuracion[];
  for (const c of configuraciones) if (!(CONFIGURACIONES as readonly string[]).includes(c)) throw new Error(`Configuración desconocida: ${c}`);
  for (const c of casos) if (!propios.includes(c) && !tareasIaCEval.includes(c)) throw new Error(`Caso desconocido: ${c}`);
  const repeticiones = Number(values.repeticiones);
  if (!Number.isInteger(repeticiones) || repeticiones < 1) throw new Error(`--repeticiones debe ser un entero mayor o igual que 1 (se recibió "${values.repeticiones}")`);
  const sello = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const salida = resolve(values.salida ?? join(enRaiz("resultados"), sello));

  const crearProveedorCorrida = (caso: string, configuracion: Configuracion) => {
    if (config.llmProveedor !== "grabado") return crearProveedor(config);
    const archivo = join(values.respuestas ?? "", `${caso}-${configuracion}.json`);
    if (!values.respuestas || !existsSync(archivo)) throw new Error(`Con LLM_PROVEEDOR=grabado falta ${archivo}`);
    return ProveedorGrabado.desdeArchivo(archivo);
  };

  const total = casos.length * configuraciones.length * repeticiones;
  console.log(`Experimento: ${casos.length} casos × ${configuraciones.length} configuraciones × ${repeticiones} repeticiones = ${total} corridas`);
  console.log(`Modelo: ${config.llmProveedor} (${config.llmModelo}) · Emulador: ${config.emulador} · Límite total: US$ ${config.limiteGastoExperimentoUsd}`);
  console.log(`Resultados: ${salida}\n`);
  await esperarEmulador(config.awsEndpoint);

  const r = await ejecutarExperimento({
    casos,
    configuraciones,
    repeticiones,
    salida,
    crearProveedor: crearProveedorCorrida,
    esquema: cargarEsquemaProveedor(),
    endpoint: config.awsEndpoint,
    region: config.awsRegion,
    versionProveedor: versiones.proveedor_aws,
    maxIteraciones: config.maxIteraciones,
    limiteGastoCorridaUsd: config.limiteGastoUsd,
    limiteGastoTotalUsd: config.limiteGastoExperimentoUsd,
    dependencias: { ...DEPENDENCIAS_REALES, reiniciarEmulador: crearReinicio(config) },
    alAvanzar: (f, hechas, tot) =>
      console.log(
        `[${hechas}/${tot}] ${f.caso} ${f.configuracion} rep ${f.repeticion}: ${f.m1 ? "M1 sí" : "M1 no"} · M4 ${(f.m4 * 100).toFixed(0)} % · M3 ${f.m3} · ${f.iteraciones} it · US$ ${f.costoUsd.toFixed(4)}${f.error ? ` · error: ${f.error}` : ""}`,
      ),
  });

  console.log(`\nCorridas nuevas: ${r.hechas} · ya hechas: ${r.omitidas} · gasto acumulado: US$ ${r.costoTotalUsd.toFixed(4)}`);
  if (r.detenidoPorGasto) console.log("Se detuvo por el límite de gasto total (LIMITE_GASTO_EXPERIMENTO_USD).");
  return 0;
}

main().then(
  (codigo) => (process.exitCode = codigo),
  (e: unknown) => {
    console.error(`Error: ${(e as Error).message}`);
    process.exitCode = 1;
  },
);
