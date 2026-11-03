# ADR-018: Toda llamada de OpenTofu forzada al emulador

- Estado: aceptada
- Fecha: 2026-11-03
- Requisitos relacionados: RNF-02

## Contexto

Dos veces una llamada salió a AWS real: primero la consulta de etiquetas de S3 Control al cambiar una opción del proveedor, y luego Chime y Redshift, que no estaban en la lista de endpoints. AWS las rechazó porque las credenciales son de prueba; no hubo costo ni efecto.

## Opciones consideradas

1. Ampliar la lista de endpoints.
2. Forzar el endpoint de todos los servicios con `AWS_ENDPOINT_URL`.

## Decisión

OpenTofu se ejecuta siempre con `AWS_ENDPOINT_URL` apuntando al emulador, credenciales de prueba, sin perfiles locales ni metadatos de EC2. La lista de endpoints queda como respaldo explícito. Se mantiene `skip_requesting_account_id`, como en la guía oficial de Floci.

## Consecuencias

Ninguna llamada puede salir del emulador aunque el modelo use un servicio no previsto. Verificado: Redshift se crea en el emulador.
