output "environment" {
  description = "Current environment"
  value       = var.environment
}

output "s3_bucket_name" {
  description = "Name of the S3 bucket for current environment"
  value       = aws_s3_bucket.nextjs_build.id
}

output "s3_bucket_arn" {
  description = "ARN of the S3 bucket for current environment"
  value       = aws_s3_bucket.nextjs_build.arn
}

output "s3_bucket_region" {
  description = "Region of the S3 bucket"
  value       = aws_s3_bucket.nextjs_build.region
}

output "s3_regional_domain_name" {
  description = "Regional domain name of the S3 bucket"
  value       = aws_s3_bucket.nextjs_build.bucket_regional_domain_name
}

output "dev_bucket_name" {
  description = "Name of the dev environment S3 bucket"
  value       = "${var.dev_bucket_name}-${data.aws_caller_identity.current.account_id}"
}

output "prod_bucket_name" {
  description = "Name of the prod environment S3 bucket"
  value       = "${var.prod_bucket_name}-${data.aws_caller_identity.current.account_id}"
}

output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution for current environment"
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.nextjs_build[0].id : null
}

output "cloudfront_domain_name" {
  description = "Domain name of the CloudFront distribution for current environment"
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.nextjs_build[0].domain_name : null
}

output "cloudfront_distribution_arn" {
  description = "ARN of the CloudFront distribution for current environment"
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.nextjs_build[0].arn : null
}

output "log_bucket_name" {
  description = "Name of the S3 bucket for logs in current environment"
  value       = var.enable_logging ? aws_s3_bucket.logs[0].id : null
}

output "aws_account_id" {
  description = "AWS Account ID"
  value       = data.aws_caller_identity.current.account_id
}

output "aws_region" {
  description = "AWS Region"
  value       = data.aws_region.current.id
}

output "deployment_instructions" {
  description = "Instructions for deploying to S3"
  value       = var.enable_cloudfront ? "1. Build: npm run build\n2. Upload to S3 (${var.environment}): aws s3 sync ./out s3://${aws_s3_bucket.nextjs_build.id}/ --delete\n3. Invalidate CloudFront: aws cloudfront create-invalidation --distribution-id ${aws_cloudfront_distribution.nextjs_build[0].id} --paths '/*'" : "1. Build: npm run build\n2. Upload to S3 (${var.environment}): aws s3 sync ./out s3://${aws_s3_bucket.nextjs_build.id}/ --delete"
}

output "all_buckets_info" {
  description = "Information about both dev and prod buckets"
  value = {
    dev_bucket     = "${var.dev_bucket_name}-${data.aws_caller_identity.current.account_id}"
    prod_bucket    = "${var.prod_bucket_name}-${data.aws_caller_identity.current.account_id}"
    current_env    = var.environment
    current_bucket = aws_s3_bucket.nextjs_build.id
  }
}
