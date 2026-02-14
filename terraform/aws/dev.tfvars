# Development environment configuration
aws_region   = "us-east-2"
project_name = "databro"
environment  = "dev"
domain_name  = "dev.databro.dev"
additional_domain_names = ["dev.data-bro.com"]

# bucket name for dev
dev_bucket_name = "databro-dev-build"

# Dev environment settings - can be more permissive
enable_versioning  = true
enable_logging     = true
log_retention_days = 15 # Shorter retention for dev
enable_cloudfront  = true

tags = {
  Track       = "Data Engineering"
  Service     = "Portfolio"
  Owner       = "Kumar Saraboji"
  Environment = "development"
}
