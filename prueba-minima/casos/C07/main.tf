# C07 (N2): una función que procesa los mensajes de una cola, con su rol de permisos mínimos.

resource "aws_sqs_queue" "trabajos" {
  name                       = "c07-trabajos"
  sqs_managed_sse_enabled    = true
  visibility_timeout_seconds = 60
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

resource "aws_iam_role" "procesador" {
  name               = "c07-procesador"
  assume_role_policy = data.aws_iam_policy_document.confianza_lambda.json
}

data "aws_iam_policy_document" "leer_cola" {
  statement {
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.trabajos.arn]
  }
}

resource "aws_iam_role_policy" "leer_cola" {
  name   = "c07-leer-cola"
  role   = aws_iam_role.procesador.id
  policy = data.aws_iam_policy_document.leer_cola.json
}

resource "aws_lambda_function" "procesador" {
  function_name    = "c07-procesador"
  role             = aws_iam_role.procesador.arn
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = var.ruta_lambda_zip
  source_code_hash = filebase64sha256(var.ruta_lambda_zip)
  timeout          = 30
}

resource "aws_lambda_event_source_mapping" "trabajos" {
  event_source_arn = aws_sqs_queue.trabajos.arn
  function_name    = aws_lambda_function.procesador.arn
  batch_size       = 10
}
