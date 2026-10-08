data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Execution role: what ECS itself uses to pull the image from ECR and write
# logs — not the app's own permissions.
resource "aws_iam_role" "ecs_execution" {
  name               = "${local.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# The execution role also needs to be able to read the Secrets Manager
# secret to resolve `secrets` entries in the task definition at container
# start — that's separate from the managed ECR/logs policy above.
resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "${local.name}-read-backend-secret"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.backend_env.arn
      }
    ]
  })
}

# Task role: what the app itself can do via the AWS SDK from inside the
# container. Currently empty beyond the assume-role trust — the app talks
# to S3 with the explicit IAM user credentials in secrets.tf rather than
# the task role. Attach S3/SES/etc policies here if/when that changes.
resource "aws_iam_role" "backend_task" {
  name               = "${local.name}-backend-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role" "frontend_task" {
  name               = "${local.name}-frontend-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

# --- coturn EC2 instance role -----------------------------------------------

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "coturn" {
  name               = "${local.name}-coturn"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

# SSM Session Manager access instead of SSH by default — works even when
# ssh_key_name/ssh_allowed_cidr are left unset.
resource "aws_iam_role_policy_attachment" "coturn_ssm" {
  role       = aws_iam_role.coturn.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "coturn_read_secret" {
  name = "${local.name}-coturn-read-secret"
  role = aws_iam_role.coturn.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.backend_env.arn
      }
    ]
  })
}

resource "aws_iam_instance_profile" "coturn" {
  name = "${local.name}-coturn"
  role = aws_iam_role.coturn.name
}
