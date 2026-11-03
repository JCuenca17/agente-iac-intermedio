# Especificación de requisitos

Estructura inspirada en ISO/IEC/IEEE 29148 (ver `00-metodologia.md`, referencia [3]). Los requisitos se derivan de los hallazgos de la revisión sistemática del Hito 1 (estudios S01-S12) y de las decisiones técnicas aprobadas, que se registran como ADR en `adr/`. Al ser un estudio primario, no hubo entrevistas con clientes. La trazabilidad de cada requisito hasta el código y las pruebas está en `03-pruebas.md`.

## 1. Propósito y alcance

La herramienta recibe un requerimiento de infraestructura en lenguaje natural y, con un modelo de lenguaje, produce un artefacto intermedio en JSON que describe la infraestructura. Del artefacto se derivan, sin usar el modelo, un diagrama para revisión humana y el código OpenTofu. El artefacto se valida por capas y se corrige con la retroalimentación de los errores antes de desplegar en un emulador de AWS. La herramienta incluye además lo necesario para evaluarse experimentalmente: líneas base, ablaciones, métricas y análisis.

Fuera de alcance: el despliegue en AWS real, el código de las aplicaciones (las funciones Lambda usan un paquete fijo), otros proveedores cloud y la operación posterior al despliegue.

## 2. Problema que motiva los requisitos (resumen de la revisión)

- Los agentes LLM pasan del requerimiento al código y lo despliegan sin una instancia para revisar el diseño; el estudio que los evalúa sobre Azure reporta fallas acumuladas y riesgo de probar en la nube real (S01).
- Al quitar la validación previa, el desempeño cayó en promedio 26.2 pp en los cinco estudios que lo midieron con métrica porcentual (S04, S07, S08, S09, S10).
- La validación sintáctica sola no basta: hay código que pasa `terraform validate` con interfaces obsoletas (S06) y reglas que pasan `opa check` sin coherencia lógica (S05). Los mejores resultados combinan validación sintáctica, de planificación y semántica (S08, S12).
- La limitación más frecuente son las alucinaciones y el conocimiento desactualizado del proveedor (50 % de los estudios); el RAG aparece en el 41.7 %.
- La retroalimentación de la validación hacia la generación aparece en el 33.3 % de los estudios.
- Solo el 16.7 % usa representaciones intermedias antes del código (S03, S08), y los artefactos de diseño casi no se validan de forma automática.
- El costo y la latencia de los mecanismos de control son una limitación en el 41.7 % de los estudios.

## 3. Objetivo y preguntas de investigación

Objetivo: desarrollar un agente basado en LLM que, a partir de un requerimiento, genere un artefacto intermedio estructurado del que se obtengan el diagrama de arquitectura para revisión y el código ejecutable, y que valide ese artefacto antes de desplegar para reducir errores y costos.

- PE1: ¿En qué medida generar un artefacto intermedio validado, en lugar de código OpenTofu directo, cambia la tasa de despliegue exitoso en el emulador?
- PE2: ¿Qué errores detecta cada capa de validación y cuánto aportan el validador, la retroalimentación y la consulta al esquema del proveedor?
- PE3: ¿Cuánto costo agregan los mecanismos de control y cómo cambian el costo y el éxito con la complejidad del requerimiento?

## 4. Interesados

| Interesado | Interés |
|---|---|
| Investigador (autor) | Construir el artefacto y obtener evidencia para PE1-PE3 |
| Revisor humano | Ver y aprobar el diseño antes de que se despliegue |
| Quien ejecuta el experimento | Instalar la herramienta en su equipo o en la nube, con su propia cuenta y su propio gasto de API, sin sorpresas de costo |
| Lectores del artículo y docente | Poder reproducir y auditar los resultados |

## 5. Restricciones

| ID | Restricción | Origen |
|---|---|---|
| R-01 | Costo mínimo: el software es libre o gratuito y el único gasto posible es la API del modelo, con límites | Acuerdo del proyecto (ADR-000, ADR-001) |
| R-02 | El despliegue se hace solo en un emulador de AWS, nunca en una cuenta real | Riesgo y costo de probar en la nube real (S01, S12); ADR-002 |
| R-03 | Proveedor AWS de OpenTofu fijado en la versión 6.71.0 | Reproducibilidad; prueba mínima |
| R-04 | El emulador no reproduce la consistencia eventual ni las cuotas de AWS (S08): los resultados valen para el entorno emulado | Amenaza a la validez declarada |

