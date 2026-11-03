# C08 (N2): una API HTTP con una ruta que invoca una función.

data "aws_iam_policy_document" "confianza_lambda" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "saludo" {
  name               = "c08-saludo"
  assume_role_policy = data.aws_iam_policy_document.confianza_lambda.json
}

resource "aws_lambda_function" "saludo" {
  function_name    = "c08-saludo"
  role             = aws_iam_role.saludo.arn
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = var.ruta_lambda_zip
  source_code_hash = filebase64sha256(var.ruta_lambda_zip)
}

resource "aws_apigatewayv2_api" "api" {
  name          = "c08-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "saludo" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.saludo.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "saludo" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /saludo"
  target    = "integrations/${aws_apigatewayv2_integration.saludo.id}"
}

resource "aws_apigatewayv2_stage" "defecto" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api" {
  statement_id  = "PermitirApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.saludo.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
