# IaC-Eval

Las tareas de esta carpeta (requerimiento, política Rego e implementación de referencia) provienen del dataset IaC-Eval:

P. T. J. Kon et al., "IaC-Eval: A code generation benchmark for cloud infrastructure-as-code programs", NeurIPS 2024, Datasets and Benchmarks Track.
https://huggingface.co/datasets/autoiac-project/iac-eval (revisión 4a4e68a48d1d2bf3cb553a0afbcd173e1b519ff8)

Licencia de los datos: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).

Cambios: de cada implementación de referencia se quitaron los bloques `terraform` y `provider`, porque apuntaban a una cuenta real de AWS; la herramienta los reemplaza por la configuración del emulador. Se seleccionaron solo las tareas cuya referencia funciona en el emulador (ver seleccion.json y scripts/iaceval-preparar.mjs).
