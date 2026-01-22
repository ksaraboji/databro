# CloudFront distribution for S3 bucket (optional)
resource "aws_cloudfront_origin_access_identity" "nextjs_build" {
  count   = var.enable_cloudfront && contains(["dev", "prod"], var.environment) ? 1 : 0
  comment = "OAI for ${var.project_name} NextJS build (${var.environment})"
}

# S3 bucket policy for CloudFront
resource "aws_s3_bucket_policy" "nextjs_build" {
  count  = var.enable_cloudfront && contains(["dev", "prod"], var.environment) ? 1 : 0
  bucket = aws_s3_bucket.nextjs_build.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudFrontAccess"
        Effect = "Allow"
        Principal = {
          AWS = aws_cloudfront_origin_access_identity.nextjs_build[0].iam_arn
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.nextjs_build.arn}/*"
      }
    ]
  })
}

resource "aws_cloudfront_distribution" "nextjs_build" {
  count               = var.enable_cloudfront && contains(["dev", "prod"], var.environment) ? 1 : 0
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project_name} NextJS Distribution (${var.environment})"
  default_root_object = "index.html"

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  origin {
    domain_name = aws_s3_bucket.nextjs_build.bucket_regional_domain_name
    origin_id   = "myS3Origin"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.nextjs_build[0].cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    allowed_methods = ["GET", "HEAD"]
    cached_methods  = ["GET", "HEAD"]

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    target_origin_id       = "myS3Origin"
    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-cloudfront-${var.environment}"
      Environment = var.environment
    }
  )
}
