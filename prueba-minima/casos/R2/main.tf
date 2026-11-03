# R2: Vault on AWS (https://github.com/jcolemorrison/vault-on-aws, licencia MIT).
# Proyecto real: clúster de HashiCorp Vault con almacenamiento en DynamoDB, sellado con KMS,
# autoescalado detrás de un balanceador, VPC propia y bastión opcional.
#
# Adaptaciones para desplegarlo solo en el emulador (el resto es el código original):
#  1. Sin providers.tf: apuntaba a un perfil real de AWS; la herramienta configura el proveedor.
#  2. El certificado de ACM se crea aquí (el original leía uno ya emitido para el dominio).
#  3. Sin data "aws_ssm_parameter": se usa la AMI fija que el original ya trae por defecto.
#  4. El par de claves SSH se crea aquí con una clave pública de prueba (el original exigía uno existente).
#  5. Sin los dos local_file de outputs.tf: escribían archivos en la PC (otro proveedor).
#  6. domain_name y ec2_key_pair_name tienen valores por defecto.
#  7. Atributos actualizados a la versión 6.71 del proveedor cuando el original usaba formas eliminadas.

# --- variables.tf --------------------------------------------------------------------

# REQUIRED VARIABLES

# SSL Certificate for HTTPS Access

variable "domain_name" {
  description = "Domain name for which you've provisioned an SSL certificate via AWS Certificate Manager.  Example: secrets.examples.com.  Do not include the protocol (i.e. https://)."
  type = string
  default = "secrets.example.com" # Adaptación 6
}

# EC2 - General

variable "ec2_key_pair_name" {
  description = "Name of an existing EC2 Key Pair that exists in the same region as your vault deployment.  Needs to be made separately."
  type = string
  default = "vault-r2" # Adaptación 6
}

# OPTIONAL VARIABLES

# Organization

variable "main_project_tag" {
  description = "Tag that will be attached to all resources."
  type = string
  default = "vault-deployment"
}

# AWS Provider

variable "aws_profile" {
  description = "The AWS Profile to use for this project."
  type = string
  default = "default"
}

variable "aws_default_region" {
  description = "The default AWS region to deploy the Vault infrastructure to."
  type = string
  default = "us-east-1"
}

# Vault Version

variable "vault_version" {
  description = "Version of vault to use."
  type = string
  default = "1.4.0"
}

# Operator Mode
## Turning this on will enable NAT and Bastion to access the Vault Instances

variable "operator_mode" {
  description = "Enable a NAT Gateway and Bastion for operator access into the Vault Instances."
  type = bool
  default = true
}

# Private Deploy
## Turning this on will make it so that the Vault Deployemnt is only available through VPC peering

variable "private_mode" {
  description = "Whether or not the Vault deployment should be private."
  type = bool
  default = false
}

## A VPC in the SAME AWS Account and REGION as your Vault deployment.  The VPCs MUST have "enable dns hostnames" active AND cannot use the same CIDR block as the Vault VPC.
variable "peered_vpc_ids" {
  description = "A list of of a VPC IDs that can access the Vault VPC and thus access vault privately."
  type = list(string)
  default = []
}

# Allowed Traffic
## What IP Address ranges (via CIDR) are allowed to access your vault?

variable "allowed_traffic_cidr_blocks" {
  description = "List of CIDR blocks allowed to send requests to your vault endpoint.  Defaults to EVERYWHERE.  You should probably limit this to your organization IP or VPC CIDR."
  type = list(string)
  default = ["0.0.0.0/0"]
}

variable "allowed_traffic_cidr_blocks_ipv6" {
  description = "List of IPv6 CIDR blocks allowed to send requests to your vault endpoint.  Defaults to EVERYWHERE.  Set to an empty list if not required."
  type = list(string)
  default = ["::/0"]
}

## What IP Address range can access your bastion server?
variable "allowed_bastion_cidr_blocks" {
  description = "List of CIDR blocks allowed to access your Bastion.  Defaults to EVERYWHERE.  You should probably limit this to your organization IP or VPC CIDR."
  type = list(string)
  default = ["0.0.0.0/0"]
}

variable "allowed_bastion_cidr_blocks_ipv6" {
  description = "List of CIDR blocks allowed to access your Bastion.  Defaults to none."
  type = list(string)
  default = []
}

