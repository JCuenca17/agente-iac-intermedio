# Proveedor AWS apuntando al emulador. El script de la prueba mínima copia este
# archivo junto a cada caso. El endpoint y la región se pasan como variables.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "endpoint" {
  description = "URL del emulador de AWS"
  type        = string
  default     = "http://localhost:4566"
}

variable "region" {
  description = "Región de AWS que simula el emulador"
  type        = string
  default     = "us-east-1"
}

variable "ruta_lambda_zip" {
  description = "Ruta al paquete mínimo de las funciones Lambda"
  type        = string
  default     = "../../recursos/lambda/minima.zip"
}

provider "aws" {
  region                      = var.region
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  # Igual que la guía oficial de Floci. Sin esta opción el proveedor usa S3 Control con la
  # cuenta como subdominio (000000000000.localhost), que no resuelve en local.
  skip_requesting_account_id = true
  skip_metadata_api_check    = true
  s3_use_path_style          = true

  endpoints {
    apigateway     = var.endpoint
    apigatewayv2   = var.endpoint
    cloudwatch     = var.endpoint
    cloudwatchlogs = var.endpoint
    dynamodb       = var.endpoint
    ec2            = var.endpoint
    events         = var.endpoint
    iam            = var.endpoint
    kms            = var.endpoint
    lambda         = var.endpoint
    s3             = var.endpoint
    s3control      = var.endpoint
    sns            = var.endpoint
    sqs            = var.endpoint
    sts            = var.endpoint
  }

  default_tags {
    tags = {
      proyecto = "agente-iac-intermedio"
    }
  }
}
