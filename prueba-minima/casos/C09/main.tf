# C09 (N3): API de registro de usuarios: API, función y tabla, con permisos mínimos.

resource "aws_dynamodb_table" "usuarios" {
  name         = "c09-usuarios"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "usuario_id"

  attribute {
    name = "usuario_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

data "aws_iam_policy_document" "confianza_lambda" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "registro" {
  name               = "c09-registro"
  assume_role_policy = data.aws_iam_policy_document.confianza_lambda.json
}

data "aws_iam_policy_document" "escribir_tabla" {
  statement {
    actions   = ["dynamodb:PutItem", "dynamodb:GetItem"]
    resources = [aws_dynamodb_table.usuarios.arn]
  }
}

resource "aws_iam_role_policy" "escribir_tabla" {
  name   = "c09-escribir-usuarios"
  role   = aws_iam_role.registro.id
  policy = data.aws_iam_policy_document.escribir_tabla.json
}

resource "aws_lambda_function" "registro" {
  function_name    = "c09-registro"
  role             = aws_iam_role.registro.arn
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = var.ruta_lambda_zip
  source_code_hash = filebase64sha256(var.ruta_lambda_zip)
  environment {
    variables = {
      TABLA = aws_dynamodb_table.usuarios.name
    }
  }
}

resource "aws_apigatewayv2_api" "api" {
  name          = "c09-api-usuarios"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "registro" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.registro.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "registro" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /usuarios"
  target    = "integrations/${aws_apigatewayv2_integration.registro.id}"
}

resource "aws_apigatewayv2_stage" "defecto" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api" {
  statement_id  = "PermitirApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.registro.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
