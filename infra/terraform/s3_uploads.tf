resource "aws_s3_bucket" "uploads" {
  bucket = "${local.name}-uploads-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Matches docker/s3-cors.json in the repo — browsers upload directly to S3
# via presigned URLs (see StorageService), so the bucket itself must answer
# the preflight, not the API.
resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_methods = ["GET", "PUT", "POST", "HEAD"]
    allowed_origins = var.domain_name != "" ? ["https://${var.domain_name}"] : ["*"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    id     = "expire-push-artifacts"
    status = "Enabled"

    # Matches PUSH_ARTIFACT_TTL_DAYS in backend/.env — keep the bucket-side
    # lifecycle rule in sync if that env var ever changes.
    filter { prefix = "push-artifacts/" }
    expiration { days = 7 }
  }

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload { days_after_initiation = 3 }
  }
}

# IAM user + access key for the backend to use with S3_ACCESS_KEY_ID/
# S3_SECRET_ACCESS_KEY, matching how storage.service.ts constructs its
# S3Client today (explicit credentials, not the default provider chain).
#
# Better long-term: drop the explicit `credentials` block in
# storage.service.ts and instead grant this same policy to the ECS task
# role (task_role.tf) — the AWS SDK then picks up credentials automatically
# via the container's task role with no static keys to rotate at all. This
# access-key path exists so the app works unmodified today.
resource "aws_iam_user" "uploads" {
  name = "${local.name}-s3-uploads"
}

resource "aws_iam_access_key" "uploads" {
  user = aws_iam_user.uploads.name
}

resource "aws_iam_user_policy" "uploads" {
  name = "${local.name}-s3-uploads"
  user = aws_iam_user.uploads.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.uploads.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.uploads.arn
      }
    ]
  })
}
