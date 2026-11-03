# C06 (N2): un tema que reparte cada mensaje a dos colas.

resource "aws_sns_topic" "eventos" {
  name = "c06-eventos"
}

resource "aws_sqs_queue" "facturacion" {
  name                    = "c06-facturacion"
  sqs_managed_sse_enabled = true
}

resource "aws_sqs_queue" "inventario" {
  name                    = "c06-inventario"
  sqs_managed_sse_enabled = true
}

data "aws_iam_policy_document" "sns_envia" {
  for_each = {
    facturacion = aws_sqs_queue.facturacion.arn
    inventario  = aws_sqs_queue.inventario.arn
  }
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [each.value]
    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_sns_topic.eventos.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "facturacion" {
  queue_url = aws_sqs_queue.facturacion.id
  policy    = data.aws_iam_policy_document.sns_envia["facturacion"].json
}

resource "aws_sqs_queue_policy" "inventario" {
  queue_url = aws_sqs_queue.inventario.id
  policy    = data.aws_iam_policy_document.sns_envia["inventario"].json
}

resource "aws_sns_topic_subscription" "facturacion" {
  topic_arn = aws_sns_topic.eventos.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.facturacion.arn
}

resource "aws_sns_topic_subscription" "inventario" {
  topic_arn = aws_sns_topic.eventos.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.inventario.arn
}
