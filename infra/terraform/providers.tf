terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # State is stored remotely so `terraform apply` is safe to run from more
  # than one machine/CI runner. Create the bucket + lock table once by hand
  # (or with the bootstrap/ config) before first `terraform init` here —
  # a backend block can't provision its own storage.
  #
  #   aws s3api create-bucket --bucket upz-terraform-state --region eu-north-1 \
  #     --create-bucket-configuration LocationConstraint=eu-north-1
  #   aws s3api put-bucket-versioning --bucket upz-terraform-state \
  #     --versioning-configuration Status=Enabled
  #   aws dynamodb create-table --table-name upz-terraform-locks \
  #     --attribute-definitions AttributeName=LockID,AttributeType=S \
  #     --key-schema AttributeName=LockID,KeyType=HASH \
  #     --billing-mode PAY_PER_REQUEST
  backend "s3" {
    bucket         = "upz-terraform-state"
    key            = "upz/terraform.tfstate"
    region         = "eu-north-1"
    dynamodb_table = "upz-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "upz"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Needed for the ACM certificate on CloudFront-adjacent resources if ever
# added later, and for building ARNs generically below.
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
