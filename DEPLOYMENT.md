# Infrastructure as Code & CI/CD Setup

This directory contains Terraform configurations and GitHub Actions workflows for deploying the Databro portfolio to AWS.

## 📁 Directory Structure

```
terraform/
├── main.tf                 # Main Terraform configuration
├── variables.tf            # Variable definitions
├── outputs.tf              # Output definitions
├── s3.tf                   # S3 bucket configuration
├── cloudfront.tf           # CloudFront distribution configuration
├── terraform.tfvars.example # Example variables file
├── .gitignore              # Git ignore rules for Terraform files
└── README.md               # Terraform documentation

.github/
└── workflows/
    ├── build-and-deploy.yml  # CI/CD for building and deploying to S3
    ├── terraform.yml         # Terraform plan and apply workflow
    └── README.md             # GitHub Actions documentation
```

## 🚀 Quick Start

### Prerequisites

1. **AWS Account** - You'll need an AWS account with appropriate permissions
2. **GitHub Secrets** - Configure the following secrets in your GitHub repository:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `S3_BUCKET_NAME` (optional, can be derived from Terraform)
   - `CLOUDFRONT_DISTRIBUTION_ID` (optional, if using CloudFront)

3. **Local Setup** (if running Terraform locally):
   - Terraform >= 1.0
   - AWS CLI configured
   - Proper IAM permissions

### Step 1: Configure Terraform

1. Copy the example variables file:
   ```bash
   cd terraform
   cp terraform.tfvars.example terraform.tfvars
   ```

2. Update `terraform.tfvars` with your values:
   ```hcl
   aws_region       = "us-east-1"
   project_name     = "databro"
   environment      = "prod"
   s3_bucket_name   = "my-unique-bucket-name"
   enable_cloudfront = true
   ```

### Step 2: Setup GitHub Secrets

1. Go to your GitHub repository
2. Navigate to `Settings` → `Secrets and variables` → `Actions`
3. Add the following secrets:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `S3_BUCKET_NAME`
   - `CLOUDFRONT_DISTRIBUTION_ID` (if using CloudFront)

### Step 3: Deploy Infrastructure

**Option A: Using GitHub Actions (Recommended)**

1. Push changes to the `main` branch:
   ```bash
   git add terraform/
   git commit -m "Add Terraform infrastructure"
   git push origin main
   ```

2. Monitor the workflow in GitHub Actions:
   - Go to `Actions` tab
   - Click on `Terraform Plan & Apply` workflow
   - The workflow will automatically plan and apply changes

**Option B: Local Deployment**

```bash
cd terraform

# Initialize Terraform
terraform init

# Review the plan
terraform plan -var-file=terraform.tfvars

# Apply the configuration
terraform apply -var-file=terraform.tfvars
```

## 📦 GitHub Actions Workflows

### 1. Build and Deploy Workflow (`build-and-deploy.yml`)

**Triggers:**
- Push to `main` or `develop` branches
- Changes to app files, package.json, etc.

**Jobs:**
1. **Build Job:**
   - Checkout code
   - Setup Node.js
   - Install dependencies
   - Run linter
   - Build Next.js app
   - Create and upload artifacts

2. **Deploy Job** (runs only on main branch):
   - Download build artifacts
   - Configure AWS credentials
   - Sync to S3 bucket
   - Invalidate CloudFront cache (if enabled)

**Environment Variables/Secrets Used:**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `S3_BUCKET_NAME`
- `CLOUDFRONT_DISTRIBUTION_ID`

### 2. Terraform Workflow (`terraform.yml`)

**Triggers:**
- Push to `main` branch with terraform changes
- Pull requests to `main` branch with terraform changes

**Jobs:**
1. **Terraform Job:**
   - Checkout code
   - Initialize Terraform
   - Validate Terraform code
   - Format check
   - Plan changes
   - Apply changes (only on push to main)
   - Publish outputs

**Environment Variables/Secrets Used:**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- Terraform variables from `.tfvars` file

## 📋 Terraform Resources

