# Diseño experimental

La evaluación sigue la forma en que evalúan los estudios de la revisión: casos de dificultad creciente, líneas base, ablaciones y métricas de despliegue en un entorno sustituto (S04, S08, S10), y se agrega la comparación con un benchmark público (IaC-Eval) y dos proyectos grandes.

## 1. Preguntas de investigación

| Pregunta | Relación con la revisión | Se responde con |
|---|---|---|
| PE1. ¿En qué medida generar un artefacto intermedio validado, en lugar de código OpenTofu directo, cambia la tasa de despliegue exitoso en el emulador? | PI1 (enfoques de generación); representaciones intermedias en el 16.7 % | T frente a B0 y B1; IaC-Eval |
| PE2. ¿Qué errores detecta cada capa de validación y cuánto aportan el validador, la retroalimentación y la consulta al esquema del proveedor? | PI2 (mecanismos de validación); caída media de 26.2 pp sin validación | Ablaciones A1-A3; errores por capa; prueba del validador |
| PE3. ¿Cuánto costo agregan los mecanismos de control y cómo cambian el costo y el éxito con la complejidad del requerimiento? | PI3 (limitaciones); costo y latencia en el 41.7 % | Tokens, costo, tiempo e iteraciones por nivel |

## 2. Entorno fijo

| Elemento | Valor |
|---|---|
| Modelo | Claude Haiku 5.5 (`claude-haiku-5-5`), esfuerzo por defecto |
| Emulador principal | Floci 2.4.0 |
| Emulador de réplica | MiniStack 1.5.36 |
| Infraestructura como código | OpenTofu 1.13.1, proveedor `hashicorp/aws` 6.71.0 |
| Políticas | OPA 1.22.0 |
| Estado | Cada corrida destruye lo que despliega; si la destrucción falla, el emulador se reinicia |

Los modelos actuales no permiten fijar la temperatura, así que las respuestas varían entre corridas. Cada combinación de los casos propios se repite 3 veces, como en S08.

## 3. Casos

### 3.1 Casos propios (C01-C12)

Doce requerimientos en tres niveles. Cada uno tiene una solución de referencia (`prueba-minima/casos/`), que pasa la prueba mínima en los dos emuladores, y una lista de verificación en Rego (`experimento/casos/CXX/intencion.rego`), escrita antes de correr el experimento.

| Nivel | Casos | Servicios |
|---|---|---|
| N1, un servicio | C01-C04 | S3; DynamoDB; SQS con cola de fallidos; IAM |
| N2, dos o tres servicios | C05-C08 | S3 + SQS; SNS + SQS; Lambda + SQS + IAM; API Gateway + Lambda |
| N3, varios servicios | C09-C12 | API + Lambda + DynamoDB; S3 + Lambda + DynamoDB + SQS; VPC con grupos de seguridad; EventBridge + Lambda + SNS + logs |

### 3.2 Proyectos grandes (P1, P2)

| Proyecto | Arquitectura | Recursos de la referencia |
|---|---|---|
| P1 | Tienda serverless: API con 5 rutas, 5 funciones con rol y logs propios, 3 tablas, cola con cola de fallidos, tema de avisos, bucket de imágenes y reporte diario programado | 47 |
| P2 | Aplicación de tres capas: red en dos zonas con NAT, balanceador, autoescalado de servidores, PostgreSQL privada y cifrada, bucket de archivos, logs, registros de flujo y alarma | Unos 41 (pendiente de verificar en Floci) |

### 3.3 IaC-Eval

Muestra del benchmark IaC-Eval (Kon et al., NeurIPS 2024), el único público para esta tarea según S12. Se toman hasta 10 tareas por nivel de dificultad (6 niveles), al azar con semilla fija, entre las que usan solo AWS y cuya referencia funciona en el emulador (`npm run iaceval:preparar`). Se descartan las referencias que no cumplen su propia política. Con 30 intentos por nivel quedaron 38 tareas: 10, 10, 6, 7, 3 y 2 en los niveles 1 a 6. Los niveles altos tienen menos porque usan servicios que el emulador no soporta o referencias que no cumplen su propia política (`experimento/iaceval/seleccion.json`).