# AWS VPC

variable "vpc_cidr" {
  description = "Cidr block for the VPC.  Using a /16 or /20 Subnet Mask is recommended."
  type = string
  default = "10.255.0.0/20"
}

variable "vpc_instance_tenancy" {
  description = "Tenancy for instances launched into the VPC."
  type = string
  default = "default"
}

variable "vpc_tags" {
  description = "Additional tags to add to the VPC and its resources."
  type = map(string)
  default = {}
}

# VPC Subnets

variable "vpc_public_subnet_count" {
  description = "The number of public subnets to create.  Cannot exceed the number of AZs in your selected region.  2 is more than enough."
  type = number
  default = 2
}

variable "vpc_private_subnet_count" {
  description = "The number of private subnets to create.  Cannot exceed the number of AZs in your selected region."
  type = number
  default = 2
}

# EC2 - Vault Instance Launch Template

variable "vault_instance_type" {
  description = "The EC2 instance size of the vault instances."
  type = string
  default = "t2.medium"
}

# EC2 - Vault Instance AutoScaling Group

variable "vault_instance_count" {
  description = "The number of EC2 instances to launch as vault instances.  Should be no less than 2."
  type = number
  default = 2
}


# EC2 - AMI

variable "use_lastest_ami" {
  description = "Whether or not to use the latest version of Amazon Linux 2.  Defaults to false and uses a version that is known to work with this deployment."
  type = bool
  default = false
}

# DynamoDB

variable "dynamodb_table_name" {
  description = "Name of the DynamoDB Table used for the Vault Storage Backend."
  type = string
  default = "vault_storage"
}

# KMS

variable "kms_tags" {
  description = "Tags for the KMS key used to seal and unseal the Vault."
  type = map(string)
  default = {}
}

# --- aws-data.tf ---------------------------------------------------------------------

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

# --- certificate-manager.tf ----------------------------------------------------------

# Certificate Manager
# Adaptación 2: el original leía un certificado ya emitido (data "aws_acm_certificate").

resource "aws_acm_certificate" "vault_alb_cert" {
  domain_name       = var.domain_name
  validation_method = "DNS"
}

# Adaptación 4: el original exigía un par de claves existente.
resource "aws_key_pair" "vault" {
  key_name   = var.ec2_key_pair_name
  public_key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILvdrJTWGQLMH+lcJXdOOAxFGJMZg/3tD6tuQJ4bfRxd r2-prueba"
}

# --- kms.tf --------------------------------------------------------------------------

# AWS KMS Key
resource "aws_kms_key" "seal" {
  description = "The KMS key to unseal Vault."
  enable_key_rotation = true

  tags = merge(
    { "Name" = "${var.main_project_tag}-seal-key" },
    { "Project" = var.main_project_tag },
    var.kms_tags
  )
}

resource "aws_kms_alias" "seal" {
  name = "alias/${var.main_project_tag}-seal-key"
  target_key_id = aws_kms_key.seal.key_id
}

# --- dynamodb.tf ---------------------------------------------------------------------

# DynamoDB

resource "aws_dynamodb_table" "vault_storage" {
  name = var.dynamodb_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key = "Path"
  range_key = "Key"

  attribute {
    name = "Path"
    type = "S"
  }

  attribute {
    name = "Key"
    type = "S"
  }

  tags = {
    Name = var.dynamodb_table_name
    Project = var.main_project_tag
  }
}

# --- s3.tf ---------------------------------------------------------------------------

# S3

## S3 Bucket for Vault Data
resource "aws_s3_bucket" "vault_data" {
  bucket_prefix = "${var.main_project_tag}-"

  tags = merge({ "Project" = var.main_project_tag })
}

## S3 Server-side bucket encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "vault_data_sse" {
  bucket = aws_s3_bucket.vault_data.bucket

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "AES256"
    }
  }
}

## S3 Bucket Public Access Block
resource "aws_s3_bucket_public_access_block" "vault_data" {
  bucket = aws_s3_bucket.vault_data.id
  block_public_acls = true
  block_public_policy = true
  ignore_public_acls = true
  restrict_public_buckets = true
}

# --- iam-policies.tf -----------------------------------------------------------------

# IAM Policies

