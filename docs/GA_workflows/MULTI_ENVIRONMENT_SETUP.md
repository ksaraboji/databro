# Multi-Environment Terraform Setup

This guide explains how to manage separate S3 buckets for dev and prod environments.

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│     GitHub Repository               │
├─────────────────────────────────────┤
│                                     │
│  Push to develop branch             │  Deploy to Dev Environment
│         ↓                           │
│  GitHub Actions (multi-env-deploy)  │  S3: databro-dev-build-{account-id}
│         ↓                           │  CloudFront: Dev Distribution
│  Build Next.js app                  │
│         ↓                           │
│  Deploy to Dev S3 bucket            │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  Push to main branch                │  Deploy to Prod Environment
│         ↓                           │
│  GitHub Actions (multi-env-deploy)  │  S3: databro-prod-build-{account-id}
│         ↓                           │  CloudFront: Prod Distribution
│  Build Next.js app                  │
│         ↓                           │
│  Deploy to Prod S3 bucket           │
│                                     │
└─────────────────────────────────────┘
```

## 📋 File Structure

```
terraform/
├── main.tf                    # AWS provider configuration
├── variables.tf               # Variable definitions with dev/prod buckets
├── outputs.tf                 # Outputs showing both environments
├── s3.tf                      # S3 bucket creation (environment-specific)
├── cloudfront.tf              # CloudFront distribution (environment-specific)
├── terraform.tfvars.example   # Example configuration
├── dev.tfvars                 # Dev environment-specific variables
├── prod.tfvars                # Prod environment-specific variables
├── .gitignore                 # Ignore state files and credentials
└── README.md                  # Terraform documentation

.github/workflows/
├── multi-env-deploy.yml       # Build and deploy to dev/prod S3
├── terraform.yml              # Terraform plan/apply for both environments
└── README.md                  # Workflow documentation
```

## 🚀 Deployment Flow

### Development Environment

- **Trigger**: Push to `develop` branch
- **Bucket**: `databro-dev-build-{account-id}`
- **CloudFront**: Dev distribution
- **Workflow**: `multi-env-deploy.yml` → `deploy-dev` job

### Production Environment

- **Trigger**: Push to `main` branch
- **Bucket**: `databro-prod-build-{account-id}`
- **CloudFront**: Prod distribution
- **Environment**: Protected with GitHub environment approval
- **Workflow**: `multi-env-deploy.yml` → `deploy-prod` job

## 🔧 Configuration

### Terraform Variables (`dev.tfvars` and `prod.tfvars`)

Each environment file contains:

```hcl
environment = "dev"  # or "prod"

# Bucket names (same across both, differentiated by account ID)
dev_bucket_name  = "databro-dev-build"
prod_bucket_name = "databro-prod-build"

# Environment-specific settings
enable_versioning  = true
enable_logging     = true
log_retention_days = 15   # Dev: 15 days, Prod: 90 days
enable_cloudfront  = true
```

### AWS Resources Created

**Dev Environment**:

- S3 Bucket: `databro-dev-build-{account-id}`
- S3 Logs: `databro-dev-build-logs-{account-id}`
- CloudFront Distribution (if enabled)

**Prod Environment**:

- S3 Bucket: `databro-prod-build-{account-id}`
- S3 Logs: `databro-prod-build-logs-{account-id}`
- CloudFront Distribution (if enabled)

## 🔐 GitHub Secrets Required

Configure these secrets in your GitHub repository for both dev and prod:

```
AWS_ACCESS_KEY_ID              # Shared AWS credentials
AWS_SECRET_ACCESS_KEY          # Shared AWS credentials

DEV_S3_BUCKET_NAME             # Dev bucket: databro-dev-build-{account-id}
DEV_CLOUDFRONT_DISTRIBUTION_ID # Dev CloudFront distribution ID

PROD_S3_BUCKET_NAME            # Prod bucket: databro-prod-build-{account-id}
PROD_CLOUDFRONT_DISTRIBUTION_ID # Prod CloudFront distribution ID
PROD_CLOUDFRONT_DOMAIN         # Prod CloudFront domain for environment URL
```

## 📝 Setup Instructions

### 1. Deploy Infrastructure

```bash
cd terraform

# Deploy Dev environment
terraform init
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars

# Deploy Prod environment
terraform plan -var-file=prod.tfvars
terraform apply -var-file=prod.tfvars
```

### 2. Retrieve Outputs

After deployment, get the bucket names and CloudFront IDs:

```bash
# Get dev outputs
terraform output -var-file=dev.tfvars

# Get prod outputs
terraform output -var-file=prod.tfvars
```

### 3. Configure GitHub Secrets

1. Go to repository → Settings → Secrets and variables → Actions
2. Add the following secrets:

```
AWS_ACCESS_KEY_ID=<your-aws-access-key>
AWS_SECRET_ACCESS_KEY=<your-aws-secret-key>

