resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name}-redis"
  subnet_ids = [for s in aws_subnet.private : s.id]
}

resource "random_password" "redis" {
  length  = 32
  special = false # Redis AUTH tokens can't contain most special chars anyway.
}

# A single replication group with one primary + no read replica. Good
# enough for the app's usage today (OTP/rate-limit state, BullMQ queues,
# Socket.IO adapter, cache). Bump num_cache_clusters and enable
# automatic_failover_enabled if Redis availability becomes a hard
# requirement.
resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${local.name}-redis"
  description          = "UPZ redis — OTP/rate-limit state, BullMQ, Socket.IO adapter, cache"

  engine         = "redis"
  engine_version = "7.1"
  node_type      = var.redis_node_type
  port           = 6379

  num_cache_clusters = 1

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis.result

  auto_minor_version_upgrade = true

  tags = { Name = "${local.name}-redis" }
}

locals {
  # rediss:// (TLS) since transit_encryption_enabled is on above — matches
  # what ioredis/BullMQ expect when talking to a TLS-only ElastiCache
  # endpoint. The app's REDIS_URL parsing already handles a URL-embedded
  # password the same way it does for the local docker-compose Redis.
  redis_url = "rediss://:${random_password.redis.result}@${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"
}
