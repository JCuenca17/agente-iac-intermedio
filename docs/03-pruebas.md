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
- Las listas de verificación de M4 se validan en las dos direcciones sobre el estado real de cada solución de referencia desplegada en Floci: la referencia cumple el 100 % y una versión dañada a propósito falla exactamente en el requisito afectado.
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
| Unitario | 231 de 231 pruebas, en 24 archivos |
| Políticas Rego | 30 de 30 |
| Integración | 7 de 7 en Floci (incluye el banco de errores con el validador real) |
| Prueba mínima | 12 de 12 casos en Floci y 12 de 12 en MiniStack |
| Proyecto grande P1 | Despliega 47 recursos en MiniStack, sin cambios pendientes; su lista M4 se cumple al 100 % sobre el estado real |
| Proyecto grande P2 | Pendiente en Floci; en MiniStack falla por limitaciones del emulador (sección 6) |
| Instalación | Correcta en la imagen de Codespaces: OpenTofu y OPA con sumas SHA-256 verificadas; pasan las 162 pruebas unitarias y las 17 de políticas |
| Banco de errores | 42 de 43 errores insertados detectados antes del despliegue, todos en la capa esperada; ver `04-diseno-experimental.md`, sección 8 |
| Revisión de código | Revisión con `bmad-code-review` de `src/`: 23 problemas, todos corregidos o descartados con evidencia (sección 7) |
| Demostración | Corrida de punta a punta con respuestas grabadas: 2 iteraciones, despliegue verificado y destrucción. Piloto con Claude Haiku 5.5: 3 de 3 casos (C01, C07, C10) desplegados en la primera iteración, M4 100 %, sin violaciones |

Detalle por archivo de pruebas unitarias:

| Archivo | Pruebas | Módulo |
|---|---|---|
| `agente.test.ts` | 13 | Agente y prompt |
| `banco-errores.test.ts` | 5 | Banco de errores insertados |
| `ciclo.test.ts` | 13 | Ciclo, retroalimentación y límite de gasto |
| `configuracion.test.ts` | 7 | Configuración |
| `consulta-esquema.test.ts` | 6 | Consulta al esquema (RAG) |
| `despliegue.test.ts` | 6 | Clasificación de cambios del plan posterior |
| `directa.test.ts` | 8 | Generación directa (B0, B1) |
| `ejecutor.test.ts` | 12 | Ejecutor del experimento |
| `estadistica.test.ts` | 8 | Wilson, McNemar, Wilcoxon y Holm |
| `iaceval.test.ts` | 5 | Evaluación de IaC-Eval |
| `intencion.test.ts` | 32 | Listas de verificación (M4), sobre estados reales |
| `mermaid.test.ts` | 9 | Diagrama |
| `modelo.test.ts` | 9 | Proveedores del modelo y costo |
| `pagina-revision.test.ts` | 7 | Página de revisión |
| `politicas-desplegado.test.ts` | 22 | Políticas sobre lo desplegado (M3), sobre estados reales |
| `registro.test.ts` | 2 | Trazas |
| `resumen.test.ts` | 9 | Resumen de resultados |
| `seguridad-codigo.test.ts` | 11 | Construcciones no permitidas antes de OpenTofu |
| `tofu.test.ts` | 2 | Entorno y tiempo límite de OpenTofu |
| `traductor.test.ts` | 12 | Traductor |
| `validador-c1.test.ts` | 8 | C1 |
| `validador-c2.test.ts` | 15 | C2 |
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

## 7. Revisión de código

Antes de entregar la herramienta para el experimento se revisó `src/` con la skill `bmad-code-review`: cuatro revisores independientes (búsqueda a ciegas, casos límite, pruebas faltantes y alineación con los requisitos), ejecutados como subagentes de Claude Code con el plan del autor, sin costo de API. Hicieron 57 observaciones: 9 se descartaron tras verificarlas en el código y las demás se agruparon en 23 problemas. Estos fueron los que afectaban la medición o la seguridad:

| Problema | Consecuencia | Corrección |
|---|---|---|
| El código del modelo en B0 y B1, o un `provisioner` dentro de un artefacto en A1, llegaba a OpenTofu sin revisión | Un `local-exec` podía ejecutar comandos en la PC de quien corre el experimento | Se rechazan provisioners, datos `external` y `http`, otros proveedores y los bloques `provider`, `terraform` y `module`; OpenTofu recibe el entorno sin claves de API |
| El escape de `${` en el traductor no hacía nada | En A1 un texto literal se interpretaba como interpolación | Escape corregido; C2 acepta variables de política IAM como `${aws:username}` |
| Una corrida con error quedaba con costo 0, no se reintentaba y contaba como fallo del método | Gasto subestimado y M1 castigado por fallas de infraestructura | Se conserva el gasto, se reintenta al reanudar y se informa aparte |
| En IaC-Eval, una política sin ninguna regla verdadera contaba como correcta | Corrección inflada | Exige al menos una regla verdadera; las 38 referencias seleccionadas siguen cumpliendo |
| Comparaciones de T contra cinco configuraciones sin ajuste | Más falsos positivos | Valores p ajustados con Holm |

Las demás correcciones agregan tiempos límite a OpenTofu, OPA y Claude Code, permiten reanudar aunque `resultados.jsonl` termine en una línea cortada, validan las opciones del CLI y muestran los atributos y las relaciones en la página de revisión. Cada corrección tiene su prueba. El único punto sin verificar (una posible clave en la configuración de usuario de Claude Code) quedó anotado en `_bmad-output/deferred-work.md`, fuera del repositorio.

La segunda parte de la revisión cubrió los scripts, las políticas de C3 y M3 y las listas de verificación de M4. Para comprobar cada observación se desplegó en Floci la solución de referencia de cada caso y se guardó su estado real, que es lo que miden M3 y M4. Los defectos que cambiaban la medición fueron estos:

| Problema | Consecuencia | Corrección |
|---|---|---|
| En el estado, un texto opcional sin valor queda como `""`; las listas preguntaban por `null` | En C03 y P1 cualquier cola contaba como cifrada; en C02 y C12 pasaban una tabla sin clave de ordenamiento y una regla sin programación | Se comprueba que el texto tenga valor |
| Las `inline_policy` de un rol son una lista de bloques y no un texto JSON | Sus acciones no se leían en M4 ni en M3 | Se lee cada bloque |
| Las declaraciones `Deny` contaban como acciones concedidas | Falsas violaciones de comodín y de escritura | Solo cuentan las declaraciones `Allow` |
| En el estado, todo bucket informa el cifrado por defecto del servicio | En C01 el cifrado por la forma antigua se daba siempre por cumplido | La forma antigua se reconoce en la configuración |
| Varios requisitos se comprobaban con menos exigencia que su texto (rutas de la API REST, comodines parciales en C04, principal de S3 en C05, alarma de la base en P2, entre otros) | M4 sobrestimado | Cada regla exige lo que dice el requisito |
| Protocolo `-1`, IPv6 `::/0` y reglas de entrada sueltas no se consideraban abiertas | Puertos abiertos sin detectar en C3, M3, C11 y P2 | Se consideran en todas |
| Las referencias de C05 y C10 dejaban el bucket sin bloqueo público ni cifrado | Una referencia que incumplía los requisitos de seguridad que recibe el modelo | Se agregaron el bloqueo y el cifrado |

Las pruebas de M3 y M4 usan ahora esos estados reales (`test/fixtures/desplegados/`) en lugar de planes: cada referencia cumple el 100 % de su lista sin violaciones, y cada forma alternativa o requisito tiene una prueba que la confirma o la hace fallar. Los scripts recibieron correcciones menores: validación de opciones, reanudación de `iaceval:preparar` sin descartar tareas por errores pasajeros y orden del diagnóstico. Con el caché actual, `iaceval:preparar` reproduce la misma selección de 38 tareas.

## 8. Matriz de trazabilidad

Requisito → módulo que lo implementa → pruebas que lo verifican. "Integración" se refiere a `test/integracion/`.

| Requisito | Módulo | Pruebas |
|---|---|---|
| RF-01 | `src/cli.ts` | Corrida de punta a punta |
| RF-02 | `src/agente`, `esquema/artefacto.schema.json` | `agente.test.ts`; piloto |
| RF-03 | `src/proveedor/consulta.ts`, `src/agente/agente.ts` | `consulta-esquema.test.ts`, `agente.test.ts` |
| RF-04 | `src/validador/c1-estructura.ts` | `validador-c1.test.ts` |
| RF-05 | `src/validador/c2-semantica.ts`, `src/proveedor/esquema.ts` | `validador-c2.test.ts`; integración `ciclo.test.ts` y `banco-errores.test.ts` |
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