## KMS Policy
data "aws_iam_policy_document" "kms_vault_policy" {
  statement {
    sid = "EncryptDecryptAndDescribe"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:Encrypt",
      "kms:DescribeKey"
    ]
    resources = [
      aws_kms_key.seal.arn
    ]
  }
}

## DynamoDB Policy
data "aws_iam_policy_document" "dynamodb_vault_policy" {
  statement {
    sid = "ManageTable"
    effect = "Allow"
    actions = [
      "dynamodb:BatchGetItem",
      "dynamodb:BatchWriteItem",
      "dynamodb:PutItem",
      "dynamodb:DescribeTable",
      "dynamodb:DeleteItem",
      "dynamodb:GetItem",
      "dynamodb:ListTagsOfResource",
      "dynamodb:UpdateItem",
      "dynamodb:DescribeTimeToLive"
    ]
    resources = [
      aws_dynamodb_table.vault_storage.arn
    ]
  }

  statement {
    sid = "GetStreamRecords"
    effect = "Allow"
    actions = [
      "dynamodb:GetRecords"
    ]
    resources = [
      "${aws_dynamodb_table.vault_storage.arn}/stream/*"
    ]
  }

  statement {
    sid = "QueryAndScanTable"
    effect = "Allow"
    actions = [
      "dynamodb:Scan",
      "dynamodb:Query"
    ]
    resources = [
      "${aws_dynamodb_table.vault_storage.arn}/index/*",
      aws_dynamodb_table.vault_storage.arn
    ]
  }
}

## S3 Policy

data "aws_iam_policy_document" "s3_vault_policy" {
  statement {
    sid = "PutObjects"
    effect = "Allow"
    actions = [
      "s3:PutObject"
    ]
    resources = [
      "${aws_s3_bucket.vault_data.arn}/*"
    ]
  }
}

## AutoScalingGroup Instance Trust Policy
data "aws_iam_policy_document" "asg_trust_policy" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
    actions = [
      "sts:AssumeRole"
    ]
  }
}

# --- iam-roles.tf --------------------------------------------------------------------

# IAM Roles

## Role for Vault EC2 Instances via AutoScalingGroup

resource "aws_iam_role" "vault_instance" {
  name_prefix = "${var.main_project_tag}-instance-role-"
  assume_role_policy = data.aws_iam_policy_document.asg_trust_policy.json
}

## Policy Attachments

resource "aws_iam_role_policy" "vault_instance_kms_policy" {
  name_prefix = "${var.main_project_tag}-instance-kms-policy-"
  role = aws_iam_role.vault_instance.id
  policy = data.aws_iam_policy_document.kms_vault_policy.json
}

resource "aws_iam_role_policy" "vault_instance_dynamodb_policy" {
  name_prefix = "${var.main_project_tag}-instance-dynamodb-policy-"
  role = aws_iam_role.vault_instance.id
  policy = data.aws_iam_policy_document.dynamodb_vault_policy.json
}

resource "aws_iam_role_policy" "vault_instance_s3_policy" {
  name_prefix = "${var.main_project_tag}-instance-s3-policy-"
  role = aws_iam_role.vault_instance.id
  policy = data.aws_iam_policy_document.s3_vault_policy.json
}

## Instance Profile

resource "aws_iam_instance_profile" "vault_instance_profile" {
  name_prefix = "${var.main_project_tag}-instance-profile-"
  role = aws_iam_role.vault_instance.name
}

# --- vpc.tf --------------------------------------------------------------------------

# VPC
resource "aws_vpc" "vault" {
  cidr_block = var.vpc_cidr
  instance_tenancy = var.vpc_instance_tenancy
  enable_dns_support = true
  enable_dns_hostnames = true # required for VPC peering.
  assign_generated_ipv6_cidr_block = true

  tags = merge(
    { "Name" = "${var.main_project_tag}-vpc" },
    { "Project" = var.main_project_tag },
    var.vpc_tags
  )
}










# Gateways

## Internet Gateway
resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.vault.id

  tags = merge(
    { "Name" = "${var.main_project_tag}-igw"},
    { "Project" = var.main_project_tag },
    var.vpc_tags
  )
}

## Egress Only Gateway (IPv6)
resource "aws_egress_only_internet_gateway" "eigw" {
  vpc_id = aws_vpc.vault.id
}

## NAT Gateway

