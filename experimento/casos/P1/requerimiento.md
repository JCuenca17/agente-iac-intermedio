Necesito la infraestructura de una tienda en línea serverless:

- Una API HTTP pública con estas rutas: GET /productos y GET /productos/{id} para el catálogo, GET /carrito y PUT /carrito para el carrito del cliente, y POST /pedidos para registrar un pedido. Cada grupo de rutas lo atiende su propia función Lambda en Python (catálogo, carrito y pedidos).
- Tres tablas de DynamoDB con pago por uso y recuperación ante borrado: productos (clave producto_id), carritos (clave cliente_id, con expiración automática de los carritos abandonados) y pedidos (clave pedido_id y fecha).
- Las imágenes de los productos se guardan en un bucket de S3 privado, con versionado y cifrado. La función del catálogo solo puede leerlas.
- Al registrar un pedido, la función de pedidos lo envía a una cola de SQS cifrada. Otra función procesa la cola, actualiza el estado del pedido y publica un aviso en un tema de SNS. Si un pedido falla tres veces, pasa a una cola de fallidos.
- Todos los días a las 6:00 (UTC), una regla programada ejecuta una función de reporte que lee los pedidos y publica un resumen en el mismo tema de SNS.
- Cada función tiene su propio rol con solo los permisos que necesita y sus logs se guardan 30 días.
