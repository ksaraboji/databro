# Production environment configuration
aws_region   = "us-east-2"
project_name = "databro"
environment  = "prod"

# bucket name for prod
prod_bucket_name = "databro-prod-build"

# Prod environment settings - stricter configurations
enable_versioning  = true # Always enabled for prod
enable_logging     = true # Always enabled for prod
log_retention_days = 90   # Longer retention for prod
enable_cloudfront  = true # Always enabled for prod

tags = {
  Track       = "Data Engineering"
  Service     = "Portfolio"
  Owner       = "Kumar Saraboji"
  Environment = "production"
}