#### The NAT Elastic IP
resource "aws_eip" "nat" {
  count = var.operator_mode ? 1 : 0

  domain = "vpc" # Adaptación 7

  tags = merge(
    { "Name" = "${var.main_project_tag}-nat-eip"},
    { "Project" = var.main_project_tag },
    var.vpc_tags
  )

  depends_on = [aws_internet_gateway.igw]
}

#### The NAT Gateway
resource "aws_nat_gateway" "nat" {
  count = var.operator_mode ? 1 : 0

  allocation_id = aws_eip.nat[0].id // same as aws_eip.nat.0.id
  subnet_id = aws_subnet.public.0.id

  tags = merge(
    { "Name" = "${var.main_project_tag}-nat"},
    { "Project" = var.main_project_tag },
    var.vpc_tags
  )

  depends_on = [
    aws_internet_gateway.igw,
    aws_eip.nat
  ]
}










# Route Tables
// NOTE: Routing to the VPC's CIDR is allowed by default, so no route is needed

## Public Route Table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.vault.id
  tags = merge(
    { "Name" = "${var.main_project_tag}-public-rtb"},
    { "Project" = var.main_project_tag },
    var.vpc_tags
  )
}

#### Public routes
resource "aws_route" "public_internet_access" {
  route_table_id = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id = aws_internet_gateway.igw.id
}

## Private Route Table
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.vault.id
  tags = merge(
    { "Name" = "${var.main_project_tag}-private-rtb"},
    { "Project" = var.main_project_tag },
    var.vpc_tags
  )
}

#### Private Routes
resource "aws_route" "private_internet_access" {
  count = var.operator_mode ? 1 : 0

  route_table_id = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id = aws_nat_gateway.nat[0].id
}

resource "aws_route" "private_internet_access_ipv6" {
  count = var.operator_mode ? 1 : 0

  route_table_id = aws_route_table.private.id
  destination_ipv6_cidr_block = "::/0"
  egress_only_gateway_id = aws_egress_only_internet_gateway.eigw.id
}










# Subnets

