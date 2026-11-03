# Manual de uso

Esta guía es para quien instala y usa la herramienta. La herramienta se usa desde la terminal: no tiene una interfaz de chat. La única parte visual es la página de revisión que se abre en el navegador antes de desplegar, y la página de resultados del experimento.

`npm run ayuda` lista todos los comandos con un ejemplo. Los comandos `agente` y `experimento` muestran todas sus opciones con `--ayuda`.

## 1. Antes de empezar

Se necesitan Node 22 o superior, OpenTofu 1.13.1, OPA 1.22.0 y un emulador de AWS (Floci con Docker o MiniStack). El README explica cómo instalarlos en Windows, Linux y GitHub Codespaces.

```powershell
npm install
copy .env.example .env        # en Linux o Codespaces: cp .env.example .env
npm run esquema-proveedor     # una sola vez por PC
npm run doctor                # dice qué falta
npm run prueba-minima         # opcional: comprueba el emulador con los 12 casos
```

`npm run doctor` termina con "Todo listo." cuando no falta nada. Si algo falla, indica qué instalar o configurar.

## 2. Configuración (`.env`)

Todo lo que cambia de una PC a otra va en `.env`. El archivo nunca se sube al repositorio.

| Variable | Para qué | Valor por defecto |
|---|---|---|
| `LLM_PROVEEDOR` | Quién responde: `grabado` (respuestas guardadas, sin costo), `claude-code` (el plan de Claude de quien ejecuta), `anthropic` (API de Anthropic) u `openai-compatible` (OpenRouter, NVIDIA, Groq, Ollama) | `grabado` |
| `LLM_MODELO` | Modelo; con `openai-compatible`, el nombre del modelo en ese proveedor | `claude-haiku-5-5` |
| `ANTHROPIC_API_KEY` | Clave de la API de Anthropic (solo con `anthropic`) | vacía |
| `LLM_BASE_URL`, `LLM_API_KEY` | URL y clave del proveedor (solo con `openai-compatible`; `.env.example` trae las URL) | vacías |
| `LLM_PRECIO_ENTRADA_MTOK`, `LLM_PRECIO_SALIDA_MTOK` | Precio por millón de tokens de un modelo que no está en `precios.json` (0 si es gratuito) | vacías |
| `AWS_ENDPOINT`, `AWS_REGION` | Dónde escucha el emulador | `http://localhost:4566`, `us-east-1` |
| `EMULADOR` | `floci` o `ministack` | `floci` |
| `MAX_ITERACIONES` | Intentos del ciclo de corrección | 3 |
| `LIMITE_GASTO_USD` | Tope de gasto por corrida | 5 |
| `LIMITE_GASTO_EXPERIMENTO_USD` | Tope de gasto de todo un experimento | 10 |
| `TOFU_TIEMPO_LIMITE_S` | Segundos antes de cortar un comando de OpenTofu colgado | 1200 |

Para cambiar de modelo basta con cambiar `LLM_PROVEEDOR` y `LLM_MODELO`. Si el modelo no tiene precio, la herramienta se detiene antes de la primera llamada.

## 3. Usar la herramienta con un requerimiento

```powershell
npm run agente -- "Necesito una cola de SQS cifrada con una cola de fallidos."
npm run agente -- --archivo experimento\casos\C10\requerimiento.md
```

Qué pasa en orden:

1. El modelo escribe el diseño (artefacto intermedio). Puede consultar el esquema vigente del proveedor AWS.
2. El diseño pasa por cuatro capas de validación: estructura (C1), atributos contra el esquema del proveedor (C2), políticas de seguridad (C3) y `tofu validate` y `plan` contra el emulador (C4). Si una falla, el error vuelve al modelo y lo intenta otra vez.
3. Se escribe `revision.html` (diagrama, recursos con sus atributos, relaciones, supuestos y errores corregidos) y la terminal pregunta si se aprueba. Con `n` se puede escribir un comentario y el modelo rediseña con él.
4. Si se aprueba, se despliega en el emulador, un segundo plan comprueba que lo desplegado coincide con lo declarado y todo se destruye.

