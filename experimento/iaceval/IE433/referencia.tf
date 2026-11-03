# Define the provider block for AWS


resource "aws_vpc" "_" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  tags = merge({
    "Name" = "vpc"
  })
}

resource "aws_internet_gateway" "_" {
  vpc_id = aws_vpc._.id
  tags = merge({
    "Name" = "ig"
  })
}
