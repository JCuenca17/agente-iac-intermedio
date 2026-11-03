# C03 (N1): cola de trabajos con cola de mensajes fallidos tras 3 intentos.

resource "aws_sqs_queue" "fallidos" {
  name                    = "c03-trabajos-fallidos"
  sqs_managed_sse_enabled = true
}

resource "aws_sqs_queue" "trabajos" {
  name                    = "c03-trabajos"
  sqs_managed_sse_enabled = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.fallidos.arn
    maxReceiveCount     = 3
  })
}
