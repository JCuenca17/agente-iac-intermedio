# C05 (N2): al subir un archivo al bucket se envía un aviso a una cola.

resource "aws_s3_bucket" "cargas" {
  bucket = "c05-cargas"
}

resource "aws_s3_bucket_public_access_block" "cargas" {
  bucket                  = aws_s3_bucket.cargas.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cargas" {
  bucket = aws_s3_bucket.cargas.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_sqs_queue" "avisos" {
  name                    = "c05-avisos-carga"
  sqs_managed_sse_enabled = true
}

data "aws_iam_policy_document" "s3_envia_a_cola" {
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.avisos.arn]
    principals {
      type        = "Service"
      identifiers = ["s3.amazonaws.com"]
    }
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_s3_bucket.cargas.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "avisos" {
  queue_url = aws_sqs_queue.avisos.id
  policy    = data.aws_iam_policy_document.s3_envia_a_cola.json
}

resource "aws_s3_bucket_notification" "cargas" {
  bucket = aws_s3_bucket.cargas.id
  queue {
    queue_arn = aws_sqs_queue.avisos.arn
    events    = ["s3:ObjectCreated:*"]
  }
  depends_on = [aws_sqs_queue_policy.avisos]
}
