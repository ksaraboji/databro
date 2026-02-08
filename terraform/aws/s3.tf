# Local variables for bucket names based on environment
locals {
  bucket_name      = var.environment == "prod" ? var.prod_bucket_name : var.dev_bucket_name
  full_bucket_name = "${local.bucket_name}-${data.aws_caller_identity.current.account_id}"
  log_bucket_name  = "${local.bucket_name}-logs-${data.aws_caller_identity.current.account_id}"
}

# S3 bucket for hosting the Next.js application
resource "aws_s3_bucket" "nextjs_build" {
  bucket = local.full_bucket_name

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-nextjs-build-${var.environment}"
      Environment = var.environment
    }
  )
}

# Block all public access by default
resource "aws_s3_bucket_public_access_block" "nextjs_build" {
  bucket = aws_s3_bucket.nextjs_build.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable versioning
resource "aws_s3_bucket_versioning" "nextjs_build" {
  bucket = aws_s3_bucket.nextjs_build.id

  versioning_configuration {
    status = var.enable_versioning ? "Enabled" : "Suspended"
  }
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "nextjs_build" {
  bucket = aws_s3_bucket.nextjs_build.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Enable logging for this bucket
resource "aws_s3_bucket" "logs" {
  count  = var.enable_logging ? 1 : 0
  bucket = local.log_bucket_name

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-logs-${var.environment}"
      Environment = var.environment
    }
  )
}

resource "aws_s3_bucket_public_access_block" "logs" {
  count  = var.enable_logging ? 1 : 0
  bucket = aws_s3_bucket.logs[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Block logging for logging bucket to avoid circular dependency
resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  count  = var.enable_logging ? 1 : 0
  bucket = aws_s3_bucket.logs[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_logging" "nextjs_build" {
  count                 = var.enable_logging ? 1 : 0
  bucket                = aws_s3_bucket.nextjs_build.id
  target_bucket         = aws_s3_bucket.logs[0].id
  target_prefix         = "nextjs-build/"
  expected_bucket_owner = data.aws_caller_identity.current.account_id
}

# Lifecycle policy for log cleanup
resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  count  = var.enable_logging ? 1 : 0
  bucket = aws_s3_bucket.logs[0].id

  rule {
    id     = "delete-old-logs"
    status = "Enabled"

    expiration {
      days = var.log_retention_days
    }
  }
}

# CORS configuration for Next.js
resource "aws_s3_bucket_cors_configuration" "nextjs_build" {
  bucket = aws_s3_bucket.nextjs_build.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}
