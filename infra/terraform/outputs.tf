output "alb_dns_name" {
  description = "ALB DNS name. Point your domain's A record here if not using the built-in Route53 alias (domain_name/route53_zone_id)."
  value       = aws_lb.main.dns_name
}

output "app_url" {
  value = local.has_domain ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}"
}

output "coturn_public_ip" {
  description = "Elastic IP of the coturn instance — this is what TURN_EXTERNAL_IP/TURN_URLS point at."
  value       = aws_eip.coturn.public_ip
}

output "ecr_backend_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "ecr_frontend_repository_url" {
  value = aws_ecr_repository.frontend.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "rds_endpoint" {
  value = aws_db_instance.main.address
}

output "redis_primary_endpoint" {
  value = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "uploads_bucket" {
  value = aws_s3_bucket.uploads.bucket
}

output "backend_secret_arn" {
  description = "Secrets Manager ARN holding every backend env var — useful for `aws secretsmanager get-secret-value` when debugging."
  value       = aws_secretsmanager_secret.backend_env.arn
}