## 4. Configuraciones

| ID | Configuración | Artefacto | Validación C1-C4 | Retroalimentación | Consulta al esquema |
|---|---|---|---|---|---|
| T | Herramienta completa | Sí | Sí | Hasta 3 | Sí |
| B0 | Generación directa | No (el modelo escribe OpenTofu) | No | No | No |
| B1 | Directa con retroalimentación | No | Solo validate y plan | Hasta 3 | No |
| A1 | Sin validador | Sí | No | Solo errores de formato | Sí |
| A2 | Sin retroalimentación | Sí | Sí, un intento | No | Sí |
| A3 | Sin consulta al esquema | Sí | Sí | Hasta 3 | No |

En A1 el modelo vuelve a responder solo si su respuesta no se pudo leer como JSON: sin una respuesta legible no hay nada que traducir. Así A1 difiere de T únicamente en las capas C1-C4.

B1 separa el efecto del artefacto intermedio del efecto de iterar con los errores de la herramienta, que ya usa el 41.7 % de los estudios. Todas las configuraciones reciben la misma versión del proveedor, los mismos requisitos de seguridad y la misma configuración del emulador. En el experimento la revisión humana se aprueba de forma automática.

## 5. Tamaño

| Conjunto | Unidades | Configuraciones | Repeticiones | Corridas |
|---|---|---|---|---|
| Casos propios | 12 | 6 | 3 | 216 |
| Proyectos grandes | 2 | T, B0, B1 | 3 | 18 |
| IaC-Eval | 38 | T, B0, B1 | 1 (como S12) | 114 |
| Total | | | | 348 |

## 6. Métricas

| ID | Métrica | Cómo se mide |
|---|---|---|
| M1 | Despliegue exitoso | `tofu apply` sin errores y un `tofu plan` posterior sin cambios reales |
| M2 | Errores detectados antes del despliegue | Cantidad por capa (C0-C4) y reglas, en todas las iteraciones |
| M3 | Violaciones de política en lo desplegado | Las mismas reglas de C3, evaluadas sobre el estado después del apply |
| M4 | Cumplimiento del requerimiento | Proporción de la lista de verificación del caso que se cumple en lo desplegado |
| M5 | Iteraciones | Vueltas del ciclo hasta el éxito o hasta el tope |
| M6 | Costo | Tokens de entrada y salida, costo estimado a precio de lista, tiempo y llamadas |
| S12 | Compilabilidad, desplegabilidad y corrección (solo IaC-Eval) | Protocolo de IaC-Eval: `validate`, `plan` y su política Rego sobre el plan |

Decisiones de medición (ADR-019), iguales para todas las configuraciones:

- M3 y M4 se miden sobre el estado después del apply. En el plan, los valores que dependen de otros recursos (por ejemplo, una política IAM con referencias) quedan desconocidos hasta aplicar.
- M4 acepta las formas deprecadas que siguen funcionando; el uso de una forma deprecada se cuenta en M2.
- Si una configuración no despliega, M3 y M4 valen 0.
- La diferencia de `referenced_security_group_id` con el número de cuenta delante del mismo ID se trata como cosmética y se registra aparte.

## 7. Análisis

- Por configuración y nivel: proporción de M1 con intervalo de confianza del 95 % (Wilson); medias de M3, M4, iteraciones, tokens y costo.
- Comparaciones pareadas por caso y repetición de T contra cada configuración: prueba de McNemar exacta para M1 y de Wilcoxon de rangos con signo exacta para M4 y el costo. Como T se compara con cinco configuraciones, los valores p se ajustan con Holm.
- Las corridas que terminan por una falla de infraestructura (la API o el emulador no responden) no cuentan como fallos del método: se repiten al reanudar, se informan aparte y su costo se suma al total.
- Con 36 corridas por configuración, una diferencia pequeña puede no ser significativa. Por eso se reporta el tamaño de cada diferencia junto con el valor p, como hace la revisión.
- Las cifras de S12 sobre IaC-Eval provienen de otros modelos y de AWS real; se presentan como contexto. La comparación que permite conclusiones es la interna (T frente a B0 y B1 con el mismo modelo y las mismas tareas).

