# C11 (N3): red con subred pública y privada y grupos de seguridad para web y base de datos.

resource "aws_vpc" "principal" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
}

resource "aws_subnet" "publica" {
  vpc_id                  = aws_vpc.principal.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "${var.region}a"
  map_public_ip_on_launch = true
}

resource "aws_subnet" "privada" {
  vpc_id            = aws_vpc.principal.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "${var.region}a"
}

resource "aws_internet_gateway" "principal" {
  vpc_id = aws_vpc.principal.id
}

resource "aws_route_table" "publica" {
  vpc_id = aws_vpc.principal.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.principal.id
  }
}

resource "aws_route_table_association" "publica" {
  subnet_id      = aws_subnet.publica.id
  route_table_id = aws_route_table.publica.id
}

# Las reglas van dentro de cada grupo de seguridad. Con los recursos sueltos
# aws_vpc_security_group_egress_rule, MiniStack 1.5.36 no guarda las etiquetas de la
# regla, y en los dos emuladores referenced_security_group_id vuelve con la cuenta delante.
# Ver prueba-minima/README.md.

resource "aws_security_group" "web" {
  name        = "c11-web"
  description = "Trafico HTTP y HTTPS desde internet"
  vpc_id      = aws_vpc.principal.id

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
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

resource "aws_security_group" "base_datos" {
  name        = "c11-base-datos"
  description = "PostgreSQL solo desde el grupo web"
  vpc_id      = aws_vpc.principal.id

  ingress {
    description     = "PostgreSQL desde el grupo web"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.web.id]
  }
}
