import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { estimarCosto } from "./precios.js";
import type { MensajeModelo, ProveedorModelo, RespuestaModelo } from "./tipos.js";

export type EjecutarClaude = (
  args: string[],
  entrada: string,
  env: NodeJS.ProcessEnv,
) => { codigo: number; salida: string; error: string };

/**
 * Ubica el ejecutable de Claude Code. En Windows, la instalación con npm deja un atajo
 * claude.cmd que solo funciona a través de la consola; se usa directamente el claude.exe
 * al que apunta, para pasar los argumentos sin que la consola los altere.
 * CLAUDE_BIN permite indicar otra ruta.
 */
export function resolverClaude(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  if (process.platform !== "win32") return "claude";
  for (const nombre of ["claude.exe", "claude.cmd"]) {
    const r = spawnSync("where", [nombre], { encoding: "utf8" });
    const ruta = r.status === 0 ? r.stdout.split(/\r?\n/)[0]?.trim() : "";
    if (!ruta) continue;
    if (ruta.toLowerCase().endsWith(".exe")) return ruta;
    const exe = join(dirname(ruta), "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
    if (existsSync(exe)) return exe;
  }
  return "claude";
}

const ejecutarReal: EjecutarClaude = (args, entrada, env) => {
  // Desde una carpeta temporal vacía, para que Claude Code no cargue los CLAUDE.md del
  // proyecto ni su memoria: el contexto debe ser solo el prompt de la herramienta.
  const cwd = mkdtempSync(join(tmpdir(), "agente-iac-claude-"));
  try {
    const r = spawnSync(resolverClaude(), args, { cwd, input: entrada, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 600_000 });
    if (r.error) throw new Error(`No se pudo ejecutar claude: ${r.error.message}. Indica la ruta con CLAUDE_BIN`);
    return { codigo: r.status ?? 1, salida: r.stdout ?? "", error: r.stderr ?? "" };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
};

/** Junta los turnos en un solo texto, porque `claude -p` recibe un único mensaje. */
function transcribir(mensajes: MensajeModelo[]): string {
  if (mensajes.length === 1) return mensajes[0].texto;
  return mensajes
    .map((m) => `<turno rol="${m.rol}">\n${m.texto}\n</turno>`)
    .join("\n\n")
    .concat('\n\nResponde al último turno del usuario, como el asistente.');
}

/**
 * Usa Claude Code en modo no interactivo (`claude -p`) con la sesión iniciada del plan.
 * Solo para pruebas puntuales: no cuesta dinero extra si el "uso extra" está desactivado.
 * Quita las claves de API del entorno para que nunca se cobre a una clave.
 */
export class ProveedorClaudeCode implements ProveedorModelo {
  readonly nombre = "claude-code";

  constructor(
    private readonly modelo: string,
    private readonly ejecutar: EjecutarClaude = ejecutarReal,
  ) {}

  async completar(sistema: string, mensajes: MensajeModelo[]): Promise<RespuestaModelo> {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;

    const args = [
      "-p",
      "--model", this.modelo,
      "--output-format", "json",
      "--tools", "",
      "--no-session-persistence",
      // Sin servidores MCP (conectores de claude.ai) ni skills: el contexto debe ser solo el
      // prompt de la herramienta, como con la API, para medir los mismos tokens.
      "--strict-mcp-config",
      "--disable-slash-commands",
      "--system-prompt", sistema,
    ];
    const inicio = Date.now();
    const r = this.ejecutar(args, transcribir(mensajes), env);

    let datos: Record<string, unknown>;
    try {
      datos = JSON.parse(r.salida);
    } catch {
      throw new Error(`Claude Code no devolvió JSON (código ${r.codigo}): ${(r.error || r.salida).slice(0, 300)}`);
    }
    if (datos.is_error || r.codigo !== 0) {
      throw new Error(`Claude Code informó un error: ${String(datos.result ?? r.error).slice(0, 300)}`);
    }

    const u = (datos.usage ?? {}) as Record<string, number>;
    const uso = {
      entrada: u.input_tokens ?? 0,
      salida: u.output_tokens ?? 0,
      cacheEscritura: u.cache_creation_input_tokens ?? 0,
      cacheLectura: u.cache_read_input_tokens ?? 0,
    };
    return {
      texto: String(datos.result ?? ""),
      uso,
      costoUsd: estimarCosto(this.modelo, uso),
      duracionMs: Number(datos.duration_ms ?? Date.now() - inicio),
      modelo: this.modelo,
      motivoParada: String(datos.stop_reason ?? "desconocido"),
    };
  }
}