Comandos: `npm run experimento` y `npm run resumen`.

## 8. Estudios complementarios sin costo de API

- Réplica en MiniStack: se repite el experimento cambiando `EMULADOR` y `AWS_ENDPOINT`, para comprobar que los resultados no dependen de Floci.
- Prueba del validador (`npm run banco-errores`): 43 artefactos con un solo error insertado a mano, al menos 5 por tipo (estructura, atributo inexistente, atributo deprecado, referencia rota, dependencia circular, tipo inválido, violación de política y valor fuera de rango), a partir de los artefactos válidos de C01, C03 y C07. Las 8 violaciones de política cubren los siete requisitos de seguridad. Se valida con las capas reales, sin modelo. Resultado (2026-11-03, Floci): 42 de 43 errores (98 %) se detectan antes del despliegue, todos en la capa esperada (C1: 5, C2: 25, C3: 8, C4: 4). El que no se detecta es `batch_size = 0` en el disparador de la cola: el proveedor no valida ese rango en `validate` ni en `plan`, de modo que solo fallaría al desplegar. Resultados en `experimento/banco-errores/`.

## 9. Prueba piloto

Claude Haiku 5.5 a través de Claude Code (sin costo adicional), configuración T, un caso por nivel, una repetición, en MiniStack:

| Caso | Nivel | Iteraciones | Tokens de entrada (con caché) | Tokens de salida | Costo a precio de API | M1 | M4 | M3 |
|---|---|---|---|---|---|---|---|---|
| C01 | N1 | 1 | 3 376 | 2 228 | US$ 0.0015 | sí | 100 % | 0 |
| C07 | N2 | 1 | 3 378 | 4 494 | US$ 0.0024 | sí | 100 % | 0 |
| C10 | N3 | 1 | 3 424 | 6 851 | US$ 0.0036 | sí | 100 % | 0 |

El costo lo dominan los tokens de salida, que crecen con el caso. En el piloto el modelo no usó la consulta al esquema, lo que anticipa que A3 podría no diferir de T en los casos simples. Cada corrida tardó entre 47 y 137 segundos, casi todo en el despliegue y la destrucción.

## 10. Presupuesto

Con los datos del piloto y el precio de lista de Haiku 5.5: unos US$ 0.86 para los casos propios, US$ 0.34 para IaC-Eval y US$ 0.27 para los proyectos grandes, en total cerca de US$ 1.50. Con un margen del doble queda por debajo de US$ 3. El experimento se ejecuta con la clave de API de quien lo corre y con `LIMITE_GASTO_EXPERIMENTO_USD` como tope. Tiempo estimado: unas 10 horas, con posibilidad de reanudar.

## 11. Amenazas a la validez

| Tipo | Amenaza | Mitigación |
|---|---|---|
| Interna | Los casos y sus listas de verificación los escribió el autor | Listas fijadas antes de correr, validadas contra soluciones de referencia y versiones dañadas, publicadas en el repositorio; IaC-Eval aporta tareas escritas por terceros |
| Interna | Respuestas del modelo no deterministas | 3 repeticiones; comparaciones pareadas |
| Interna | Revisión humana automática en el experimento | Se declara; la revisión humana no forma parte de las preguntas |
| Constructo | M4 depende de cómo se escribió cada lista | Las listas aceptan formas alternativas válidas y se documentan las decisiones (ADR-019) |
| Externa | El emulador no reproduce la consistencia eventual ni las cuotas de AWS (S08), y Floci y MiniStack son de 2026 | Dos emuladores; las conclusiones se limitan al entorno emulado |
| Externa | Un solo modelo, de gama baja | Se declara; la réplica con Sonnet 5.5 queda como opción |
| Conclusión | Muestras pequeñas por configuración | Intervalos de confianza y tamaño del efecto junto al valor p |
| Conclusión | Las 3 repeticiones de un caso no son del todo independientes y T se compara con cinco configuraciones | Pares por caso y repetición, como en S08; valores p ajustados con Holm |
