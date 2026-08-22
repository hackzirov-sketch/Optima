locals {
  backend_image  = "${aws_ecr_repository.backend.repository_url}:${var.backend_image_tag}"
  frontend_image = "${aws_ecr_repository.frontend.repository_url}:${var.frontend_image_tag}"

  # Every key in the Secrets Manager JSON blob becomes an individual env var
  # in the container — ECS resolves `secrets[].valueFrom` with a `key::`
  # suffix against the same ARN for each one, so nothing has to be listed
  # twice here vs. in secrets.tf.
  backend_secret_keys = concat(
    [
      "DATABASE_URL", "REDIS_URL",
      "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET", "S3_REGION", "S3_PUBLIC_URL",
      "TURN_URLS", "TURN_EXTERNAL_IP",
    ],
    keys(var.app_secrets),
  )
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.name}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.backend_cpu
  memory                   = var.backend_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.backend_task.arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = local.backend_image
      essential = true

      portMappings = [{ containerPort = 8080, protocol = "tcp" }]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "8080" },
        { name = "API_PREFIX", value = "api/v1" },
        { name = "FRONTEND_URL", value = local.has_domain ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}" },
      ]

      secrets = [
        for k in local.backend_secret_keys : {
          name      = k
          valueFrom = "${aws_secretsmanager_secret.backend_env.arn}:${k}::"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.backend.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "backend"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget -qO- http://localhost:8080/api/v1/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
    }
  ])
}

resource "aws_ecs_service" "backend" {
  name            = "${local.name}-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.backend_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = [for s in aws_subnet.private : s.id]
    security_groups = [aws_security_group.backend_tasks.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 8080
  }

  # Let a rolling deploy briefly overshoot desired_count rather than dip
  # below it — avoids dropping capacity mid-deploy for a chatty realtime API.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  enable_execute_command = true # `aws ecs execute-command` for prod debugging without SSH

  depends_on = [aws_lb_listener.http]
}
