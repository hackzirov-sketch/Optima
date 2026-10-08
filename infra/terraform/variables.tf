variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "eu-north-1"
}

variable "environment" {
  description = "Deployment environment name (e.g. production, staging). Used in resource names/tags."
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Short name used as a prefix for resource names."
  type        = string
  default     = "upz"
}

# ---------------------------------------------------------------------------
# Networking
# ---------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "azs" {
  description = "Availability zones to spread subnets across. Two is enough for RDS/ElastiCache Multi-AZ and an ALB; add a third if you want three-AZ ECS spread."
  type        = list(string)
  default     = ["eu-north-1a", "eu-north-1b"]
}

# ---------------------------------------------------------------------------
# Domain / TLS — optional. Leave domain_name empty to get an HTTP-only ALB
# DNS name with no Route53/ACM resources created at all (fine for a first
# deploy or a staging environment); set it once you have a hosted zone to
# get HTTPS end-to-end.
# ---------------------------------------------------------------------------

variable "domain_name" {
  description = "Root domain for the app (e.g. \"upz.example.com\"). Leave empty to skip Route53/ACM and expose the ALB over plain HTTP on its own DNS name."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Existing Route53 hosted zone ID for domain_name. Required if domain_name is set."
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

variable "db_name" {
  type    = string
  default = "optima"
}

variable "db_username" {
  type    = string
  default = "optima"
}

variable "db_instance_class" {
  description = "RDS instance size. db.t4g.micro is enough for dev/staging; go to db.t4g.medium+ for real production load."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage_gb" {
  type    = number
  default = 20
}

variable "db_multi_az" {
  description = "Enable Multi-AZ failover for RDS. Roughly doubles the RDS bill — leave false until you actually need the uptime guarantee."
  type        = bool
  default     = false
}

variable "db_backup_retention_days" {
  type    = number
  default = 7
}

variable "db_deletion_protection" {
  type    = bool
  default = true
}

# ---------------------------------------------------------------------------
# Redis (ElastiCache)
# ---------------------------------------------------------------------------

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}

# ---------------------------------------------------------------------------
# ECS / app containers
# ---------------------------------------------------------------------------

variable "backend_image_tag" {
  description = "Tag to deploy for the backend image (pushed to the backend ECR repo). CI should set this per-deploy; terraform does not build images."
  type        = string
  default     = "latest"
}

variable "frontend_image_tag" {
  type    = string
  default = "latest"
}

variable "backend_cpu" {
  description = "Fargate task CPU units (256 = .25 vCPU)."
  type        = number
  default     = 512
}

variable "backend_memory" {
  description = "Fargate task memory, MiB."
  type        = number
  default     = 1024
}

variable "backend_desired_count" {
  type    = number
  default = 2
}

variable "frontend_cpu" {
  type    = number
  default = 256
}

variable "frontend_memory" {
  type    = number
  default = 512
}

variable "frontend_desired_count" {
  type    = number
  default = 2
}

# ---------------------------------------------------------------------------
# coturn (TURN relay for meetings) — runs on a small EC2 instance with an
# Elastic IP because Fargate's awsvpc networking doesn't give coturn a
# stable public IP to advertise as relay/srflx candidates, and mapping its
# ~40-port UDP relay range through an ALB/NLB is impractical. See
# backend/docker/coturn/entrypoint.sh for the auth-mode logic this instance
# runs unmodified via user_data.
# ---------------------------------------------------------------------------

variable "coturn_instance_type" {
  type    = string
  default = "t3.micro"
}

variable "coturn_min_port" {
  type    = number
  default = 49160
}

variable "coturn_max_port" {
  type    = number
  default = 49200
}

variable "ssh_key_name" {
  description = "Existing EC2 key pair name for SSH access to the coturn box. Leave empty to disable SSH access entirely (use SSM Session Manager instead, which the instance role already allows)."
  type        = string
  default     = ""
}

variable "ssh_allowed_cidr" {
  description = "CIDR allowed to SSH into the coturn instance, if ssh_key_name is set. Narrow this to your office/VPN range — 0.0.0.0/0 is not a safe default for an SSH port."
  type        = string
  default     = "0.0.0.0/0"
}

# ---------------------------------------------------------------------------
# Application secrets — real values are never written to .tf files or state
# in plaintext form here; they're supplied via -var-file or environment
# (TF_VAR_*) at apply time and land directly in Secrets Manager. See
# terraform.tfvars.example.
# ---------------------------------------------------------------------------

variable "app_secrets" {
  description = <<-EOT
    Map of every secret/credential the backend container needs, matching
    the keys in backend/.env.example (JWT secrets, SMTP creds, OAuth
    secrets, encryption keys, etc). Populate this from a -var-file that is
    NEVER committed (see terraform.tfvars.example) or from a CI secret
    store — not from a checked-in tfvars file.
  EOT
  type        = map(string)
  sensitive   = true
}
