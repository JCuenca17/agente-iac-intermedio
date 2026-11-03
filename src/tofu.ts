import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { enRaiz } from "./rutas.js";

const CACHE_PLUGINS = enRaiz(".cache", "plugins");

/**
 * Tiempo límite de un comando de OpenTofu (TOFU_TIEMPO_LIMITE_S, por defecto 20 minutos).
 * Si el emulador se cuelga, el comando se corta y cuenta como fallido en lugar de detener
 * el experimento.
 */
export function tiempoLimiteTofuMs(): number {
  const s = Number(process.env.TOFU_TIEMPO_LIMITE_S);
  return (Number.isFinite(s) && s > 0 ? s : 1200) * 1000;
}

/** Tiempo límite de una evaluación de OPA (2 minutos). */
export const TIEMPO_LIMITE_OPA_MS = 120_000;

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
  const endpoint = process.env.AWS_ENDPOINT?.trim() || "http://localhost:4566";
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
 * Entorno completo para OpenTofu: el del proceso sin claves de API ni variables que
 * desvíen el proveedor AWS (endpoints por servicio, archivos de credenciales o de
 * configuración propios), más las variables del emulador.
 */
export function entornoTofu(): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = {};
  for (const [clave, valor] of Object.entries(process.env)) {
    if (/^(ANTHROPIC_|CLAUDE_CODE_OAUTH|AWS_)/.test(clave)) continue;
    base[clave] = valor;
  }
  return { ...base, ...entornoEmulador() };
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
      env: { ...entornoTofu(), TF_PLUGIN_CACHE_DIR: CACHE_PLUGINS, TF_IN_AUTOMATION: "1" },
    });
    const salida: Buffer[] = [];
    const error: Buffer[] = [];
    p.stdout.on("data", (d: Buffer) => salida.push(d));
    p.stderr.on("data", (d: Buffer) => error.push(d));
    const limite = tiempoLimiteTofuMs();
    let vencido = false;
    const reloj = setTimeout(() => {
      vencido = true;
      p.kill();
    }, limite);
    p.on("error", (e) => {
      clearTimeout(reloj);
      rechazar(new Error(`No se pudo ejecutar tofu: ${e.message}. Revisa la instalación con npm run doctor`));
    });
    p.on("close", (codigo) => {
      clearTimeout(reloj);
      const textoError = Buffer.concat(error).toString("utf8");
      resolver({
        codigo: vencido ? 124 : (codigo ?? 1),
        salida: Buffer.concat(salida).toString("utf8"),
        error: vencido ? `tofu ${args[0]} superó el tiempo límite de ${limite / 1000} s y se detuvo.\n${textoError}` : textoError,
      });
    });
  });
}
