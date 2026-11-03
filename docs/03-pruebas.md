# Plan y reporte de pruebas

Este documento cubre la verificación de la herramienta: que cada requisito de `01-requisitos.md` esté implementado y probado. La evaluación experimental (qué tan bien funciona el enfoque frente a las alternativas) está en `04-diseno-experimental.md`.

## 1. Estrategia por niveles

| Nivel | Qué verifica | Herramienta | Comando | Necesita |
|---|---|---|---|---|
| Unitario | Cada módulo por separado: validadores, traductor, diagrama, agente, proveedores del modelo, ciclo (con validador falso), métricas, estadística | Vitest | `npm test` | Node; OPA para C3 y las métricas |
| Políticas | Cada regla de seguridad de C3, con un caso que la viola y otro que la cumple | `opa test` | `npm test` | OPA |
| Integración | Módulos reales juntos contra el emulador: C4, ciclo completo, despliegue, generación directa B1, métricas sobre un estado real | Vitest con configuración aparte | `npm run test:integracion` | OpenTofu, OPA y un emulador |
| Prueba mínima | Que cada tipo de recurso de los casos del experimento funcione en el emulador: soluciones de referencia con apply, plan posterior sin cambios y destroy | Script propio | `npm run prueba-minima` | OpenTofu y un emulador |
| Instalación | Que la herramienta se instale desde cero en Linux con las versiones fijadas | Imagen de Codespaces en Docker | `.devcontainer/instalar.sh` | Docker |
| Demostración | Corridas de punta a punta con respuestas grabadas y piloto con el modelo real | `npm run agente`, `npm run experimento` | ver `00-metodologia.md` | Emulador; para el piloto, Claude Code |

Las pruebas unitarias y de políticas no usan el emulador ni ningún modelo: se pueden correr en cualquier equipo sin costo. Las respuestas del modelo se simulan con el proveedor `grabado` o con clientes falsos, y la salida real de OpenTofu se usa como dato de prueba.

## 2. Prácticas

- En los módulos de validación, traducción, diagrama, ciclo, métricas y estadística, la prueba se escribió antes del código y se comprobó que fallaba.
- Los valores de referencia estadísticos se calcularon por un camino independiente: la fórmula de Wilson, la binomial exacta y la enumeración de las 2^n asignaciones de signo para Wilcoxon con empates.
- Las listas de verificación de M4 se validan en las dos direcciones: cada solución de referencia cumple el 100 % y una versión dañada a propósito falla exactamente en el requisito afectado.
- Antes de cada commit se ejecutan `npm test` y la verificación de tipos (`tsc --noEmit`); las pruebas de integración se ejecutan al tocar C4, el ciclo, el despliegue o las métricas.

## 3. Entorno

OpenTofu 1.13.1, OPA 1.22.0, proveedor AWS 6.71.0, Node 24 en Windows 11 y Node 22 en la imagen de Codespaces. Emuladores: Floci 2.4.0 en Docker (puerto 4566) y MiniStack 1.5.36 (puerto 4566 o 4567).

## 4. Criterios de aceptación

- Todas las pruebas unitarias, de políticas y de integración pasan.
- La prueba mínima pasa en los 12 casos en al menos un emulador.
- La instalación desde cero en la imagen de Codespaces termina sin errores y pasan las pruebas unitarias y de políticas.

## 5. Reporte (2026-11-03)

| Nivel | Resultado |
|---|---|
| Unitario | 162 de 162 pruebas, en 21 archivos |
| Políticas Rego | 17 de 17 |
| Integración | 6 de 6 en Floci y 6 de 6 en MiniStack |
| Prueba mínima | 12 de 12 casos en Floci y 12 de 12 en MiniStack |
| Proyecto grande P1 | Despliega 47 recursos en MiniStack, sin cambios pendientes; su lista M4 se cumple al 100 % sobre el estado real |
| Proyecto grande P2 | Pendiente en Floci; en MiniStack falla por limitaciones del emulador (sección 6) |
| Instalación | Correcta en la imagen de Codespaces: OpenTofu y OPA con sumas SHA-256 verificadas; pasan las 162 pruebas unitarias y las 17 de políticas |
| Demostración | Corrida de punta a punta con respuestas grabadas: 2 iteraciones, despliegue verificado y destrucción. Piloto con Claude Haiku 5.5: 3 de 3 casos (C01, C07, C10) desplegados en la primera iteración, M4 100 %, sin violaciones |

