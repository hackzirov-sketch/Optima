locals {
  name = "${var.project_name}-${var.environment}"
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = local.name }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = local.name }
}

# One /20 public + one /20 private subnet per AZ. Public subnets hold the
# ALB and the coturn EC2 instance (needs a real public IP for TURN relay
# candidates); private subnets hold ECS tasks, RDS, and ElastiCache — none
# of which need to be internet-reachable directly.
resource "aws_subnet" "public" {
  for_each = { for idx, az in var.azs : az => idx }

  vpc_id                  = aws_vpc.main.id
  availability_zone       = each.key
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, each.value)
  map_public_ip_on_launch = true

  tags = { Name = "${local.name}-public-${each.key}" }
}

resource "aws_subnet" "private" {
  for_each = { for idx, az in var.azs : az => idx }

  vpc_id            = aws_vpc.main.id
  availability_zone = each.key
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, each.value + 8)

  tags = { Name = "${local.name}-private-${each.key}" }
}

resource "aws_eip" "nat" {
  for_each = aws_subnet.public
  domain   = "vpc"
  tags     = { Name = "${local.name}-nat-${each.key}" }
}

# One NAT gateway per AZ (not a single shared one) so an AZ outage doesn't
# take down egress for tasks in the other AZ too. Doubles the NAT bill
# versus a single shared gateway — for a lower-traffic environment, collapse
# this to one aws_nat_gateway and point every private route table at it.
resource "aws_nat_gateway" "main" {
  for_each = aws_subnet.public

  allocation_id = aws_eip.nat[each.key].id
  subnet_id     = each.value.id
  tags          = { Name = "${local.name}-nat-${each.key}" }

  depends_on = [aws_internet_gateway.main]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name}-public" }

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}

resource "aws_route_table_association" "public" {
  for_each       = aws_subnet.public
  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  for_each = aws_subnet.private

  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name}-private-${each.key}" }

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[each.key].id
  }
}

resource "aws_route_table_association" "private" {
  for_each       = aws_subnet.private
  subnet_id      = each.value.id
  route_table_id = aws_route_table.private[each.key].id
}
