# Prueba mínima de recursos en el emulador

Antes de construir el agente se comprobó qué recursos funcionan en el emulador. Para cada uno de los 12 casos del experimento (C01 a C12) hay una solución de referencia escrita a mano en `casos/CXX/main.tf`. El script la despliega, comprueba que un segundo `tofu plan` no muestre cambios pendientes y la destruye.

```bash
npm run prueba-minima          # los 12 casos
npm run prueba-minima C05 C11  # solo algunos
```

`proveedor.tf` apunta el proveedor AWS al emulador (`AWS_ENDPOINT`, por defecto `http://localhost:4566`). `.terraform.lock.hcl` fija la versión del proveedor para que todos usen la misma. Los resultados se guardan en `resultados.md` y `resultados.json`.

Estas soluciones sirven también como referencia de cada caso en el experimento: las listas de verificación de cumplimiento se escriben a partir de ellas.

## Casos

| Nivel | Caso | Servicios |
|---|---|---|
| N1 | C01 | S3 (versionado, cifrado, bloqueo de acceso público) |
| N1 | C02 | DynamoDB (clave compuesta, TTL, recuperación) |
| N1 | C03 | SQS con cola de fallidos |
| N1 | C04 | IAM (rol de solo lectura sobre un bucket) |
| N2 | C05 | S3 + SQS (notificación) |
| N2 | C06 | SNS + 2 SQS |
| N2 | C07 | Lambda + SQS + IAM |
| N2 | C08 | API Gateway HTTP + Lambda + IAM |
| N3 | C09 | API Gateway + Lambda + DynamoDB + IAM |
| N3 | C10 | S3 + Lambda + DynamoDB + SQS + IAM |
| N3 | C11 | VPC, subredes, rutas, grupos de seguridad |
| N3 | C12 | EventBridge + Lambda + SNS + CloudWatch Logs |

## Limitaciones del emulador encontradas

MiniStack 1.5.36 con el proveedor AWS 6.71.0:

- `aws_vpc_security_group_egress_rule` con `ip_protocol = "-1"` no conserva las etiquetas, y `aws_vpc_security_group_ingress_rule` devuelve `referenced_security_group_id` con el número de cuenta delante (`000000000000/sg-...`). En los dos casos, `tofu plan` muestra cambios pendientes justo después del `apply`. En AWS real no pasa. Con las reglas escritas dentro de `aws_security_group` (bloques `ingress` y `egress`) el caso queda limpio, así que la referencia de C11 usa esa forma.
- Las funciones Lambda se crean sin Docker; no se ejecutan, porque el experimento mide la infraestructura y no el código de la aplicación.
