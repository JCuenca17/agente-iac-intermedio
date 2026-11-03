# P1 (proyecto grande): tienda en línea serverless.
# Catálogo, carrito y pedidos detrás de una API HTTP; los pedidos se procesan de forma
# asíncrona con una cola; las notificaciones van por un tema; las imágenes de productos
# en un bucket privado; un reporte diario programado. Permisos mínimos por función.

locals {
  funciones = {
    catalogo = "Lista y consulta los productos"
    carrito  = "Lee y actualiza el carrito del cliente"
    pedidos  = "Registra el pedido y lo encola para procesarlo"
    procesar = "Procesa los pedidos de la cola"
    reporte  = "Genera el reporte diario de ventas y lo publica"
  }
}

# --- Datos ----------------------------------------------------------------------------

resource "aws_dynamodb_table" "producto" {
  name         = "p1-productos"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "producto_id"

  attribute {
    name = "producto_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "carrito" {
  name         = "p1-carritos"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "cliente_id"

  attribute {
    name = "cliente_id"
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

resource "aws_dynamodb_table" "pedido" {
  name         = "p1-pedidos"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pedido_id"
  range_key    = "fecha"

  attribute {
    name = "pedido_id"
    type = "S"
  }

  attribute {
    name = "fecha"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

# --- Imágenes de productos ----------------------------------------------------------------

resource "aws_s3_bucket" "imagen" {
  bucket = "p1-imagenes-productos"
}

resource "aws_s3_bucket_versioning" "imagen" {
  bucket = aws_s3_bucket.imagen.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "imagen" {
  bucket = aws_s3_bucket.imagen.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "imagen" {
  bucket                  = aws_s3_bucket.imagen.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# --- Mensajería ---------------------------------------------------------------------------

resource "aws_sqs_queue" "pedido_fallido" {
  name                    = "p1-pedidos-fallidos"
  sqs_managed_sse_enabled = true
}

resource "aws_sqs_queue" "pedido" {
  name                       = "p1-pedidos"
  sqs_managed_sse_enabled    = true
  visibility_timeout_seconds = 60
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.pedido_fallido.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sns_topic" "notificacion" {
  name = "p1-notificaciones"
}

# --- Funciones: rol, logs y función por cada una --------------------------------------------

data "aws_iam_policy_document" "confianza_lambda" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "funcion" {
  for_each           = local.funciones
  name               = "p1-${each.key}"
  description        = each.value
  assume_role_policy = data.aws_iam_policy_document.confianza_lambda.json
}

resource "aws_cloudwatch_log_group" "funcion" {
  for_each          = local.funciones
  name              = "/aws/lambda/p1-${each.key}"
  retention_in_days = 30
}

resource "aws_lambda_function" "funcion" {
  for_each         = local.funciones
  function_name    = "p1-${each.key}"
  description      = each.value
  role             = aws_iam_role.funcion[each.key].arn
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = var.ruta_lambda_zip
  source_code_hash = filebase64sha256(var.ruta_lambda_zip)
  timeout          = 30

  environment {
    variables = {
      TABLA_PRODUCTOS = aws_dynamodb_table.producto.name
      TABLA_CARRITOS  = aws_dynamodb_table.carrito.name
      TABLA_PEDIDOS   = aws_dynamodb_table.pedido.name
      COLA_PEDIDOS    = aws_sqs_queue.pedido.url
      TEMA_AVISOS     = aws_sns_topic.notificacion.arn
      BUCKET_IMAGENES = aws_s3_bucket.imagen.bucket
    }
  }
  depends_on = [aws_cloudwatch_log_group.funcion]
}

# Permisos mínimos de cada función.
locals {
  permisos = {
    catalogo = [
      { acciones = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan"], recursos = [aws_dynamodb_table.producto.arn] },
      { acciones = ["s3:GetObject"], recursos = ["${aws_s3_bucket.imagen.arn}/*"] },
    ]
    carrito = [
      { acciones = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem"], recursos = [aws_dynamodb_table.carrito.arn] },
      { acciones = ["dynamodb:GetItem"], recursos = [aws_dynamodb_table.producto.arn] },
    ]
    pedidos = [
      { acciones = ["dynamodb:PutItem"], recursos = [aws_dynamodb_table.pedido.arn] },
      { acciones = ["dynamodb:GetItem", "dynamodb:DeleteItem"], recursos = [aws_dynamodb_table.carrito.arn] },
      { acciones = ["sqs:SendMessage"], recursos = [aws_sqs_queue.pedido.arn] },
    ]
    procesar = [
      { acciones = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"], recursos = [aws_sqs_queue.pedido.arn] },
      { acciones = ["dynamodb:UpdateItem"], recursos = [aws_dynamodb_table.pedido.arn] },
      { acciones = ["sns:Publish"], recursos = [aws_sns_topic.notificacion.arn] },
    ]
    reporte = [
      { acciones = ["dynamodb:Query", "dynamodb:Scan"], recursos = [aws_dynamodb_table.pedido.arn] },
      { acciones = ["sns:Publish"], recursos = [aws_sns_topic.notificacion.arn] },
    ]
  }
}

resource "aws_iam_role_policy" "funcion" {
  for_each = local.funciones
  name     = "p1-${each.key}-permisos"
  role     = aws_iam_role.funcion[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [for p in local.permisos[each.key] : { Effect = "Allow", Action = p.acciones, Resource = p.recursos }],
      [{
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["${aws_cloudwatch_log_group.funcion[each.key].arn}:*"]
      }]
    )
  })
}

# --- API HTTP -----------------------------------------------------------------------------

resource "aws_apigatewayv2_api" "tienda" {
  name          = "p1-tienda"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_stage" "defecto" {
  api_id      = aws_apigatewayv2_api.tienda.id
  name        = "$default"
  auto_deploy = true
}

locals {
  integraciones = toset(["catalogo", "carrito", "pedidos"])
  rutas = {
    "GET /productos"      = "catalogo"
    "GET /productos/{id}" = "catalogo"
    "GET /carrito"        = "carrito"
    "PUT /carrito"        = "carrito"
    "POST /pedidos"       = "pedidos"
  }
}

resource "aws_apigatewayv2_integration" "funcion" {
  for_each               = local.integraciones
  api_id                 = aws_apigatewayv2_api.tienda.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.funcion[each.key].invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "ruta" {
  for_each  = local.rutas
  api_id    = aws_apigatewayv2_api.tienda.id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.funcion[each.value].id}"
}

resource "aws_lambda_permission" "api" {
  for_each      = local.integraciones
  statement_id  = "PermitirApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.funcion[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.tienda.execution_arn}/*/*"
}

# --- Procesamiento asíncrono y reporte diario ----------------------------------------------

resource "aws_lambda_event_source_mapping" "pedido" {
  event_source_arn = aws_sqs_queue.pedido.arn
  function_name    = aws_lambda_function.funcion["procesar"].arn
  batch_size       = 10
}

resource "aws_cloudwatch_event_rule" "reporte_diario" {
  name                = "p1-reporte-diario"
  schedule_expression = "cron(0 6 * * ? *)"
}

resource "aws_cloudwatch_event_target" "reporte" {
  rule = aws_cloudwatch_event_rule.reporte_diario.name
  arn  = aws_lambda_function.funcion["reporte"].arn
}

resource "aws_lambda_permission" "reporte" {
  statement_id  = "PermitirEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.funcion["reporte"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.reporte_diario.arn
}