## 6. Requisitos funcionales

Prioridad: E = esencial para responder las preguntas de investigación; D = deseable.

| ID | Requisito | Origen | Prioridad | Cómo se verifica |
|---|---|---|---|---|
| RF-01 | Recibir el requerimiento en lenguaje natural, como texto o desde un archivo | Objetivo | E | Corrida de punta a punta desde la línea de comandos |
| RF-02 | Generar con el modelo un artefacto intermedio en JSON con recursos, relaciones, propósito y supuestos, conforme a un esquema publicado | Representaciones intermedias (S03, S08); ADR-004 | E | Pruebas del agente con respuestas grabadas; piloto con el modelo real |
| RF-03 | Permitir que el agente consulte, durante la generación, el esquema vigente del proveedor para los tipos de recurso que use | Alucinaciones y conocimiento desactualizado (50 %); S06; ADR-006 | E | Pruebas de la consulta y del agente |
| RF-04 | Validar la estructura del artefacto contra el JSON Schema (capa C1) | S09; ADR-007 | E | Pruebas de C1 |
| RF-05 | Validar la semántica del artefacto contra el esquema del proveedor (capa C2): tipos y atributos inexistentes, deprecados, de solo lectura u obligatorios faltantes, referencias rotas, dependencias faltantes o circulares | Validación sintáctica insuficiente (S05, S06); dependencias faltantes en el 80 % de las fallas de S08; ADR-007 | E | Pruebas de C2 |
| RF-06 | Validar políticas de seguridad sobre el artefacto, antes de generar código (capa C3) | Motores de políticas (S05, S10, S12); ADR-007 | E | Pruebas Rego y de C3 |
| RF-07 | Traducir el artefacto a código OpenTofu sin usar el modelo | Objetivo; ADR-005 | E | Pruebas del traductor; `tofu validate` sobre el código traducido |
| RF-08 | Validar y planificar el código contra el emulador sin crear recursos (capa C4) | `validate`/`plan` en S06, S08, S12; ADR-007 | E | Pruebas unitarias e integración de C4 |
| RF-09 | Devolver al modelo los errores de cualquier capa, con capa, ubicación, regla y mensaje, hasta un máximo de iteraciones; si se agotan, terminar sin desplegar | Retroalimentación (33.3 %; S05, S10); ADR-008 | E | Pruebas e integración del ciclo |
| RF-10 | Generar el diagrama de arquitectura (Mermaid) del mismo artefacto, sin usar el modelo | S03; ADR-005 | E | Pruebas del diagrama; renderizado con mermaid-cli |
| RF-11 | Mostrar a una persona el diagrama, los recursos, los supuestos, los errores corregidos y el resumen del plan, y desplegar solo si aprueba; si rechaza con comentarios, volver a diseñar con ellos. Permitir la aprobación automática en los experimentos | Revisión humana (S03, S05, S07); ADR-009 | E | Pruebas de la página; corrida de punta a punta |
| RF-12 | Desplegar en el emulador solo lo aprobado, comprobar con un segundo plan que no quedan cambios pendientes y destruir al terminar | Compuerta validar → aprobar → desplegar; ADR-011 | E | Integración del despliegue |
| RF-13 | Registrar cada corrida (llamadas, tokens, costo, validaciones por capa, despliegue y tiempos) en un archivo de trazas | Métricas del experimento; ADR-012 | E | Pruebas del registro |
| RF-14 | Trabajar con tres proveedores del modelo: respuestas grabadas, Claude Code con la sesión del plan y la API de Anthropic | Costo mínimo; ADR-000, ADR-016 | E | Pruebas de los proveedores; piloto |
| RF-15 | Ejecutar las líneas base de generación directa (B0 sin validar, B1 con validate/plan) y las ablaciones sin validador (A1), sin retroalimentación (A2) y sin consulta al esquema (A3) | Diseño experimental (PE1, PE2) | E | Pruebas del ciclo y de la generación directa |
| RF-16 | Ejecutar el experimento (casos × configuraciones × repeticiones), medir M1-M6 en cada corrida y poder reanudarlo | Diseño experimental | E | Pruebas del ejecutor; ensayo y piloto |
| RF-17 | Resumir los resultados por configuración y nivel, con intervalos de confianza y comparaciones pareadas | Diseño experimental (análisis) | E | Pruebas de estadística y resumen |
| RF-18 | Medir las tareas de IaC-Eval con su propio protocolo (compilabilidad, desplegabilidad y corrección) para comparar con S12 | Comparación con un benchmark publicado; ADR-017 | E | Pruebas de IaC-Eval |
| RF-19 | Comprobar qué recursos funcionan en cada emulador con soluciones de referencia de los casos | Fidelidad de los entornos sustitutos (S08); ADR-002 | D | Prueba mínima en Floci y MiniStack |

