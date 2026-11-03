# P2 (proyecto grande): aplicación web de tres capas.
# Red en dos zonas de disponibilidad con subredes públicas y privadas, salida a internet
# por NAT para las privadas, balanceador público, grupo de autoescalado de servidores web
# en las subredes privadas, base de datos PostgreSQL privada y cifrada, bucket privado
# para archivos y logs de la aplicación.

locals {
  # Zona de disponibilidad -> número para calcular los rangos de las subredes.
  zonas = {
    a = 0
    b = 1
  }
}

# --- Red ----------------------------------------------------------------------------------

resource "aws_vpc" "principal" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
}

resource "aws_internet_gateway" "principal" {
  vpc_id = aws_vpc.principal.id
}

resource "aws_subnet" "publica" {
  for_each = local.zonas

  vpc_id                  = aws_vpc.principal.id
  cidr_block              = cidrsubnet(aws_vpc.principal.cidr_block, 8, each.value)
  availability_zone       = "${var.region}${each.key}"
  map_public_ip_on_launch = true
}

resource "aws_subnet" "privada" {
  for_each = local.zonas

  vpc_id            = aws_vpc.principal.id
  cidr_block        = cidrsubnet(aws_vpc.principal.cidr_block, 8, each.value + 10)
  availability_zone = "${var.region}${each.key}"
}

resource "aws_eip" "nat" {
  domain = "vpc"
}

resource "aws_nat_gateway" "principal" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.publica["a"].id
  depends_on    = [aws_internet_gateway.principal]
}

resource "aws_route_table" "publica" {
  vpc_id = aws_vpc.principal.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.principal.id
  }
}

resource "aws_route_table" "privada" {
  vpc_id = aws_vpc.principal.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.principal.id
  }
}

resource "aws_route_table_association" "publica" {
  for_each = aws_subnet.publica

  subnet_id      = each.value.id
  route_table_id = aws_route_table.publica.id
}

resource "aws_route_table_association" "privada" {
  for_each = aws_subnet.privada

  subnet_id      = each.value.id
  route_table_id = aws_route_table.privada.id
}

# --- Grupos de seguridad ------------------------------------------------------------------

resource "aws_security_group" "balanceador" {
  name        = "p2-balanceador"
  description = "HTTP y HTTPS desde internet"
  vpc_id      = aws_vpc.principal.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Salida a cualquier destino"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "web" {
  name        = "p2-web"
  description = "Puerto de la aplicacion solo desde el balanceador"
  vpc_id      = aws_vpc.principal.id

  ingress {
    description     = "Aplicacion desde el balanceador"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.balanceador.id]
  }

  egress {
    description = "Salida a cualquier destino"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "base_datos" {
  name        = "p2-base-datos"
  description = "PostgreSQL solo desde los servidores web"
  vpc_id      = aws_vpc.principal.id

  ingress {
    description     = "PostgreSQL desde los servidores web"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.web.id]
  }
}

# --- Balanceador ----------------------------------------------------------------------------

resource "aws_lb" "web" {
  name               = "p2-web"
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.balanceador.id]
  subnets            = [for s in aws_subnet.publica : s.id]
}

