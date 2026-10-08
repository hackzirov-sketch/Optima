# Everything the backend container needs at runtime lives in one Secrets
# Manager secret as a JSON blob, injected into the ECS task via `secrets`
# (not plain `environment`) — see ecs_backend.tf. This keeps real values
# out of the task definition (visible to anyone with ecs:DescribeTask*) and
# out of terraform plan output for the parts that come from var.app_secrets.
resource "aws_secretsmanager_secret" "backend_env" {
  name                    = "${local.name}/backend-env"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "backend_env" {
  secret_id = aws_secretsmanager_secret.backend_env.id

  # merge() with var.app_secrets last so a value the caller supplies always
  # wins over the terraform-generated defaults below it — lets you override
  # DATABASE_URL/REDIS_URL for e.g. a temporary external DB without editing
  # this file.
  secret_string = jsonencode(merge(
    {
      DATABASE_URL = local.database_url
      REDIS_URL    = local.redis_url

      S3_ACCESS_KEY_ID     = aws_iam_access_key.uploads.id
      S3_SECRET_ACCESS_KEY = aws_iam_access_key.uploads.secret
      S3_BUCKET            = aws_s3_bucket.uploads.bucket
      S3_REGION            = var.aws_region
      S3_PUBLIC_URL        = "https://${aws_s3_bucket.uploads.bucket}.s3.${var.aws_region}.amazonaws.com"

      TURN_URLS        = "turn:${aws_eip.coturn.public_ip}:3478"
      TURN_EXTERNAL_IP = aws_eip.coturn.public_ip
    },
    var.app_secrets,
  ))
}
