import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { enRaiz } from "./rutas.js";

const CACHE_PLUGINS = enRaiz(".cache", "plugins");

export interface SalidaTofu {
  codigo: number;
  salida: string;
  error: string;
}

/**
 * Variables que obligan a OpenTofu a hablar solo con el emulador. AWS_ENDPOINT_URL lo
 * respeta el proveedor AWS para todos los servicios, también los que no están en la lista
 * de endpoints de main.tf.json: sin esto, un servicio no listado iría a AWS real.
 * Las credenciales son de prueba y se anulan los perfiles locales.
 */
export function entornoEmulador(): NodeJS.ProcessEnv {
  const endpoint = process.env.AWS_ENDPOINT || "http://localhost:4566";
  return {
    AWS_ENDPOINT_URL: endpoint,
    AWS_ACCESS_KEY_ID: "test",
    AWS_SECRET_ACCESS_KEY: "test",
    AWS_SESSION_TOKEN: "",
    AWS_PROFILE: "",
    AWS_EC2_METADATA_DISABLED: "true",
  };
}

/**
 * Ejecuta OpenTofu en `dir` sin bloquear el proceso (un apply en el emulador puede tardar
 * minutos). Los proveedores se guardan una sola vez en .cache/plugins.
 */
export function ejecutarTofu(args: string[], dir: string): Promise<SalidaTofu> {
  mkdirSync(CACHE_PLUGINS, { recursive: true });
  return new Promise((resolver, rechazar) => {
    const p = spawn("tofu", args, {
      cwd: dir,
      env: { ...process.env, ...entornoEmulador(), TF_PLUGIN_CACHE_DIR: CACHE_PLUGINS, TF_IN_AUTOMATION: "1" },
    });
    const salida: Buffer[] = [];
    const error: Buffer[] = [];
    p.stdout.on("data", (d: Buffer) => salida.push(d));
    p.stderr.on("data", (d: Buffer) => error.push(d));
    p.on("error", (e) => rechazar(new Error(`No se pudo ejecutar tofu: ${e.message}. Revisa la instalación con npm run doctor`)));
    p.on("close", (codigo) =>
      resolver({ codigo: codigo ?? 1, salida: Buffer.concat(salida).toString("utf8"), error: Buffer.concat(error).toString("utf8") }),
    );
  });
}