Detalle por archivo de pruebas unitarias:

| Archivo | Pruebas | Módulo |
|---|---|---|
| `agente.test.ts` | 13 | Agente y prompt |
| `ciclo.test.ts` | 7 | Ciclo |
| `configuracion.test.ts` | 7 | Configuración |
| `consulta-esquema.test.ts` | 6 | Consulta al esquema (RAG) |
| `despliegue.test.ts` | 6 | Clasificación de cambios del plan posterior |
| `directa.test.ts` | 3 | Generación directa (B0, B1) |
| `ejecutor.test.ts` | 8 | Ejecutor del experimento |
| `estadistica.test.ts` | 6 | Wilson, McNemar, Wilcoxon |
| `iaceval.test.ts` | 4 | Evaluación de IaC-Eval |
| `intencion.test.ts` | 23 | Listas de verificación (M4) |
| `mermaid.test.ts` | 7 | Diagrama |
| `modelo.test.ts` | 9 | Proveedores del modelo y costo |
| `pagina-revision.test.ts` | 5 | Página de revisión |
| `politicas-desplegado.test.ts` | 7 | Políticas sobre lo desplegado (M3) |
| `registro.test.ts` | 2 | Trazas |
| `resumen.test.ts` | 6 | Resumen de resultados |
| `traductor.test.ts` | 11 | Traductor |
| `validador-c1.test.ts` | 8 | C1 |
| `validador-c2.test.ts` | 14 | C2 |
| `validador-c3.test.ts` | 3 | C3 |
| `validador-c4.test.ts` | 7 | C4 |

## 6. Defectos encontrados por las pruebas

| Hallazgo | Cómo se detectó | Corrección |
|---|---|---|
| Una consulta de etiquetas de S3 Control y luego las llamadas de Chime y Redshift salieron a AWS real (rechazadas con 403, sin costo) | Prueba mínima y preparación de IaC-Eval | `s3control` en los endpoints y `AWS_ENDPOINT_URL` forzado en toda ejecución de OpenTofu (ADR-018) |
| `referenced_security_group_id` volvía con la cuenta delante y dejaba el plan con cambios | Prueba mínima de C11 | Se identificó la causa (`skip_requesting_account_id`) y se trata como diferencia cosmética al medir (ADR-019) |
| MiniStack no guarda las etiquetas de una regla de salida ni devuelve los grupos de destino de un autoescalado, no soporta `AttachLoadBalancerTargetGroups` y no crea la alarma de CloudWatch de P2 | Prueba mínima de C11 y de P2 | Floci como emulador principal (ADR-002); la referencia de C11 usa reglas dentro del grupo |
| Las rutas a archivos de datos fallaban al ejecutar el código compilado en `dist/` | Ejecución desde `dist/` | Módulo único que encuentra la raíz del proyecto |
| OpenTofu síncrono bloqueaba el proceso durante un apply de casi 3 minutos | Prueba de integración del despliegue | Ejecución asíncrona de OpenTofu |
| M4 sobre el plan perdía un requisito que C07 sí cumplía (política IAM con referencias, desconocida hasta aplicar) | Comparación del plan y del estado de C07 | M4 sobre lo desplegado (ADR-019) |
| La lista de C01 penalizaba el versionado escrito en la forma deprecada, que igual funciona | Ensayo del experimento con B0 | La lista acepta ambas formas; la forma deprecada se cuenta en M2 |
| Los errores de C4 en archivos `.tf` traían el contexto con sintaxis HCL y no la dirección del recurso | Prueba de integración de B1 | Normalización del contexto |
| Una regla Rego con negación de una comparación (`not x > 0`) no se cumplía cuando el atributo faltaba | Pruebas de políticas | Función auxiliar para la negación |
| Algunas referencias de IaC-Eval no cumplen su propia política (por ejemplo, la tarea 100 pide el rol `demo_eks` y la referencia lo llama `example`) | Preparación de IaC-Eval | Esas tareas se descartan y se reportan |
| `scripts/prueba-minima.mjs` tenía saltos de línea CRLF | Revisión del índice de git | `.gitattributes` con LF en todo el repositorio |

## 7. Matriz de trazabilidad

Requisito → módulo que lo implementa → pruebas que lo verifican. "Integración" se refiere a `test/integracion/`.

