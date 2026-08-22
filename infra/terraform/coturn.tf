data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_eip" "coturn" {
  domain = "vpc"
  tags   = { Name = "${local.name}-coturn" }
}

# Runs the same coturn/coturn:4.6-alpine image and entrypoint.sh logic as
# docker-compose, via `docker run --network host` (the EC2 equivalent of
# compose's network_mode: host — same reasoning: coturn needs to see and
# advertise the box's real address for relay/srflx candidates, and the
# ~40-port UDP relay range is impractical to map through anything else).
# The auth secret comes from Secrets Manager at boot rather than being
# baked into the AMI/user_data in plaintext.
locals {
  coturn_user_data = <<-EOT
    #!/bin/bash
    set -euxo pipefail

    dnf install -y docker python3
    systemctl enable --now docker

    SECRET_JSON=$(aws secretsmanager get-secret-value \
      --region ${var.aws_region} \
      --secret-id ${aws_secretsmanager_secret.backend_env.name} \
      --query SecretString --output text)

    TURN_SECRET=$(echo "$SECRET_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("TURN_SECRET",""))')

    echo "${filebase64("${path.module}/../../backend/docker/coturn/entrypoint.sh")}" | base64 -d > /opt/coturn-entrypoint.sh
    chmod +x /opt/coturn-entrypoint.sh

    docker run -d \
      --name coturn \
      --restart unless-stopped \
      --network host \
      -e TURN_REALM="${var.domain_name != "" ? var.domain_name : "upz.local"}" \
      -e TURN_SECRET="$TURN_SECRET" \
      -e TURN_MIN_PORT="${var.coturn_min_port}" \
      -e TURN_MAX_PORT="${var.coturn_max_port}" \
      -e TURN_EXTERNAL_IP="${aws_eip.coturn.public_ip}" \
      -v /opt/coturn-entrypoint.sh:/entrypoint.sh:ro \
      --entrypoint /entrypoint.sh \
      coturn/coturn:4.6-alpine
  EOT
}

resource "aws_instance" "coturn" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.coturn_instance_type
  subnet_id              = [for s in aws_subnet.public : s.id][0]
  vpc_security_group_ids = [aws_security_group.coturn.id]
  iam_instance_profile   = aws_iam_instance_profile.coturn.name
  key_name               = var.ssh_key_name != "" ? var.ssh_key_name : null

  user_data                   = local.coturn_user_data
  user_data_replace_on_change = true

  depends_on = [aws_secretsmanager_secret_version.backend_env]

  tags = { Name = "${local.name}-coturn" }
}

resource "aws_eip_association" "coturn" {
  instance_id   = aws_instance.coturn.id
  allocation_id = aws_eip.coturn.id
}