## 7. Requisitos no funcionales

| ID | Atributo | Requisito | Origen | Cómo se verifica |
|---|---|---|---|---|
| RNF-01 | Costo | La configuración por defecto no gasta dinero (respuestas grabadas). Hay un límite de gasto por corrida y otro por experimento. El modelo por defecto es el más barato que cumple (Haiku 5.5) | Costo y latencia (41.7 %); ADR-000, ADR-001 | Pruebas de configuración y del ejecutor; piloto |
| RNF-02 | Seguridad y aislamiento | Ninguna llamada de OpenTofu sale del emulador, aunque el servicio no esté en la lista de endpoints. Se usan credenciales de prueba. Las claves de API viven solo en `.env` o en secretos y nunca se suben | Riesgo de la nube real (S01, S12) | Revisión del entorno de ejecución; dos incidentes corregidos (ver ADR-002) |
| RNF-03 | Portabilidad | Funciona en Windows, macOS, Linux y GitHub Codespaces. Todo lo variable se configura por entorno. Un diagnóstico (`npm run doctor`) indica qué falta | ADR-015 | Instalación probada en Windows y en la imagen de Codespaces |
| RNF-04 | Reproducibilidad | Versiones fijadas de OpenTofu, OPA, proveedor, emuladores y dataset (revisión y semilla). Traducción y diagrama deterministas | Validez de los resultados | Pruebas de determinismo; archivo de versiones |
| RNF-05 | Explicabilidad de errores | Cada error indica capa, ruta dentro del artefacto (JSON Pointer), regla y mensaje en español, con sugerencias cuando el nombre es parecido a uno válido | Retroalimentación útil para el modelo y la persona | Pruebas de C1-C4 |
| RNF-06 | Eficiencia | Las capas se ejecutan de la más barata a la más costosa y se detienen en la primera que falla. El prompt de sistema usa caché | Costo y latencia (41.7 %) | Pruebas del ciclo; trazas del piloto |
| RNF-07 | Equidad de la medición | Todas las configuraciones reciben la misma versión del proveedor, los mismos requisitos de seguridad y la misma configuración del emulador, y se miden con las mismas reglas (M3 y M4 sobre lo desplegado) | Validez interna del experimento | Pruebas de M3 y M4; documentación de decisiones de medición |
| RNF-08 | Mantenibilidad | TypeScript estricto, pruebas automatizadas en cada capa, un commit por paso | Calidad del artefacto | `npm test`, `npm run test:integracion`, historial |
| RNF-09 | Licencias | Todo el software usado es libre o gratuito. Los datos de IaC-Eval se usan con atribución (CC BY 4.0) | R-01 | Archivo de atribución |
| RNF-10 | Usabilidad | Comandos con ayuda en español y página de revisión legible en modo claro y oscuro | Revisión humana | Captura de la página de revisión |

## 8. Supuestos

- El emulador representa el comportamiento de AWS lo suficiente para comparar configuraciones entre sí, aunque no para afirmar resultados sobre AWS real (R-04).
- Las listas de verificación de los casos (M4) representan lo que pide cada requerimiento; se escribieron antes de correr el experimento y se validaron contra soluciones de referencia.