| Requisito | Módulo | Pruebas |
|---|---|---|
| RF-01 | `src/cli.ts` | Corrida de punta a punta |
| RF-02 | `src/agente`, `esquema/artefacto.schema.json` | `agente.test.ts`; piloto |
| RF-03 | `src/proveedor/consulta.ts`, `src/agente/agente.ts` | `consulta-esquema.test.ts`, `agente.test.ts` |
| RF-04 | `src/validador/c1-estructura.ts` | `validador-c1.test.ts` |
| RF-05 | `src/validador/c2-semantica.ts`, `src/proveedor/esquema.ts` | `validador-c2.test.ts`; integración `ciclo.test.ts` |
| RF-06 | `src/validador/c3-politicas.ts`, `politicas/artefacto` | `validador-c3.test.ts`; `opa test` (17) |
| RF-07 | `src/traductor/opentofu.ts` | `traductor.test.ts`; integración `c4.test.ts` |
| RF-08 | `src/validador/c4-opentofu.ts`, `src/tofu.ts` | `validador-c4.test.ts`; integración `c4.test.ts` |
| RF-09 | `src/ciclo/ciclo.ts`, `src/agente/prompt.ts` | `ciclo.test.ts`; integración `ciclo.test.ts` |
| RF-10 | `src/diagrama/mermaid.ts` | `mermaid.test.ts`; renderizado con mermaid-cli |
| RF-11 | `src/revision/pagina.ts`, `src/cli.ts` | `pagina-revision.test.ts`; corrida de punta a punta |
| RF-12 | `src/despliegue/despliegue.ts` | `despliegue.test.ts`; integración `despliegue.test.ts` |
| RF-13 | `src/trazas/registro.ts` | `registro.test.ts`; `ciclo.test.ts` |
| RF-14 | `src/modelo` | `modelo.test.ts`; piloto |
| RF-15 | `src/ciclo/ciclo.ts`, `src/linea-base/directa.ts` | `ciclo.test.ts`, `directa.test.ts`, `ejecutor.test.ts`; integración `directa.test.ts` |
| RF-16 | `src/experimento/ejecutor.ts`, `intencion.ts`, `politicas-desplegado.ts` | `ejecutor.test.ts`, `intencion.test.ts`, `politicas-desplegado.test.ts`; integración `metricas.test.ts`; ensayo y piloto |
| RF-17 | `src/experimento/estadistica.ts`, `resumen.ts` | `estadistica.test.ts`, `resumen.test.ts` |
| RF-18 | `src/experimento/iaceval.ts`, `scripts/iaceval-preparar.mjs` | `iaceval.test.ts`, `ejecutor.test.ts`, `resumen.test.ts` |
| RF-19 | `scripts/prueba-minima.mjs`, `prueba-minima/casos` | Prueba mínima en Floci y MiniStack |
| RNF-01 | `src/configuracion.ts`, `src/ciclo/ciclo.ts`, `src/experimento/ejecutor.ts` | `configuracion.test.ts`, `ciclo.test.ts`, `ejecutor.test.ts` |
| RNF-02 | `src/tofu.ts`, `src/traductor/opentofu.ts`, `src/modelo/claude-code.ts` | `modelo.test.ts` (sin claves en el entorno); prueba con Redshift en el emulador |
| RNF-03 | `.env.example`, `scripts/doctor.mjs`, `.devcontainer/` | Instalación en Windows y en la imagen de Codespaces |
| RNF-04 | `versiones.json`, `.terraform.lock.hcl`, traductor y diagrama | `traductor.test.ts` y `mermaid.test.ts` (determinismo) |
| RNF-05 | `src/validador` | `validador-c1` a `validador-c4` |
| RNF-06 | `src/ciclo/ciclo.ts`, `src/modelo/anthropic.ts` | `ciclo.test.ts`, `modelo.test.ts` |
| RNF-07 | `src/linea-base/directa.ts`, `src/experimento` | `directa.test.ts`, `intencion.test.ts`, `politicas-desplegado.test.ts` |
| RNF-08 | Todo el código | `npm test`, `npm run test:integracion` |
| RNF-09 | `experimento/iaceval/ATRIBUCION.md` | Revisión del archivo |
| RNF-10 | `src/cli.ts`, `src/revision/pagina.ts` | `pagina-revision.test.ts`; captura de la página |
