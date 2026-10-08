resource "aws_db_subnet_group" "main" {
  name       = "${local.name}-db"
  subnet_ids = [for s in aws_subnet.private : s.id]
  tags       = { Name = "${local.name}-db" }
}

resource "random_password" "db" {
  length  = 32
  special = false # DATABASE_URL is a connection-string; keep the password
  # in the "safe for an unescaped URL" character set.
}

resource "aws_db_instance" "main" {
  identifier     = "${local.name}-postgres"
  engine         = "postgres"
  engine_version = "16.4"

  instance_class        = var.db_instance_class
  allocated_storage     = var.db_allocated_storage_gb
  max_allocated_storage = var.db_allocated_storage_gb * 5 # allow autoscaling up to 5x before you have to intervene
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  multi_az                = var.db_multi_az
  backup_retention_period = var.db_backup_retention_days
  backup_window           = "03:00-04:00"
  maintenance_window      = "mon:04:30-mon:05:30"

  deletion_protection       = var.db_deletion_protection
  skip_final_snapshot       = !var.db_deletion_protection
  final_snapshot_identifier = var.db_deletion_protection ? "${local.name}-postgres-final" : null

  performance_insights_enabled = true

  tags = { Name = "${local.name}-postgres" }
}

# DATABASE_URL as the app expects it — psql-URL-encode the password since it
# came out of random_password unescaped (still safe here since special=false
# above excludes URL-reserved characters).
locals {
  database_url = "postgresql://${var.db_username}:${random_password.db.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${var.db_name}"
}
