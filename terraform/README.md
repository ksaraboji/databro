# Terraform Configuration for Databro

Infrastructure as Code for deploying Databro portfolio to AWS.

## 📋 Overview

This Terraform configuration sets up:

- S3 bucket for hosting static Next.js build
- CloudFront distribution for CDN
- S3 access logging and monitoring
- Encryption and security best practices

## 🗂️ Files

| File                       | Purpose                              |
| -------------------------- | ------------------------------------ |
| `main.tf`                  | Provider configuration, data sources |
| `variables.tf`             | Input variable definitions           |
| `outputs.tf`               | Output value definitions             |
| `s3.tf`                    | S3 bucket and logging configuration  |
| `cloudfront.tf`            | CloudFront distribution and OAI      |
| `terraform.tfvars.example` | Example variables file               |
| `.gitignore`               | Git ignore rules for sensitive files |

## 🚀 Getting Started

### Prerequisites

```bash
# Check Terraform version (>= 1.0 required)
terraform version

# Ensure AWS CLI is configured
aws configure
aws sts get-caller-identity
```

### Initial Setup

```bash
# Clone and navigate to terraform directory
cd terraform

# Copy example variables
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
nano terraform.tfvars

# Initialize Terraform
terraform init
```

### Deployment

```bash
# Validate configuration
terraform validate

# Check what will be created
terraform plan

# Apply the configuration
terraform apply

# View outputs
terraform output
```

## 📝 Configuration

### Basic Variables

Edit `terraform.tfvars`:

```hcl
# AWS region
aws_region = "us-east-1"

# Project name (used for resource naming)
project_name = "databro"

# Environment: dev, staging, prod
environment = "prod"

# S3 bucket base name
s3_bucket_name = "databro-nextjs"

# Enable features
enable_versioning  = true
enable_logging     = true
enable_cloudfront  = true

# Log retention
log_retention_days = 30

# Custom tags
tags = {
  Team    = "DataTeam"
  Service = "Portfolio"
  Owner   = "Your Name"
}
```

### Advanced Configuration

#### Remote State Backend

Uncomment in `main.tf`:

```hcl
backend "s3" {
  bucket         = "my-terraform-state-bucket"
  key            = "databro/terraform.tfstate"
  region         = "us-east-1"
  encrypt        = true
  dynamodb_table = "terraform-locks"
}
```

Create state infrastructure:

```bash
# Create S3 bucket for state
aws s3 mb s3://my-terraform-state-bucket-$(aws sts get-caller-identity --query Account --output text)

# Create DynamoDB table for locks
aws dynamodb create-table \
  --table-name terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --region us-east-1
```

## 🔍 Outputs

After applying, view outputs:

```bash
terraform output

# Specific output
terraform output s3_bucket_name

# As JSON
terraform output -json
```

### Key Outputs

- `s3_bucket_name` - Name of S3 bucket
- `s3_bucket_arn` - ARN of S3 bucket
- `cloudfront_distribution_id` - CloudFront distribution ID
- `cloudfront_domain_name` - CloudFront domain
- `deployment_instructions` - How to deploy

## 🛡️ Security Features

### S3 Bucket

- ✅ Public access blocked
- ✅ Server-side encryption (AES256)
- ✅ Versioning enabled
- ✅ Access logging
- ✅ Lifecycle policies

### CloudFront

- ✅ Origin Access Identity (OAI)
- ✅ HTTPS enforcement
- ✅ IPv6 support
- ✅ Caching strategy

### IAM

- ✅ Least privilege principle
- ✅ Separate credentials for CI/CD
- ✅ Policy documents in configuration

## 📊 State Management

### View State

```bash
# List all resources
terraform state list

# Show specific resource
terraform state show aws_s3_bucket.nextjs_build

# Pull state (backup)
terraform state pull > backup.tfstate
```

### State Backup

```bash
# Automatic backups (in .terraform directory)
ls -la .terraform/

# Manual backup
terraform state pull > $(date +%s).tfstate
```

## 🔄 Managing Resources

### Update Configuration

```bash
# Edit variables
nano terraform.tfvars

# Plan changes
terraform plan

# Apply changes
terraform apply
```

### Destroy Resources

```bash
# Plan destruction
terraform plan -destroy

# Destroy specific resource
terraform destroy -target aws_s3_bucket.nextjs_build

# Destroy all
terraform destroy
```

## 🧪 Testing Configuration

### Validate Syntax

```bash
# Validate configuration
terraform validate

# Format check
terraform fmt -check

# Auto-format
terraform fmt -recursive
```

### Plan Without Apply

```bash
# See what would be created/modified
terraform plan -out=tfplan

# Review the plan
terraform show tfplan

# Discard if needed
rm tfplan
```

## 🐛 Debugging

### Enable Debug Logging

```bash
# Verbose output
terraform plan -lock=false

# Very verbose (provider debug)
export TF_LOG=DEBUG
terraform plan > tf.log 2>&1

# Trace level (most detailed)
export TF_LOG=TRACE
terraform plan > tf.log 2>&1

# Disable logging
unset TF_LOG
```

### Common Issues

**Error: "Bucket already exists"**

```
Solution: S3 bucket names are globally unique. Try:
- Change s3_bucket_name in terraform.tfvars
- Use longer, more unique name
```

**Error: "AccessDenied"**

```
Solution: Ensure AWS credentials have permissions for:
- s3:CreateBucket
- cloudfront:CreateDistribution
- iam:GetRole
- ec2:DescribeAccountAttributes
```

**Error: "The count operation... is not supported"**

```
Solution: Ensure enable_cloudfront or enable_logging is explicitly true/false
```

## 📈 Cost Estimation

```bash
# Estimate costs (requires terraform cloud)
terraform plan -json | tfcost

# Manual estimation:
# S3: ~$0.023 per GB stored
# CloudFront: ~$0.085 per GB delivered
# Logging: negligible
```

## 🔗 AWS Resources Created

| Resource   | Type                                    | Details                      |
| ---------- | --------------------------------------- | ---------------------------- |
| S3 Bucket  | `aws_s3_bucket`                         | Next.js static build storage |
| S3 Logging | `aws_s3_bucket`                         | Access logs storage          |
| S3 Policy  | `aws_s3_bucket_policy`                  | CloudFront access            |
| CloudFront | `aws_cloudfront_distribution`           | CDN distribution             |
| OAI        | `aws_cloudfront_origin_access_identity` | Secure S3 access             |

## 🚀 CI/CD Integration

GitHub Actions automatically runs:

1. **Terraform Validate** - On PR
2. **Terraform Plan** - On PR (shows changes)
3. **Terraform Apply** - On merge to main

View in `.github/workflows/terraform.yml`

## 📚 Resources

- [Terraform Docs](https://www.terraform.io/docs)
- [AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest)
- [Terraform Best Practices](https://www.terraform-best-practices.com/)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)

## ✅ Checklist

Before deploying:

- [ ] AWS account configured
- [ ] `terraform.tfvars` updated with your values
- [ ] S3 bucket name is unique
- [ ] AWS credentials have required permissions
- [ ] Review `terraform plan` output
- [ ] GitHub Secrets configured for CI/CD

## 📞 Support

For issues:

1. Check terraform plan output
2. Review error messages carefully
3. Check AWS IAM permissions
4. Enable TF_LOG=DEBUG for detailed logging
5. Review Terraform and AWS documentation
