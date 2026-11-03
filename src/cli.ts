#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { ejecutarCiclo, type ResultadoCiclo } from "./ciclo/ciclo.js";
import { cargarArchivoEnv, cargarConfiguracion } from "./configuracion.js";
import { desplegar, destruir } from "./despliegue/despliegue.js";
import { generarMermaid } from "./diagrama/mermaid.js";
import { lineaConsumo, nombreSesionValido, registrarCorrida, SESION_POR_DEFECTO } from "./historial/historial.js";
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
  --sesion <nombre>      Proyecto al que pertenece la corrida, para el historial de consumo
                         (por defecto "general"); ver npm run historial
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
      sesion: { type: "string", default: SESION_POR_DEFECTO },
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

  const sesion = values.sesion!.trim();
  if (!nombreSesionValido(sesion)) {
    console.error(`--sesion debe ser un nombre simple (letras, números, guion o guion bajo, hasta 40); se recibió "${sesion}"`);
    return 2;
  }

  if (!values["auto-aprobar"] && !process.stdin.isTTY) {
    console.error("La revisión del diseño necesita una terminal interactiva. Sin ella, usa --auto-aprobar.");
    return 2;
  }

  cargarArchivoEnv(enRaiz(".env"));
  const config = cargarConfiguracion();
  const versiones = JSON.parse(readFileSync(enRaiz("versiones.json"), "utf8"));
  const esquema = cargarEsquemaProveedor();
  const proveedor = crearProveedor(config, values.respuestas);
  const inicioCorrida = new Date().toISOString();
  const sello = inicioCorrida.replace(/[:.]/g, "-").slice(0, 19);
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
  let rechazado = false;
  // El gasto y el uso se acumulan entre rondas de revisión, y el límite vale para todas.
  const total = { costoUsd: 0, llamadas: 0, uso: { entrada: 0, salida: 0, cacheEscritura: 0, cacheLectura: 0 } };
  for (;;) {
    const restante = config.limiteGastoUsd - total.costoUsd;
    ciclo = await ejecutarCiclo(texto, { ...opcionesCiclo, limiteGastoUsd: restante, dirTrabajo: join(salida, `ronda-${ronda}`) });
    total.costoUsd += ciclo.costoUsd;
    total.llamadas += ciclo.llamadas;
    for (const k of Object.keys(total.uso) as (keyof typeof total.uso)[]) total.uso[k] += ciclo.uso[k];
    console.log(`Ciclo: ${ciclo.motivo} en ${ciclo.iteraciones} iteración(es)`);
    console.log(`  ${lineaConsumo(ciclo.uso, ciclo.costoUsd, ciclo.llamadas)}`);
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
      rechazado = true;
      break;
    }
    if (total.costoUsd >= config.limiteGastoUsd) {
      console.log("Se alcanzó el límite de gasto (LIMITE_GASTO_USD); no se hace otra ronda.");
      rechazado = true;
      break;
    }
    // El modelo empieza una conversación nueva: se le pasa la propuesta anterior para que
    // los comentarios se puedan aplicar sobre ella.
    texto = `${requerimiento}\n\nPropuesta anterior (artefacto):\n${JSON.stringify(ciclo.artefacto)}\n\nComentarios del revisor sobre la propuesta anterior:\n${comentarios}`;
    ronda++;
  }

  const resultado: Record<string, unknown> = {
    listo: ciclo.listo,
    motivo: rechazado ? "rechazado" : ciclo.motivo,
    rondas: ronda,
    iteraciones: ciclo.iteraciones,
    llamadas: total.llamadas,
    costoUsd: total.costoUsd,
    uso: total.uso,
    erroresPorIteracion: ciclo.erroresPorIteracion,
  };

  let desplegadoBien = true;
  if (!rechazado && ciclo.listo && ciclo.dirFinal && !values["sin-desplegar"]) {
    console.log("\nDesplegando en el emulador...");
    try {
      const d = await registro.medir("despliegue", () => desplegar(ciclo.dirFinal!));
      registro.anotar("despliegue", { aplicado: d.aplicado, sinCambios: d.sinCambios, errores: d.errores, cambiosPendientes: d.cambiosPendientes, cosmeticosIgnorados: d.cosmeticosIgnorados });
      resultado.despliegue = { aplicado: d.aplicado, sinCambios: d.sinCambios, errores: d.errores, cambiosPendientes: d.cambiosPendientes };
      desplegadoBien = d.aplicado && d.sinCambios;
      console.log(desplegadoBien ? "Despliegue correcto: lo desplegado coincide con lo declarado." : `Despliegue con problemas: ${JSON.stringify(d.errores.length ? d.errores : d.cambiosPendientes)}`);
    } catch (e) {
      desplegadoBien = false;
      resultado.despliegue = { error: (e as Error).message };
      console.log(`Despliegue con error: ${(e as Error).message}`);
    } finally {
      // Aunque el despliegue falle a medias, lo que se haya creado se destruye.
      if (!values.conservar) {
        const ok = await destruir(ciclo.dirFinal);
        registro.anotar("destruccion", { ok });
      }
    }
  }

  writeFileSync(join(salida, "resultado.json"), JSON.stringify(resultado, null, 2));

  // Historial de consumo por sesión (npm run historial).
  const estado = rechazado
    ? "rechazado"
    : !ciclo.listo
      ? ciclo.motivo
      : values["sin-desplegar"]
        ? "sin-desplegar"
        : desplegadoBien
          ? "desplegado"
          : "desplegado-con-problemas";
  registrarCorrida(enRaiz("historial", "historial.jsonl"), {
    sesion,
    fecha: inicioCorrida,
    requerimiento,
    rondas: ronda,
    llamadas: total.llamadas,
    uso: total.uso,
    costoUsd: total.costoUsd,
    resultado: estado,
    carpeta: salida,
  });
  console.log(`\nConsumo de la corrida (sesión "${sesion}"): ${lineaConsumo(total.uso, total.costoUsd, total.llamadas)}`);
  console.log("Historial por sesión: npm run historial");
  const exito = !rechazado && ciclo.listo && desplegadoBien;
  registro.anotar("corrida-fin", { listo: ciclo.listo, rechazado, exito });
  return exito ? 0 : 1;
}

main().then(
  (codigo) => (process.exitCode = codigo),
  (e: unknown) => {
    console.error(`Error: ${(e as Error).message}`);
    process.exitCode = 1;
  },
);