resource "aws_lb_target_group" "web" {
  name     = "p2-web"
  port     = 8080
  protocol = "HTTP"
  vpc_id   = aws_vpc.principal.id

  health_check {
    path = "/salud"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.web.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

# --- Servidores web -----------------------------------------------------------------------

data "aws_iam_policy_document" "confianza_ec2" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "web" {
  name               = "p2-web"
  assume_role_policy = data.aws_iam_policy_document.confianza_ec2.json
}

resource "aws_iam_role_policy" "web" {
  name = "p2-web-permisos"
  role = aws_iam_role.web.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject"], Resource = ["${aws_s3_bucket.archivo.arn}/*"] },
      { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = ["${aws_cloudwatch_log_group.aplicacion.arn}:*"] },
    ]
  })
}

resource "aws_iam_instance_profile" "web" {
  name = "p2-web"
  role = aws_iam_role.web.name
}

resource "aws_launch_template" "web" {
  name          = "p2-web"
  image_id      = "ami-0abcdef1234567890"
  instance_type = "t3.micro"

  iam_instance_profile {
    arn = aws_iam_instance_profile.web.arn
  }
  vpc_security_group_ids = [aws_security_group.web.id]
}

resource "aws_autoscaling_group" "web" {
  name                = "p2-web"
  min_size            = 2
  max_size            = 4
  desired_capacity    = 2
  vpc_zone_identifier = [for s in aws_subnet.privada : s.id]
  target_group_arns   = [aws_lb_target_group.web.arn]

  launch_template {
    id      = aws_launch_template.web.id
    version = "$Latest"
  }
}

resource "aws_autoscaling_policy" "cpu" {
  name                   = "p2-web-cpu"
  autoscaling_group_name = aws_autoscaling_group.web.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 60
  }
}

# --- Base de datos -------------------------------------------------------------------------

resource "aws_db_subnet_group" "principal" {
  name       = "p2-base-datos"
  subnet_ids = [for s in aws_subnet.privada : s.id]
}

resource "aws_db_parameter_group" "principal" {
  name   = "p2-postgres16"
  family = "postgres16"

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
}

resource "aws_db_instance" "principal" {
  identifier                  = "p2-base-datos"
  engine                      = "postgres"
  engine_version              = "16"
  instance_class              = "db.t3.micro"
  allocated_storage           = 20
  db_name                     = "aplicacion"
  username                    = "aplicacion"
  manage_master_user_password = true
  db_subnet_group_name        = aws_db_subnet_group.principal.name
  parameter_group_name        = aws_db_parameter_group.principal.name
  vpc_security_group_ids      = [aws_security_group.base_datos.id]
  storage_encrypted           = true
  publicly_accessible         = false
  backup_retention_period     = 7
  skip_final_snapshot         = true
}

# --- Archivos y logs -----------------------------------------------------------------------

resource "aws_s3_bucket" "archivo" {
  bucket = "p2-archivos-aplicacion"
}

resource "aws_s3_bucket_versioning" "archivo" {
  bucket = aws_s3_bucket.archivo.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "archivo" {
  bucket = aws_s3_bucket.archivo.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "archivo" {
  bucket                  = aws_s3_bucket.archivo.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudwatch_log_group" "aplicacion" {
  name              = "/p2/aplicacion"
  retention_in_days = 30
}

# --- Monitoreo ------------------------------------------------------------------------------

resource "aws_sns_topic" "alerta" {
  name = "p2-alertas"
}

resource "aws_cloudwatch_metric_alarm" "cpu_base_datos" {
  alarm_name          = "p2-cpu-base-datos"
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  dimensions = {
    DBInstanceIdentifier = aws_db_instance.principal.identifier
  }
  alarm_actions = [aws_sns_topic.alerta.arn]
}

resource "aws_cloudwatch_log_group" "flujo_red" {
  name              = "/p2/flujo-red"
  retention_in_days = 30
}

data "aws_iam_policy_document" "confianza_flujo" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["vpc-flow-logs.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "flujo_red" {
  name               = "p2-flujo-red"
  assume_role_policy = data.aws_iam_policy_document.confianza_flujo.json
}

resource "aws_iam_role_policy" "flujo_red" {
  name = "p2-flujo-red"
  role = aws_iam_role.flujo_red.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
      Resource = ["${aws_cloudwatch_log_group.flujo_red.arn}:*"]
    }]
  })
}

resource "aws_flow_log" "vpc" {
  vpc_id          = aws_vpc.principal.id
  traffic_type    = "ALL"
  log_destination = aws_cloudwatch_log_group.flujo_red.arn
  iam_role_arn    = aws_iam_role.flujo_red.arn
}
