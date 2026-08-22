resource "aws_ecs_task_definition" "frontend" {
  family                   = "${local.name}-frontend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.frontend_cpu
  memory                   = var.frontend_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.frontend_task.arn

  container_definitions = jsonencode([
    {
      name      = "frontend"
      image     = local.frontend_image
      essential = true

      portMappings = [{ containerPort = 80, protocol = "tcp" }]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.frontend.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "frontend"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget -qO- http://localhost:80/ || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 15
      }
    }
  ])
}

resource "aws_ecs_service" "frontend" {
  name            = "${local.name}-frontend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = var.frontend_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = [for s in aws_subnet.private : s.id]
    security_groups = [aws_security_group.frontend_tasks.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = 80
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  depends_on = [aws_lb_listener.http]
}
