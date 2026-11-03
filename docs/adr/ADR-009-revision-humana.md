# ADR-009: Página de revisión y aprobación en la terminal

- Estado: aceptada
- Fecha: 2026-11-02
- Requisitos relacionados: RF-11

## Contexto

S03 revisa con personas cada propuesta; S05 deja la semántica a un experto; S07 escala a revisión humana con baja confianza. El borrador de arquitectura producía un diagrama que nadie revisaba.

## Opciones consideradas

1. Página HTML local y aprobación en la terminal.
2. Interfaz web con servidor.
3. Solo terminal, con el diagrama en texto.

## Decisión

Se genera una página HTML local con el diagrama, los recursos, los supuestos, los errores corregidos y el resumen del plan. La persona aprueba o rechaza en la terminal; los comentarios del rechazo vuelven al agente. `--auto-aprobar` omite la pregunta en los experimentos.

## Consecuencias

Sin servidor que mantener. En el experimento la aprobación es automática y así se declara; la revisión humana no forma parte de las preguntas de investigación.
