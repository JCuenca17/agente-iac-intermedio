# Metodología

## 1. Enfoque

Este proyecto es un estudio primario: se construye una herramienta para responder preguntas de investigación sobre la generación y validación de infraestructura cloud con modelos de lenguaje. Por eso sigue la metodología de investigación en ciencia del diseño (Design Science Research Methodology, DSRM) de Peffers et al. [1], pensada para investigaciones que construyen y evalúan un artefacto. Organiza el trabajo en seis actividades: identificar el problema, definir los objetivos de la solución, diseñar y desarrollar el artefacto, demostrarlo, evaluarlo y comunicar los resultados. El marco de Hevner et al. [2] aporta el criterio de fondo: el artefacto se justifica por el conocimiento existente (la revisión del Hito 1) y se evalúa con métodos rigurosos.

Dentro de la actividad de diseño y desarrollo se aplican prácticas de ingeniería de software: especificación de requisitos, arquitectura con registro de decisiones, desarrollo dirigido por pruebas, integración continua local con pruebas automatizadas y control de versiones con un commit por paso. Los documentos de esta carpeta son la evidencia de cada actividad.

## 2. Actividades, productos y evidencia

| Actividad DSRM [1] | Qué se hizo | Producto | Evidencia |
|---|---|---|---|
| 1. Identificación del problema y motivación | Revisión sistemática de la literatura (Kitchenham y Charters) sobre agentes LLM que generan y validan infraestructura cloud, 12 estudios analizados | Problema y brechas: los agentes pasan del requerimiento al código y lo despliegan sin una instancia de revisión; la validación sintáctica sola no basta; pocas representaciones intermedias (16.7 %) | Informe del Hito 1 |
| 2. Definición de los objetivos de la solución | Objetivo del artefacto, preguntas de investigación PE1-PE3 y requisitos derivados de los hallazgos | Objetivos, preguntas y requisitos con su origen | `01-requisitos.md` |
| 3. Diseño y desarrollo | Evaluación crítica de una arquitectura borrador frente a la revisión, arquitectura corregida, decisiones técnicas con alternativas y desarrollo incremental dirigido por pruebas | Arquitectura, decisiones (ADR) y la herramienta | `02-arquitectura.md`, `adr/`, código y historial de commits |
| 4. Demostración | Prueba mínima de los 12 casos en dos emuladores, corridas de punta a punta con respuestas grabadas y piloto con el modelo real | Evidencia de que el artefacto funciona en casos concretos | `03-pruebas.md`, `prueba-minima/resultados-*.md` |
| 5. Evaluación | Experimento con casos propios, líneas base, ablaciones, proyectos grandes y el benchmark IaC-Eval; métricas M1-M6 y pruebas estadísticas | Resultados y análisis | `04-diseno-experimental.md`, `npm run experimento`, `npm run resumen` |
| 6. Comunicación | Artículo en formato IEEE | Artículo | Fase 4 del proyecto |

El proceso de DSRM es iterativo: la demostración y la evaluación pueden devolver el trabajo a la actividad de diseño. En este proyecto, la prueba mínima en los emuladores cambió la configuración del proveedor y la elección del emulador principal (ADR-002, ADR-018), y el piloto ajustó la forma de ejecutar el modelo (ADR-014).

## 3. Puntos de entrada

Según Peffers et al. [1], una investigación puede empezar en distintas actividades del proceso. Esta empieza por el problema: parte de las brechas que identificó la revisión del Hito 1.

## 4. Prácticas de ingeniería de software dentro del diseño y desarrollo

| Práctica | Cómo se aplica | Evidencia |
|---|---|---|
| Especificación de requisitos | Requisitos funcionales y no funcionales con identificador, origen en la revisión o en una decisión aprobada, y criterio de verificación. Estructura inspirada en ISO/IEC/IEEE 29148 [3] | `01-requisitos.md` |
| Arquitectura y registro de decisiones | Vistas de contexto, contenedores y componentes; cada decisión técnica con alternativas, justificación y consecuencias | `02-arquitectura.md`, `adr/` |
| Desarrollo dirigido por pruebas | Prueba escrita antes del código en los módulos de validación, traducción y medición; verificación de tipos estricta | `test/`, historial de commits |
| Verificación por niveles | Pruebas unitarias, pruebas de políticas en Rego, pruebas de integración contra el emulador y prueba mínima de recursos | `03-pruebas.md` |
| Control de versiones | Un commit por paso, con descripción de lo hecho y de lo verificado | Historial del repositorio |
| Reproducibilidad | Versiones fijadas de todas las herramientas, del proveedor y del dataset; instalación automatizada y verificada | `versiones.json`, `.devcontainer/` |

## Referencias

[1] K. Peffers, T. Tuunanen, M. A. Rothenberger y S. Chatterjee, "A Design Science Research Methodology for Information Systems Research," *Journal of Management Information Systems*, vol. 24, no. 3, pp. 45-77, 2007, doi: 10.2753/MIS0742-1222240302.

[2] A. R. Hevner, S. T. March, J. Park y S. Ram, "Design Science in Information Systems Research," *MIS Quarterly*, vol. 28, no. 1, pp. 75-105, 2004.

[3] ISO/IEC/IEEE 29148:2018, *Systems and software engineering — Life cycle processes — Requirements engineering*. (Pendiente de verificar la edición vigente.)

Referencias [1] a [3]: nuevas respecto del Hito 1. [1] y [2] verificadas el 2026-11-03 (JMIS y dblp); [3], pendiente.
