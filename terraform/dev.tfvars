# Development environment configuration
aws_region       = "us-east-2"
project_name     = "databro"
environment      = "dev"

# Separate bucket names for dev and prod
dev_bucket_name  = "databro-dev-build"
prod_bucket_name = "databro-prod-build"

# Dev environment settings - can be more permissive
enable_versioning  = true
enable_logging     = true
log_retention_days = 15  # Shorter retention for dev
enable_cloudfront  = true

tags = {
  Track       = "Data Engineering"
  Service     = "Portfolio"
  Owner       = "Kumar Saraboji"
  Environment = "development"
}
