# C02 (N1): tabla de pedidos con clave de partición y de ordenamiento,
# pago por uso y expiración de registros.

resource "aws_dynamodb_table" "pedidos" {
  name         = "c02-pedidos"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "cliente_id"
  range_key    = "fecha_pedido"

  attribute {
    name = "cliente_id"
    type = "S"
  }

  attribute {
    name = "fecha_pedido"
    type = "S"
  }

  ttl {
    attribute_name = "expira_en"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }
}