## Public Subnets
resource "aws_subnet" "public" {
  count = var.vpc_public_subnet_count

  vpc_id = aws_vpc.vault.id
  cidr_block = cidrsubnet(aws_vpc.vault.cidr_block, 4, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  ipv6_cidr_block = cidrsubnet(aws_vpc.vault.ipv6_cidr_block, 8, count.index)
  assign_ipv6_address_on_creation = true

  tags = merge(
    { "Name" = "${var.main_project_tag}-public-${data.aws_availability_zones.available.names[count.index]}"},
    { "Project" = var.main_project_tag },
    var.vpc_tags
  )
}

## Private Subnets
resource "aws_subnet" "private" {
  count = var.vpc_private_subnet_count

  vpc_id = aws_vpc.vault.id

  // Increment the netnum by the number of public subnets to avoid overlap
  cidr_block = cidrsubnet(aws_vpc.vault.cidr_block, 4, count.index + var.vpc_public_subnet_count)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = merge(
    { "Name" = "${var.main_project_tag}-private-${data.aws_availability_zones.available.names[count.index]}"},
    { "Project" = var.main_project_tag },
    var.vpc_tags
  )
}









# Route Table Associations

## Public Subnet Route Associations
resource "aws_route_table_association" "public" {
  count = var.vpc_public_subnet_count

  subnet_id = element(aws_subnet.public.*.id, count.index)
  route_table_id = aws_route_table.public.id
}

## Private Subnet Route Associations
resource "aws_route_table_association" "private" {
  count = var.vpc_private_subnet_count

  subnet_id = element(aws_subnet.private.*.id, count.index)
  route_table_id = aws_route_table.private.id
}







# VPC Endpoints
// Make safe calls to KMS and DynamoDB without leaving the VPC.  Because #awsthings.  C'mon.  This should be default without these things.

## KMS Endpoint
data "aws_vpc_endpoint_service" "kms" {
  service = "kms"
}

#### To get the required data, if you're confused, just output the above KMS data source.  It has all the details.
resource "aws_vpc_endpoint" "kms" {
  service_name = data.aws_vpc_endpoint_service.kms.service_name
  vpc_id = aws_vpc.vault.id
  private_dns_enabled = true

  // Can also be done with "aws_vpc_endpoint_subnet_association"
  subnet_ids = aws_subnet.private.*.id
  security_group_ids = [aws_security_group.kms_endpoint.id]

  tags = merge(
    { "Name" = "${var.main_project_tag}-kms-endpoint"},
    { "Project" = var.main_project_tag },
    var.vpc_tags
  )

  vpc_endpoint_type = "Interface" // KMS is indeed an interface type
}

## DynamoDB Endpoint
data "aws_vpc_endpoint_service" "dynamodb" {
  service = "dynamodb"
}

resource "aws_vpc_endpoint" "dynamodb" {
  service_name = data.aws_vpc_endpoint_service.dynamodb.service_name
  vpc_id = aws_vpc.vault.id

  // Can also be done with "aws_vpc_endpoint_route_table_association"
  route_table_ids = [aws_route_table.private.id]
  
  tags = merge(
    { "Name" = "${var.main_project_tag}-dynamodb-endpoint"},
    { "Project" = var.main_project_tag },
    var.vpc_tags
  )

  vpc_endpoint_type = "Gateway"
}






# VPC Peering
## Enabled in Private Mode only.  Allows other VPCs in the same account and region to access your Vault VPC.

## Data from Peered VPC (AKA the external VPC we're letting in)
data "aws_vpc" "peered_vpc" {
  count = var.private_mode && length(var.peered_vpc_ids) > 0 ? length(var.peered_vpc_ids) : 0

  id = var.peered_vpc_ids[count.index]
}

## Peering Connections
resource "aws_vpc_peering_connection" "vault" {
  count = var.private_mode && length(var.peered_vpc_ids) > 0 ? length(var.peered_vpc_ids) : 0

  peer_vpc_id = var.peered_vpc_ids[count.index]
  vpc_id = aws_vpc.vault.id
  auto_accept = true

  accepter {
    allow_remote_vpc_dns_resolution = true
  }

  requester {
    allow_remote_vpc_dns_resolution = true
  }

  tags = merge(
    { "Name" = "${var.main_project_tag}-vpc-peering-connection-${count.index + 1}"},
    { "Project" = var.main_project_tag },
    var.vpc_tags
  )
}

## Peering Connection Routes for the VAULT Route Table
resource "aws_route" "requester_peering_route" {
  count = var.private_mode && length(var.peered_vpc_ids) > 0 ? length(var.peered_vpc_ids) : 0

  route_table_id = aws_route_table.public.id
  destination_cidr_block = data.aws_vpc.peered_vpc[count.index].cidr_block
  vpc_peering_connection_id = aws_vpc_peering_connection.vault[count.index].id
}

## Peering Connection Routes for the External VPC Route Tables to allow Vault Traffic
## Note: this associates it to the external VPC's MAIN ROUTE TABLE.
## If you want it associated to a different route table, you'll have to do so manually or set the table you want as the main route table.
resource "aws_route" "accepter_peering_route" {
  count = var.private_mode && length(var.peered_vpc_ids) > 0 ? length(var.peered_vpc_ids) : 0

  route_table_id = data.aws_vpc.peered_vpc[count.index].main_route_table_id
  destination_cidr_block = aws_vpc.vault.cidr_block
  vpc_peering_connection_id = aws_vpc_peering_connection.vault[count.index].id
}

# --- vpc-security-groups.tf ----------------------------------------------------------

# Security Groups (SG)

## Load Balancer SG
resource "aws_security_group" "load_balancer" {
  name_prefix = "${var.main_project_tag}-alb-sg"
  description = "Firewall for the application load balancer fronting the vault instances."
  vpc_id = aws_vpc.vault.id
  tags = merge(
    { "Name" = "${var.main_project_tag}-alb-sg" },
    { "Project" = var.main_project_tag }
  )
}

resource "aws_security_group_rule" "load_balancer_allow_80" {
  security_group_id = aws_security_group.load_balancer.id
  type = "ingress"
  protocol = "tcp"
  from_port = 80
  to_port = 80
  cidr_blocks = var.allowed_traffic_cidr_blocks
  ipv6_cidr_blocks = length(var.allowed_traffic_cidr_blocks_ipv6) > 0 ? var.allowed_traffic_cidr_blocks_ipv6 : null
  description = "Allow HTTP traffic."
}

resource "aws_security_group_rule" "load_balancer_allow_443" {
  security_group_id = aws_security_group.load_balancer.id
  type = "ingress"
  protocol = "tcp"
  from_port = 443
  to_port = 443
  cidr_blocks = var.allowed_traffic_cidr_blocks
  ipv6_cidr_blocks = length(var.allowed_traffic_cidr_blocks_ipv6) > 0 ? var.allowed_traffic_cidr_blocks_ipv6 : null
  description = "Allow HTTPS traffic."
}

## Only the Load Balancer is set up to work with IPv6.  Once a request
## comes in, it all goes through IPv4 internally.
resource "aws_security_group_rule" "load_balancer_allow_outbound" {
  security_group_id = aws_security_group.load_balancer.id
  type = "egress"
  protocol    = "-1"
  from_port   = 0
  to_port     = 0
  cidr_blocks = ["0.0.0.0/0"]
  ipv6_cidr_blocks = length(var.allowed_traffic_cidr_blocks_ipv6) > 0 ? ["::/0"] : null
  description = "Allow any outbound traffic."
}


## Vault Instance SG

resource "aws_security_group" "vault_instance" {
  name_prefix = "${var.main_project_tag}-vault-instance-sg"
  description = "Firewall for the vault instances."
  vpc_id = aws_vpc.vault.id
  tags = merge(
    { "Name" = "${var.main_project_tag}-vault-instance-sg" },
    { "Project" = var.main_project_tag }
  )
}

resource "aws_security_group_rule" "vault_instance_allow_8200" {
  security_group_id = aws_security_group.vault_instance.id
  type = "ingress"
  protocol = "tcp"
  from_port = 8200
  to_port = 8200
  source_security_group_id = aws_security_group.load_balancer.id
  description = "Allow traffic from Load Balancer."
}

resource "aws_security_group_rule" "vault_instance_allow_8201" {
  security_group_id = aws_security_group.vault_instance.id
  type = "ingress"
  protocol = "tcp"
  from_port = 8201
  to_port = 8201
  self = true
  description = "Allow traffic from fellow vault instances that have this SG."
}

resource "aws_security_group_rule" "vault_instance_allow_22_bastion" {
  security_group_id = aws_security_group.vault_instance.id
  type = "ingress"
  protocol = "tcp"
  from_port = 22
  to_port = 22
  source_security_group_id = aws_security_group.bastion.id
  description = "Allow SSH traffic from vault bastion."
}

resource "aws_security_group_rule" "vault_instance_allow_outbound" {
  security_group_id = aws_security_group.vault_instance.id
  type = "egress"
  protocol    = "-1"
  from_port   = 0
  to_port     = 0
  cidr_blocks = ["0.0.0.0/0"]
  description = "Allow any outbound traffic."
}

## Bastion SG

resource "aws_security_group" "bastion" {
  name_prefix = "${var.main_project_tag}-bastion-sg"
  description = "Firewall for the operator bastion instance"
  vpc_id = aws_vpc.vault.id
  tags = merge(
    { "Name" = "${var.main_project_tag}-bastion-sg" },
    { "Project" = var.main_project_tag }
  )
}

resource "aws_security_group_rule" "bastion_allow_22" {
  security_group_id = aws_security_group.bastion.id
  type = "ingress"
  protocol = "tcp"
  from_port = 22
  to_port = 22
  cidr_blocks = var.allowed_bastion_cidr_blocks
  ipv6_cidr_blocks = length(var.allowed_bastion_cidr_blocks_ipv6) > 0 ? var.allowed_bastion_cidr_blocks_ipv6 : null
  description = "Allow SSH traffic."
}

resource "aws_security_group_rule" "bastion_allow_outbound" {
  security_group_id = aws_security_group.bastion.id
  type = "egress"
  protocol    = "-1"
  from_port   = 0
  to_port     = 0
  cidr_blocks = ["0.0.0.0/0"]
  ipv6_cidr_blocks = length(var.allowed_bastion_cidr_blocks_ipv6) > 0 ? ["::/0"] : null
  description = "Allow any outbound traffic."
}

## KMS Endpoint SG

resource "aws_security_group" "kms_endpoint" {
  name_prefix = "${var.main_project_tag}-kms-endpoint-sg"
  description = "Firewall for the KMS Endpoint."
  vpc_id = aws_vpc.vault.id
  tags = merge(
    { "Name" = "${var.main_project_tag}-kms-endpoint-sg" },
    { "Project" = var.main_project_tag }
  )
}

resource "aws_security_group_rule" "vault_instance_allow_80" {
  security_group_id = aws_security_group.kms_endpoint.id
  type = "ingress"
  protocol = "tcp"
  from_port = 80
  to_port = 80
  source_security_group_id = aws_security_group.vault_instance.id
  description = "Allow HTTP traffic from vault instances."
}

resource "aws_security_group_rule" "vault_instance_allow_443" {
  security_group_id = aws_security_group.kms_endpoint.id
  type = "ingress"
  protocol = "tcp"
  from_port = 443
  to_port = 443
  source_security_group_id = aws_security_group.vault_instance.id
  description = "Allow HTTPS traffic from vault instances."
}

resource "aws_security_group_rule" "kms_allow_outbound" {
  security_group_id = aws_security_group.kms_endpoint.id
  type = "egress"
  protocol    = "-1"
  from_port   = 0
  to_port     = 0
  cidr_blocks = ["0.0.0.0/0"]
  description = "Allow any outbound traffic."
}

# --- ec2-data.tf ---------------------------------------------------------------------

# EC2 Data
# Adaptación 3: sin data "aws_ssm_parameter"; se usa la AMI fija del original.

# --- ec2-launch-template.tf ----------------------------------------------------------

# EC2 Launch Template
resource "aws_launch_template" "vault_instance" {
  name_prefix = "${var.main_project_tag}-lt-"
  image_id = "ami-0323c3dd2da7fb37d"
  instance_type = var.vault_instance_type
  key_name = aws_key_pair.vault.key_name
  vpc_security_group_ids = [aws_security_group.vault_instance.id]

  iam_instance_profile {
    arn = aws_iam_instance_profile.vault_instance_profile.arn
  }

  tag_specifications {
    resource_type = "instance"

    tags = merge(
      { "Name" = "${var.main_project_tag}-instance" },
      { "Project" = var.main_project_tag }
    )
  }

  tag_specifications {
    resource_type = "volume"
    
    tags = merge(
      { "Name" = "${var.main_project_tag}-volume" },
      { "Project" = var.main_project_tag }
    )
  }

  tags = merge(
    { "Name" = "${var.main_project_tag}-lt" },
    { "Project" = var.main_project_tag }
  )

  user_data = base64encode(templatefile("${path.module}/files/userdata_template.sh", {
    VAULT_VERSION = var.vault_version
    VAULT_CLUSTER_NAME = var.main_project_tag
    VAULT_DNS = var.domain_name
    VAULT_KMS_KEY_ID = aws_kms_key.seal.key_id
    VAULT_CLUSTER_REGION = data.aws_region.current.region
    VAULT_DYNAMODB_TABLE = var.dynamodb_table_name # dynamodb resource doesn't return name....
    VAULT_S3_BUCKET_NAME = aws_s3_bucket.vault_data.id
  }))
}

# --- ec2-auto-scaling-group.tf -------------------------------------------------------

# EC2 Auto Scaling Group

resource "aws_autoscaling_group" "vault-asg" {
  name_prefix = "${var.main_project_tag}-asg-"

  launch_template {
    id = aws_launch_template.vault_instance.id
    version = aws_launch_template.vault_instance.latest_version
  }

  target_group_arns = [aws_lb_target_group.alb_targets.arn]

  # All the same to keep at a fixed size
  desired_capacity = var.vault_instance_count
  min_size = var.vault_instance_count
  max_size = var.vault_instance_count

  # AKA the subnets to launch resources in 
  vpc_zone_identifier = aws_subnet.private.*.id

  health_check_grace_period = 300
  health_check_type = "EC2"
  termination_policies = ["OldestLaunchTemplate"]
  wait_for_capacity_timeout = 0

  enabled_metrics = [
    "GroupDesiredCapacity",
    "GroupInServiceCapacity",
    "GroupPendingCapacity",
    "GroupMinSize",
    "GroupMaxSize",
    "GroupInServiceInstances",
    "GroupPendingInstances",
    "GroupStandbyInstances",
    "GroupStandbyCapacity",
    "GroupTerminatingCapacity",
    "GroupTerminatingInstances",
    "GroupTotalCapacity",
    "GroupTotalInstances"
  ]

  # Adaptación 7: la lista "tags" se eliminó en la versión 5 del proveedor; mismos valores en bloques "tag".
  tag {
    key = "Name"
    value = "${var.main_project_tag}-instance"
    propagate_at_launch = true
  }

  tag {
    key = "Project"
    value = var.main_project_tag
    propagate_at_launch = true
  }
}

# --- ec2-load-balancer.tf ------------------------------------------------------------

# Load Balancer
# 
# HTTPS is terminated at the load balancer.  The load balancer will then communicate
# with the targets over HTTP.  The Targets (vault instances) are in a private
# subnet, cut off from any external access.  This means that they're still perfectly
# secure AND we don't incur the overhead of extra TLS handshakes and encryption.

## Application Load Balancer
resource "aws_lb" "alb" {
  // Can't give it a full name_prefix due to 32 character limit on LBs
  // and the fact that Terraform adds a 26 character random bit to the end.
  // https://github.com/terraform-providers/terraform-provider-aws/issues/1666
  name_prefix = "vault-"
  internal = var.private_mode
  load_balancer_type = "application"
  security_groups = [aws_security_group.load_balancer.id]
  subnets = aws_subnet.public.*.id
  idle_timeout = 60
  ip_address_type = var.private_mode ? "ipv4" : "dualstack"

  tags = merge(
    { "Name" = "${var.main_project_tag}-alb"},
    { "Project" = var.main_project_tag }
  )
}

## Target Group
resource "aws_lb_target_group" "alb_targets" {
  name_prefix = "vault-"
  port = 8200
  protocol = "HTTPS"
  vpc_id = aws_vpc.vault.id
  deregistration_delay = 30
  target_type = "instance"

  health_check {
    enabled = true
    interval = 10
    path = "/v1/sys/health" // the Vault API health port
    protocol = "HTTPS"
    timeout = 5
    healthy_threshold = 3
    unhealthy_threshold = 3
    matcher = "200"
  }

  tags = merge(
    { "Name" = "${var.main_project_tag}-tg"},
    { "Project" = var.main_project_tag }
  )
}

## Load Balancer Listeners

### Redirect to HTTPS
resource "aws_lb_listener" "alb_http_redirect" {
  load_balancer_arn = aws_lb.alb.arn
  port = 80
  protocol = "HTTP"

  default_action {
    type = "redirect"

    // For information on the below reserved keywords
    // https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-listeners.html#rule-action-types
    redirect {
      host = "#{host}"
      path = "/#{path}"
      port = 443
      protocol = "HTTPS"
      query = "#{query}"
      status_code = "HTTP_301"
    }
  }
}

### HTTPS
resource "aws_lb_listener" "alb_https" {
  load_balancer_arn = aws_lb.alb.arn
  port = 443
  protocol = "HTTPS"
  ssl_policy = "ELBSecurityPolicy-FS-2018-06" // Enable Forward Secrecy
  certificate_arn = aws_acm_certificate.vault_alb_cert.arn

  default_action {
    type = "forward"
    target_group_arn = aws_lb_target_group.alb_targets.arn
  }
}

# --- ec2-bastion.tf ------------------------------------------------------------------

# Bastion Server
# Only active if operator mode is turned on.  Use this to SSH into 

resource "aws_instance" "bastion" {
  count = var.operator_mode ? 1 : 0

  ami = "ami-0323c3dd2da7fb37d"
  instance_type = "t2.micro"
  key_name = aws_key_pair.vault.key_name
  vpc_security_group_ids = [aws_security_group.bastion.id]
  subnet_id = aws_subnet.public[0].id
  associate_public_ip_address = true

  tags = merge(
    { "Name" = "${var.main_project_tag}-bastion"},
    { "Project" = var.main_project_tag }
  )
}

# --- outputs.tf ----------------------------------------------------------------------

# Adaptación 5: sin los local_file que escribían archivos en la PC.

output "load_balancer_dns" {
  value = aws_lb.alb.dns_name
}

# VPC Values

output "vpc_id" {
  value = aws_vpc.vault.id
}

output "vpc_ipv4_cidr" {
  value = aws_vpc.vault.cidr_block
}

output "vpc_ipv6_cidr" {
  value = aws_vpc.vault.ipv6_cidr_block
}
