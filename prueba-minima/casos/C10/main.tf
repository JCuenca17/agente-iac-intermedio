# C10 (N3): procesamiento de cargas. El bucket dispara una función que guarda
# metadatos en una tabla; los eventos que fallan van a una cola de fallidos.

resource "aws_s3_bucket" "cargas" {
  bucket = "c10-cargas"
}

resource "aws_dynamodb_table" "metadatos" {
  name         = "c10-metadatos"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "clave_objeto"

  attribute {
    name = "clave_objeto"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_sqs_queue" "fallidos" {
  name                    = "c10-fallidos"
  sqs_managed_sse_enabled = true
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
  name               = "c10-procesador"
  assume_role_policy = data.aws_iam_policy_document.confianza_lambda.json
}

data "aws_iam_policy_document" "permisos" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.cargas.arn}/*"]
  }
  statement {
    actions   = ["dynamodb:PutItem"]
    resources = [aws_dynamodb_table.metadatos.arn]
  }
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.fallidos.arn]
  }
}

resource "aws_iam_role_policy" "permisos" {
  name   = "c10-permisos"
  role   = aws_iam_role.procesador.id
  policy = data.aws_iam_policy_document.permisos.json
}

resource "aws_lambda_function" "procesador" {
  function_name    = "c10-procesador"
  role             = aws_iam_role.procesador.arn
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = var.ruta_lambda_zip
  source_code_hash = filebase64sha256(var.ruta_lambda_zip)
  dead_letter_config {
    target_arn = aws_sqs_queue.fallidos.arn
  }
  environment {
    variables = {
      TABLA = aws_dynamodb_table.metadatos.name
    }
  }
}

resource "aws_lambda_permission" "s3" {
  statement_id  = "PermitirS3"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.procesador.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.cargas.arn
}

resource "aws_s3_bucket_notification" "cargas" {
  bucket = aws_s3_bucket.cargas.id
  lambda_function {
    lambda_function_arn = aws_lambda_function.procesador.arn
    events              = ["s3:ObjectCreated:*"]
  }
  depends_on = [aws_lambda_permission.s3]
}
