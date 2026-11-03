# agente-iac-intermedio

Agente basado en un LLM que, a partir de un requerimiento en lenguaje natural, genera un artefacto intermedio en JSON que describe la infraestructura cloud. Del artefacto se derivan, de forma determinista, un diagrama Mermaid para revisión humana y el código OpenTofu. El artefacto se valida por capas antes de desplegar en un emulador de AWS.

Proyecto del curso Tópicos Avanzados en Ingeniería de Software, Universidad Nacional de San Agustín de Arequipa.

## Estado

En desarrollo.

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/00-metodologia.md`](docs/00-metodologia.md) | Metodología (Design Science Research) y evidencia de cada actividad |
| [`docs/01-requisitos.md`](docs/01-requisitos.md) | Especificación de requisitos con su origen en la revisión sistemática |

## Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| Node.js | 22 o superior | Ejecutar la herramienta |
| OpenTofu | 1.13.1 | Validar, planificar y desplegar |
| OPA | 1.22.0 | Políticas |
| Floci (con Docker) o MiniStack (sin Docker) | ver `versiones.json` | Emulador de AWS en `http://localhost:4566` |

Las versiones exactas están en `versiones.json`. Todo es gratuito.

## Instalación

**Windows (con winget):**

```powershell
winget install --id OpenTofu.Tofu --exact
winget install --id open-policy-agent.opa --exact
```

**macOS (con Homebrew):** `brew install opentofu opa`

**Linux:** sigue las guías oficiales de [OpenTofu](https://opentofu.org/docs/intro/install/) y [OPA](https://www.openpolicyagent.org/docs/#running-opa).

**Emulador principal: Floci** (gratuito, sin cuenta). Necesita Docker; en Windows y macOS, Docker Desktop es gratuito para uso personal y educativo.

```bash
docker run -d --name floci -p 4566:4566 -v /var/run/docker.sock:/var/run/docker.sock floci/floci:2.4.0
```

En la configuración deja `EMULADOR=floci`. Para detenerlo: `docker stop floci`; para volver a iniciarlo: `docker start floci`.

**Alternativa sin Docker: MiniStack.**

```bash
python -m venv .venv-emulador
# Windows: .venv-emulador\Scripts\pip install ministack==1.5.36
# macOS/Linux: .venv-emulador/bin/pip install ministack==1.5.36
```

Ejecuta `ministack` desde ese entorno en una terminal aparte, déjala abierta y pon `EMULADOR=ministack`. En Windows no uses `ministack -d`: el modo en segundo plano falla por una ruta de Linux.

**Proyecto:**

```bash
npm install
npm run esquema-proveedor   # descarga el proveedor AWS fijado y genera .cache/esquema-aws.json
npm run doctor              # revisa que todo esté listo
```

## En GitHub Codespaces (sin instalar nada)

1. En GitHub: botón **Code** → pestaña **Codespaces** → **Create codespace on main**. El espacio se cobra a la cuenta de quien lo crea (incluye 120 horas gratuitas al mes).
2. Si vas a usar la API de Anthropic, guarda tu clave como secreto de Codespaces llamado `ANTHROPIC_API_KEY` (Settings → Codespaces → Secrets) y pon `LLM_PROVEEDOR=anthropic` en `.env`.
3. Al abrirse, el espacio instala OpenTofu y OPA en las versiones fijadas (verificando sus sumas SHA-256), instala las dependencias, genera el esquema del proveedor e inicia Floci. Comprueba con `npm run doctor`.

La misma configuración (`.devcontainer/`) sirve para abrir el proyecto en un contenedor local con VS Code y Docker.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run agente -- "<requerimiento>"` | Genera el diseño, lo valida, abre la revisión y despliega en el emulador (`--ayuda` para ver las opciones) |
| `npm run doctor` | Revisa herramientas, configuración y emulador |
| `npm run iaceval:preparar` | Descarga IaC-Eval (versión fijada) y selecciona las tareas cuya referencia funciona en el emulador; las deja en `experimento/iaceval/` |
| `npm run resumen -- resultados/<fecha>` | Resume un experimento: métricas por configuración y nivel, intervalos de confianza y comparaciones pareadas (escribe `resumen.md` y `resumen.json`) |
| `npm run experimento -- --casos C01,C02 --config T,B0 --repeticiones 3` | Ejecuta el experimento y guarda una fila por corrida en `resultados/<fecha>/resultados.jsonl`; se puede reanudar (`--ayuda` para ver las opciones) |
| `npm run esquema-proveedor` | Genera el índice del esquema del proveedor AWS que usan el RAG y la capa C2 |
| `npm run prueba-minima` | Despliega las 12 soluciones de referencia en el emulador (ver `prueba-minima/README.md`) |
| `npm test` | Pruebas automáticas (TypeScript y políticas Rego); no usan el emulador ni ningún modelo |
| `npm run test:integracion` | Pruebas contra el emulador (necesita el emulador encendido); no usan ningún modelo |

## Configuración

1. Copia `.env.example` como `.env`.
2. Elige el proveedor del modelo en `LLM_PROVEEDOR`. Con `grabado` no se usa ningún servicio de pago.
3. Si usas `anthropic`, pon tu propia clave en `ANTHROPIC_API_KEY`: el gasto se cobra a tu cuenta.

El archivo `.env` no se sube al repositorio.

## Autor

José Luis Cuenca Gutiérrez.
