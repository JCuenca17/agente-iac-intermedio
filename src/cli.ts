#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { ejecutarCiclo, type ResultadoCiclo } from "./ciclo/ciclo.js";
import { cargarArchivoEnv, cargarConfiguracion } from "./configuracion.js";
import { desplegar, destruir } from "./despliegue/despliegue.js";
import { generarMermaid } from "./diagrama/mermaid.js";
import { crearProveedor } from "./modelo/fabrica.js";
import { cargarEsquemaProveedor } from "./proveedor/esquema.js";
import { generarPaginaRevision } from "./revision/pagina.js";
import { enRaiz } from "./rutas.js";
import { Registro } from "./trazas/registro.js";

const AYUDA = `Uso: npm run agente -- "<requerimiento>" [opciones]

Genera el artefacto intermedio, lo valida por capas, muestra el diagrama para revisión
y, si se aprueba, lo despliega en el emulador.

Opciones:
  --archivo <ruta>       Lee el requerimiento de un archivo de texto
  --salida <carpeta>     Carpeta de la corrida (por defecto corridas/<fecha-hora>)
  --respuestas <ruta>    Respuestas grabadas (necesario con LLM_PROVEEDOR=grabado)
  --auto-aprobar         No pregunta: aprueba el diseño (para experimentos)
  --sin-desplegar        Se detiene después de la revisión
  --conservar            No destruye lo desplegado al terminar
  --sin-rag              Ablación A3: sin consulta al esquema del proveedor
  --sin-validador        Ablación A1: despliega sin validar
  --sin-retro            Ablación A2: un solo intento, sin retroalimentación
  -h, --ayuda            Muestra esta ayuda

La configuración (proveedor del modelo, emulador, límite de gasto) se lee de .env.`;

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      archivo: { type: "string" },
      salida: { type: "string" },
      respuestas: { type: "string" },
      "auto-aprobar": { type: "boolean", default: false },
      "sin-desplegar": { type: "boolean", default: false },
      conservar: { type: "boolean", default: false },
      "sin-rag": { type: "boolean", default: false },
      "sin-validador": { type: "boolean", default: false },
      "sin-retro": { type: "boolean", default: false },
      ayuda: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.ayuda) {
    console.log(AYUDA);
    return 0;
  }

  const requerimiento = values.archivo ? readFileSync(values.archivo, "utf8").trim() : positionals.join(" ").trim();
  if (!requerimiento) {
    console.error("Falta el requerimiento.\n\n" + AYUDA);
    return 2;
  }

  cargarArchivoEnv(enRaiz(".env"));
  const config = cargarConfiguracion();
  const versiones = JSON.parse(readFileSync(enRaiz("versiones.json"), "utf8"));
  const esquema = cargarEsquemaProveedor();
  const proveedor = crearProveedor(config, values.respuestas);
  const sello = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const salida = resolve(values.salida ?? join(enRaiz("corridas"), sello));
  const registro = new Registro(join(salida, "trazas.jsonl"));

  console.log(`Proveedor: ${proveedor.nombre} (${config.llmModelo}) · Emulador: ${config.emulador} en ${config.awsEndpoint}`);
  console.log(`Corrida: ${salida}\n`);
  registro.anotar("corrida-inicio", { requerimiento, proveedor: proveedor.nombre, modelo: config.llmModelo, emulador: config.emulador });

  const opcionesCiclo = {
    proveedor,
    esquema,
    endpoint: config.awsEndpoint,
    region: config.awsRegion,
    versionProveedor: versiones.proveedor_aws,
    registro,
    maxIteraciones: config.maxIteraciones,
    conValidador: !values["sin-validador"],
    conRetroalimentacion: !values["sin-retro"],
    conRag: !values["sin-rag"],
    limiteGastoUsd: config.limiteGastoUsd,
  };

  let texto = requerimiento;
  let ciclo: ResultadoCiclo;
  let ronda = 1;
  for (;;) {
    ciclo = await ejecutarCiclo(texto, { ...opcionesCiclo, dirTrabajo: join(salida, `ronda-${ronda}`) });
    console.log(`Ciclo: ${ciclo.motivo} en ${ciclo.iteraciones} iteración(es), ${ciclo.llamadas} llamada(s), US$ ${ciclo.costoUsd.toFixed(4)}`);
    if (!ciclo.listo || !ciclo.artefacto) break;

    const mermaid = generarMermaid(ciclo.artefacto);
    writeFileSync(join(salida, "artefacto.json"), JSON.stringify(ciclo.artefacto, null, 2));
    writeFileSync(join(salida, "diagrama.mmd"), mermaid);
    const pagina = join(salida, "revision.html");
    writeFileSync(
      pagina,
      generarPaginaRevision({
        requerimiento: texto,
        artefacto: ciclo.artefacto,
        mermaid,
        erroresPorIteracion: ciclo.erroresPorIteracion,
        resumenPlan: ciclo.resumenPlan,
        costoUsd: ciclo.costoUsd,
        llamadas: ciclo.llamadas,
      }),
    );

    if (values["auto-aprobar"]) {
      registro.anotar("revision", { aprobado: true, automatica: true });
      break;
    }
    console.log(`\nRevisa el diseño en: ${pagina}`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const respuesta = (await rl.question("¿Apruebas el diseño? (s/n): ")).trim().toLowerCase();
    if (respuesta.startsWith("s")) {
      rl.close();
      registro.anotar("revision", { aprobado: true, automatica: false });
      break;
    }
    const comentarios = (await rl.question("Comentarios para corregir el diseño (vacío para cancelar): ")).trim();
    rl.close();
    registro.anotar("revision", { aprobado: false, comentarios });
    if (!comentarios) {
      console.log("Diseño rechazado. No se despliega nada.");
      return 1;
    }
    texto = `${requerimiento}\n\nComentarios del revisor sobre la propuesta anterior:\n${comentarios}`;
    ronda++;
  }

  const resultado: Record<string, unknown> = {
    listo: ciclo.listo,
    motivo: ciclo.motivo,
    iteraciones: ciclo.iteraciones,
    llamadas: ciclo.llamadas,
    costoUsd: ciclo.costoUsd,
    uso: ciclo.uso,
    erroresPorIteracion: ciclo.erroresPorIteracion,
  };

  if (ciclo.listo && ciclo.dirFinal && !values["sin-desplegar"]) {
    console.log("\nDesplegando en el emulador...");
    const d = await registro.medir("despliegue", () => desplegar(ciclo.dirFinal!));
    registro.anotar("despliegue", { aplicado: d.aplicado, sinCambios: d.sinCambios, errores: d.errores, cambiosPendientes: d.cambiosPendientes, cosmeticosIgnorados: d.cosmeticosIgnorados });
    resultado.despliegue = { aplicado: d.aplicado, sinCambios: d.sinCambios, errores: d.errores, cambiosPendientes: d.cambiosPendientes };
    console.log(d.aplicado && d.sinCambios ? "Despliegue correcto: lo desplegado coincide con lo declarado." : `Despliegue con problemas: ${JSON.stringify(d.errores.length ? d.errores : d.cambiosPendientes)}`);
    if (!values.conservar) {
      const ok = await destruir(ciclo.dirFinal);
      registro.anotar("destruccion", { ok });
    }
  }

  writeFileSync(join(salida, "resultado.json"), JSON.stringify(resultado, null, 2));
  registro.anotar("corrida-fin", { listo: ciclo.listo });
  return ciclo.listo ? 0 : 1;
}

main().then(
  (codigo) => (process.exitCode = codigo),
  (e: unknown) => {
    console.error(`Error: ${(e as Error).message}`);
    process.exitCode = 1;
  },
);

