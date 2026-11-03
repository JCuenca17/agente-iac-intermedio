import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enRaiz } from "../rutas.js";
import { validarConOpenTofu } from "../validador/c4-opentofu.js";
import { TIEMPO_LIMITE_OPA_MS } from "../tofu.js";

/**
 * Evalúa la política de intención de una tarea de IaC-Eval sobre un plan, igual que su
 * evaluador (evaluation/eval.py): consulta `data` y la tarea falla si algún valor es false.
 * Las políticas sin `import rego.v1` usan la sintaxis antigua y se leen con --v0-compatible.
 */
export function evaluarRegoIaCEval(politica: string, plan: unknown): { correcto: boolean; error: string } {
  const dir = mkdtempSync(join(tmpdir(), "iaceval-"));
  try {
    const archivo = join(dir, "policy.rego");
    writeFileSync(archivo, politica);
    const args = ["eval", "--stdin-input", "--format", "json", "-d", archivo, "data"];
    if (!politica.includes("import rego.v1")) args.splice(1, 0, "--v0-compatible");
    const r = spawnSync("opa", args, { input: JSON.stringify(plan), encoding: "utf8", timeout: TIEMPO_LIMITE_OPA_MS, maxBuffer: 256 * 1024 * 1024 });
    if (r.error) throw new Error(`No se pudo ejecutar opa: ${r.error.message}`);
    if (r.status !== 0) return { correcto: false, error: (r.stderr || r.stdout).slice(0, 300) };
    const hojas: unknown[] = [];
    const recorrer = (x: unknown): void => {
      if (x && typeof x === "object") Object.values(x).forEach(recorrer);
      else hojas.push(x);
    };
    recorrer(JSON.parse(r.stdout).result?.[0]?.expressions?.[0]?.value);
    return { correcto: !hojas.includes(false), error: "" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Métricas de S12 sobre IaC-Eval: compilabilidad, desplegabilidad y corrección. */
export interface MedicionIaCEval {
  /** tofu validate sin errores. */
  compila: boolean;
  /** tofu plan sin errores. */
  desplegable: boolean;
  /** Plan correcto según la política Rego de la tarea. */
  correcto: boolean;
}

/** Política Rego de una tarea seleccionada (experimento/iaceval/IEnnn/policy.rego). */
export function politicaTarea(id: string): string {
  return readFileSync(enRaiz("experimento", "iaceval", id, "policy.rego"), "utf8");
}

/** Mide una tarea de IaC-Eval sobre el código de `dir`, con su protocolo: validate, plan y Rego. */
export async function medirIaCEval(dir: string, politica: string): Promise<MedicionIaCEval> {
  const c4 = await validarConOpenTofu(dir);
  const compila = !c4.errores.some((e) => e.regla === "tofu-validate" || e.regla === "tofu-init");
  if (!c4.valido) return { compila, desplegable: false, correcto: false };
  return { compila: true, desplegable: true, correcto: evaluarRegoIaCEval(politica, c4.plan).correcto };
}
