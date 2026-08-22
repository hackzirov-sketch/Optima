# UPZ — AWS Terraform

Provisions everything the app needs on AWS:

- VPC (2 AZ, public + private subnets, one NAT gateway per AZ)
- ECS Fargate: `backend` (NestJS) + `frontend` (nginx static build), behind one ALB
  (`/api/*` and `/socket.io/*` → backend, everything else → frontend)
- RDS PostgreSQL 16, ElastiCache Redis 7 (TLS), both private-subnet only
- EC2 instance running **coturn** (TURN relay for meetings) with an Elastic IP —
  not on Fargate, because coturn needs a stable public IP for relay candidates
  and its ~40-port UDP range doesn't map cleanly through an ALB/NLB
- S3 bucket for chat file uploads (replaces the app's local disk storage)
- Secrets Manager holding every env var the backend needs, injected into the
  ECS task definition — nothing sensitive sits in the task definition itself
  or in this repo
- ECR repos for both images
- Optional Route53 + ACM (HTTPS) if you set `domain_name` / `route53_zone_id`;
  otherwise you get a working HTTP deployment on the ALB's own DNS name

## What this does NOT do

- **Build or push Docker images.** `terraform apply` deploys whatever tag is
  already in ECR (`backend_image_tag`/`frontend_image_tag`, default
  `latest`). Build+push from CI (see below), then `terraform apply` (or just
  `aws ecs update-service --force-new-deployment` if only the tag changed).
- **Run database migrations.** The app runs its own migrations from
  `backend/src/database/migrations` on container boot (see
  `migration.runner.ts`) — nothing extra needed here.
- **Rotate the secrets you already exposed.** If you're deploying this after
  pasting real `.env` values into a chat/ticket/log at any point, generate
  fresh values for `terraform.tfvars` — don't reuse the old ones.

## First deploy

```bash
cd infra/terraform

# One-time: create the state bucket + lock table (see the comment block in
# providers.tf for the exact commands), then:
terraform init

cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: fill in app_secrets with freshly generated values

# Build + push both images once so the ECS services have something to pull
aws ecr get-login-password --region eu-north-1 | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.eu-north-1.amazonaws.com

docker build -t <account-id>.dkr.ecr.eu-north-1.amazonaws.com/upz-production-backend:latest ../../backend
docker push <account-id>.dkr.ecr.eu-north-1.amazonaws.com/upz-production-backend:latest

docker build -t <account-id>.dkr.ecr.eu-north-1.amazonaws.com/upz-production-frontend:latest ../../frontend
docker push <account-id>.dkr.ecr.eu-north-1.amazonaws.com/upz-production-frontend:latest

terraform plan
terraform apply
```

`terraform output app_url` gives you the URL once it's up.

## Ongoing deploys

Build + push a new image tag, then either:

```bash
terraform apply -var backend_image_tag=$GIT_SHA
```

or, if you don't want to run terraform for a routine deploy, point the ECS
service at the new tag directly and force a rollout — same effect, no state
lock needed for a routine image bump.

## Adding a domain later

Set `domain_name` and `route53_zone_id` in `terraform.tfvars` and re-apply.
This provisions an ACM cert (DNS-validated via the records terraform creates
in your zone), an HTTPS listener, and an HTTP→HTTPS redirect — no manual
console steps.

## Known follow-ups worth doing before real production traffic

- **S3 credentials**: the backend currently authenticates to S3 with a
  static IAM user access key (stored in Secrets Manager) because
  `storage.service.ts` constructs its `S3Client` with explicit
  `credentials`. Switching that to the default AWS SDK credential chain and
  attaching an S3 policy to `aws_iam_role.backend_task` instead removes a
  long-lived key from the picture entirely — no app changes needed here
  beyond that one file.
- **`db_multi_az`** defaults to `false` to keep cost down; flip it once RDS
  uptime actually matters.
- **NAT gateways**: one per AZ (~2x the cost of a single shared one) so an
  AZ outage doesn't take out egress everywhere. Collapse to one if that
  tradeoff isn't worth it for your traffic.
- **`ssh_key_name`** is empty by default — the coturn instance is reachable
  via SSM Session Manager only, which is intentional. Set it if you actually
  need direct SSH.