DEV_S3_BUCKET_NAME=databro-dev-build-<account-id>
DEV_CLOUDFRONT_DISTRIBUTION_ID=<dev-distribution-id>

PROD_S3_BUCKET_NAME=databro-prod-build-<account-id>
PROD_CLOUDFRONT_DISTRIBUTION_ID=<prod-distribution-id>
PROD_CLOUDFRONT_DOMAIN=<prod-cloudfront-domain>
```

### 4. Setup GitHub Environments

For production approval:

1. Go to repository → Settings → Environments
2. Create `production` environment
3. Add reviewers or conditions (optional)

## 🔄 Workflow Operations

### Deploying to Dev

```bash
# Make changes
git checkout develop
git add .
git commit -m "Update content"
git push origin develop
```

This automatically triggers:

- Build Next.js app
- Deploy to dev S3 bucket
- Invalidate dev CloudFront

### Deploying to Prod

```bash
# Create PR from develop to main
git checkout main
git pull origin develop
git push origin main
```

This automatically triggers:

- Build Next.js app
- Deploy to prod S3 bucket
- Invalidate prod CloudFront
- Create GitHub deployment record

## 📊 Managing Terraform State

### Local State (Development)

```bash
# Default behavior - state stored locally
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

### Remote State (Optional)

For team collaboration, use S3 backend:

```hcl
# In main.tf, uncomment and update:
backend "s3" {
  bucket         = "my-terraform-state-bucket"
  key            = "databro/terraform.tfstate"
  region         = "us-east-2"
  encrypt        = true
  dynamodb_table = "terraform-locks"
}
```

Then:

```bash
terraform init
```

## 🛡️ Best Practices

### Dev Environment

- Lower costs preferred
- Shorter log retention (15 days)
- Rapid iteration allowed
- Can test without approval

### Prod Environment

- High availability required
- Longer log retention (90 days)
- Manual approval gates
- Detailed monitoring and logging
- Immutable deployments

## 🔍 Monitoring

### View CloudFront Metrics

```bash
# List CloudFront distributions
aws cloudfront list-distributions

# Get distribution details
aws cloudfront get-distribution --id <distribution-id>

# View distribution stats
aws cloudwatch get-metric-statistics \
  --namespace AWS/CloudFront \
  --metric-name Requests \
  --dimensions Name=DistributionId,Value=<distribution-id> \
  --start-time 2024-01-17T00:00:00Z \
  --end-time 2024-01-18T00:00:00Z \
  --period 3600 \
  --statistics Sum
```

### Check S3 Usage

```bash
# List buckets
aws s3 ls

# Get bucket size
aws s3api head-bucket --bucket databro-dev-build-<account-id>

# List bucket contents
aws s3 ls s3://databro-dev-build-<account-id>/ --recursive --summarize
```

## 🚨 Troubleshooting

### Bucket Already Exists Error

```
Error: BadRequest: The bucket already exists and you must be its owner
```

**Solution**: S3 bucket names are globally unique. Try:

- Use a longer, more unique name in tfvars
- Include company prefix or department

### CloudFront Distribution Takes Time

CloudFront distributions take 5-10 minutes to deploy. Wait before testing.

### Invalidation Not Working

```bash
# Manual cache invalidation
aws cloudfront create-invalidation \
  --distribution-id <distribution-id> \
  --paths "/*"
```

### State Lock Timeout

If Terraform hangs:

```bash
# Force unlock (use carefully!)
terraform force-unlock <lock-id>
```

## 📈 Scaling Considerations

### Adding More Environments

To add staging environment:

1. Create `staging.tfvars`:

```hcl
environment      = "staging"
dev_bucket_name  = "databro-dev-build"
prod_bucket_name = "databro-prod-build"
```

2. Update GitHub Actions workflows to support staging branch

3. Add staging secrets to GitHub

### Multi-Region Deployment

To deploy to multiple regions:

1. Create regional subdirectories:

```
terraform/
├── us-east-2/
│   ├── main.tf
│   └── dev.tfvars
├── eu-west-1/
│   ├── main.tf
│   └── dev.tfvars
```

2. Update workflows to run against multiple directories

## 📚 Additional Resources

- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest)
- [S3 Bucket Documentation](https://docs.aws.amazon.com/s3/)
- [CloudFront Documentation](https://docs.aws.amazon.com/cloudfront/)
- [GitHub Actions Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments)

## ✅ Checklist

Before going live:

- [ ] AWS credentials configured
- [ ] Dev and prod `tfvars` files updated
- [ ] GitHub secrets configured
- [ ] Terraform initialized and validated
- [ ] Infrastructure deployed successfully
- [ ] CloudFront distributions operational
- [ ] Deployments tested (dev and prod)
- [ ] Log retention policies reviewed
- [ ] Cost monitoring setup
- [ ] Disaster recovery plan documented