| Opción | Efecto |
|---|---|
| `--archivo <ruta>` | Lee el requerimiento de un archivo |
| `--salida <carpeta>` | Carpeta de la corrida (por defecto `corridas/<fecha-hora>`) |
| `--auto-aprobar` | No pregunta; aprueba el diseño (necesario si no hay terminal interactiva) |
| `--sin-desplegar` | Se detiene después de la revisión |
| `--conservar` | No destruye lo desplegado (hay que destruirlo después a mano) |
| `--sin-rag`, `--sin-validador`, `--sin-retro` | Ablaciones A3, A1 y A2 |
| `--respuestas <ruta>` | Respuestas guardadas, con `LLM_PROVEEDOR=grabado` |

Cada corrida deja en su carpeta `artefacto.json`, `diagrama.mmd`, `revision.html`, `resultado.json` y `trazas.jsonl` (cada llamada al modelo con sus tokens y su costo estimado, cada validación y el despliegue).

## 4. Ejecutar el experimento

El experimento corre casos × configuraciones × repeticiones sin preguntar nada: aprueba solo y mide M1 a M6 en cada corrida. Se usa siempre la misma `--salida`, porque si se corta, el mismo comando sigue donde quedó. El orden recomendado está en `04-diseno-experimental.md`, sección 7.1.

```powershell
npm run experimento -- --casos C01 --repeticiones 1 --salida resultados\ensayo
npm run experimento -- --salida resultados\exp1
npm run experimento -- --casos reales --config T,B0,B1 --salida resultados\exp1
npm run experimento -- --casos iaceval --config T,B0,B1 --repeticiones 1 --salida resultados\exp1
npm run resumen -- resultados\exp1
```

| Opción | Efecto |
|---|---|
| `--casos` | `C01,C02,...`; `reales` (R1 y R2, proyectos públicos); `grandes` (P1 y P2, propios); `iaceval` (las 38 tareas); por defecto, C01 a C12 |
| `--config` | `T`, `B0`, `B1`, `A1`, `A2`, `A3`; por defecto, todas |
| `--repeticiones` | Repeticiones de cada combinación (por defecto 3) |
| `--salida` | Carpeta de resultados |

El experimento se detiene antes de pasar `LIMITE_GASTO_EXPERIMENTO_USD`. `npm run resumen` escribe `resumen.md` (tablas), `resumen.json` y `resumen.html` (gráficos que se abren en el navegador, sin conexión).

## 5. Otros comandos

| Comando | Para qué |
|---|---|
| `npm run banco-errores` | Mide qué capa detecta cada uno de 43 errores insertados a mano; sin modelo ni costo |
| `npm run iaceval:preparar` | Vuelve a seleccionar las tareas de IaC-Eval; con el caché actual reproduce las mismas 38 |
| `npm test` | Pruebas unitarias y de políticas |
| `npm run test:integracion` | Pruebas contra el emulador |

## 6. Problemas frecuentes

| Mensaje | Qué hacer |
|---|---|
| `no responde en http://localhost:4566` | Iniciar el emulador (Docker Desktop y el contenedor `floci`, o `ministack`) |
| `No hay precio para el modelo` | Agregar el modelo a `precios.json` o definir `LLM_PRECIO_ENTRADA_MTOK` y `LLM_PRECIO_SALIDA_MTOK` |
| `La revisión del diseño necesita una terminal interactiva` | Ejecutar en una terminal propia o agregar `--auto-aprobar` |
| `superó el tiempo límite` | El emulador se colgó: reiniciarlo; en el experimento, volver a ejecutar el mismo comando |
| `construccion-no-permitida` | El modelo escribió algo que no puede llegar a OpenTofu (provisioners, otros proveedores); es una medida de seguridad |
