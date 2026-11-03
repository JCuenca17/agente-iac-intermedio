# C01 (N1): bucket para respaldos, privado, con versionado y cifrado.

resource "aws_s3_bucket" "respaldos" {
  bucket = "c01-respaldos"
}

resource "aws_s3_bucket_versioning" "respaldos" {
  bucket = aws_s3_bucket.respaldos.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "respaldos" {
  bucket = aws_s3_bucket.respaldos.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "respaldos" {
  bucket                  = aws_s3_bucket.respaldos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