### S3 Bucket (`s3.tf`)
- **Resource**: `aws_s3_bucket`
- **Features**:
  - Public access blocked
  - Server-side encryption (AES256)
  - Versioning support
  - Logging enabled
  - CORS configuration for web access
  - Lifecycle policies for log cleanup

### CloudFront Distribution (`cloudfront.tf`)
- **Resource**: `aws_cloudfront_distribution`
- **Features**:
  - Origin Access Identity (OAI) for secure S3 access
  - HTTPS enforcement
  - Caching strategy
  - IPv6 support
  - Automatic bucket policies

## 🔐 Security Best Practices

1. **AWS Credentials**:
   - Use IAM users with minimal required permissions
   - Rotate access keys regularly
   - Use GitHub Actions OIDC for better security (optional upgrade)

2. **S3 Bucket**:
   - Public access blocked by default
   - Server-side encryption enabled
   - Versioning enabled for rollback

3. **State Management**:
   - Uncomment the `backend` block in `main.tf` to use remote state
   - Ensure the state bucket is encrypted and versioned

## 📊 Monitoring & Debugging

### View Logs

**GitHub Actions:**
1. Go to `Actions` tab in your GitHub repository
2. Click on the workflow run
3. View logs for each job/step

**AWS CloudWatch:**
```bash
# View S3 access logs
aws s3 ls s3://databro-logs-prod-<account-id>/ --recursive

# View CloudFront logs
aws cloudwatch logs describe-log-groups --region us-east-1
```

### Terraform State Inspection

```bash
cd terraform

# List resources
terraform state list

# Show specific resource details
terraform state show aws_s3_bucket.nextjs_build

# Force refresh state
terraform refresh
```

## 🔄 Deployment Flow

```
GitHub Push → Build & Test → Build Artifacts → Deploy to S3 → Invalidate CDN
    ↓
Terraform Changes → Plan → Validate → Apply → Update Infrastructure
```

## 💡 Common Tasks

### Update S3 Bucket Configuration

Edit `terraform/terraform.tfvars`:
```hcl
enable_versioning = false
log_retention_days = 60
```

Push changes, and GitHub Actions will automatically apply them.

### Manual S3 Upload

If you need to upload manually:
```bash
# Build locally
npm run build

# Sync to S3
aws s3 sync .next s3://your-bucket-name/_next --delete

# Invalidate CloudFront
aws cloudfront create-invalidation \
  --distribution-id E1234ABCD \
  --paths "/*"
```

### Rollback Deployment

```bash
# Revert to previous commit
git revert <commit-hash>
git push origin main

# GitHub Actions will automatically redeploy
```

### Destroy Infrastructure

```bash
cd terraform

# Plan destruction
terraform plan -destroy -var-file=terraform.tfvars

# Apply destruction
terraform destroy -var-file=terraform.tfvars
```

⚠️ **Warning**: This will delete all AWS resources including S3 buckets.

## 📚 Additional Resources

- [Terraform AWS Provider Documentation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [CloudFront Documentation](https://docs.aws.amazon.com/cloudfront/)

## 🆘 Troubleshooting

### "InvalidIdentityTokenException" in GitHub Actions

**Solution**: Ensure your AWS IAM user has these permissions:
- `s3:ListBucket`
- `s3:GetObject`
- `s3:PutObject`
- `s3:DeleteObject`
- `cloudfront:CreateInvalidation`

### Terraform Plan Fails with "AccessDenied"

**Solution**: Check IAM permissions include:
- `ec2:DescribeAccountAttributes`
- `sts:GetCallerIdentity`
- `s3:CreateBucket`
- `cloudfront:CreateDistribution`

### S3 Deployment Slow

**Solution**: Use CloudFront distribution and implement versioning strategy:
- Static assets: Cache for 1 year
- HTML files: Cache for 0 seconds
- Other: Cache for 1 hour

## 📝 Notes

- S3 bucket names must be globally unique across AWS
- CloudFront distributions take 5-10 minutes to deploy
- IAM propagation can take a few minutes
- Always review `terraform plan` output before applying

## 📞 Support

For issues or questions:
1. Check GitHub Issues in the repository
2. Review AWS documentation
3. Check Terraform registry documentation
4. Enable debug logging: `export TF_LOG=DEBUG`
