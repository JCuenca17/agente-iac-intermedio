# C04 (N1): rol que solo puede leer un bucket específico.

data "aws_iam_policy_document" "confianza" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lector" {
  name               = "c04-lector-reportes"
  assume_role_policy = data.aws_iam_policy_document.confianza.json
}

data "aws_iam_policy_document" "solo_lectura" {
  statement {
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::c04-reportes"]
  }
  statement {
    actions   = ["s3:GetObject"]
    resources = ["arn:aws:s3:::c04-reportes/*"]
  }
}

resource "aws_iam_policy" "solo_lectura" {
  name   = "c04-solo-lectura-reportes"
  policy = data.aws_iam_policy_document.solo_lectura.json
}

resource "aws_iam_role_policy_attachment" "lector" {
  role       = aws_iam_role.lector.name
  policy_arn = aws_iam_policy.solo_lectura.arn
}
