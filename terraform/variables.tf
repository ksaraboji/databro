variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-2"
}

variable "project_name" {
  description = "Project name for resource naming and tagging"
  type        = string
  default     = "databro"
}

variable "environment" {
  description = "Environment name (dev, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Environment must be dev or prod."
  }
}

variable "dev_bucket_name" {
  description = "S3 bucket name for dev environment"
  type        = string
  default     = "databro-dev-build"
}

variable "prod_bucket_name" {
  description = "S3 bucket name for prod environment"
  type        = string
  default     = "databro-prod-build"
}

variable "enable_versioning" {
  description = "Enable versioning on S3 bucket"
  type        = bool
  default     = true
}

variable "enable_logging" {
  description = "Enable logging for S3 bucket"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "S3 log retention in days"
  type        = number
  default     = 30
}

variable "enable_cloudfront" {
  description = "Enable CloudFront distribution for S3 bucket"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default = {
    Track   = "Data Engineering"
    Owner   = "Kumar Saraboji"
    Service = "Portfolio"
  }
}
