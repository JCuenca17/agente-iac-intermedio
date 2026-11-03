# C12 (N3): evento programado que ejecuta una función que publica en un tema, con registro de logs.

resource "aws_sns_topic" "avisos" {
  name = "c12-avisos"
}

resource "aws_cloudwatch_log_group" "funcion" {
  name              = "/aws/lambda/c12-reporte-diario"
  retention_in_days = 14
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

resource "aws_iam_role" "reporte" {
  name               = "c12-reporte-diario"
  assume_role_policy = data.aws_iam_policy_document.confianza_lambda.json
}

data "aws_iam_policy_document" "permisos" {
  statement {
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.avisos.arn]
  }
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.funcion.arn}:*"]
  }
}

resource "aws_iam_role_policy" "permisos" {
  name   = "c12-permisos"
  role   = aws_iam_role.reporte.id
  policy = data.aws_iam_policy_document.permisos.json
}

resource "aws_lambda_function" "reporte" {
  function_name    = "c12-reporte-diario"
  role             = aws_iam_role.reporte.arn
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = var.ruta_lambda_zip
  source_code_hash = filebase64sha256(var.ruta_lambda_zip)
  environment {
    variables = {
      TEMA = aws_sns_topic.avisos.arn
    }
  }
  depends_on = [aws_cloudwatch_log_group.funcion]
}

resource "aws_cloudwatch_event_rule" "diario" {
  name                = "c12-diario"
  schedule_expression = "cron(0 8 * * ? *)"
}

resource "aws_cloudwatch_event_target" "reporte" {
  rule = aws_cloudwatch_event_rule.diario.name
  arn  = aws_lambda_function.reporte.arn
}

resource "aws_lambda_permission" "eventbridge" {
  statement_id  = "PermitirEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.reporte.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.diario.arn
}
