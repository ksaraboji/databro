# Multi-Environment Setup Summary

## Overview

Your Terraform and GitHub Actions infrastructure has been updated to support **separate S3 buckets for dev and prod environments**.

## 🎯 Key Changes

### Terraform Configuration

#### `variables.tf` - Updated
- Removed single `s3_bucket_name` variable
- Added `dev_bucket_name` and `prod_bucket_name` variables
- Environment validation now supports dev/prod only
- Added local variables for dynamic bucket naming

#### `s3.tf` - Enhanced
- **Locals Block**: Determines bucket names based on environment
  ```hcl
  locals {
    bucket_name = var.environment == "prod" ? var.prod_bucket_name : var.dev_bucket_name
  }
  ```
- **Environment-Specific Buckets**: Same code creates different buckets
- **Encryption & Logging**: Configured per-environment
- **Tags**: Include environment label for easy identification

#### `cloudfront.tf` - Updated
- CloudFront distributions now environment-specific
- OAI comments include environment name
- Distribution comments include environment identifier

#### `outputs.tf` - Expanded
- New outputs showing both dev and prod bucket names
- `all_buckets_info` output shows current environment and both buckets
- Deployment instructions now environment-specific

### New Files

#### `dev.tfvars` - Development Configuration
```hcl
environment = "dev"
dev_bucket_name = "databro-dev-build"
prod_bucket_name = "databro-prod-build"
log_retention_days = 15  # Shorter retention
```

#### `prod.tfvars` - Production Configuration
```hcl
environment = "prod"
log_retention_days = 90  # Longer retention
enable_versioning = true
enable_logging = true
```

### GitHub Actions Workflows

#### `.github/workflows/multi-env-deploy.yml` - New
- **Replaces** `build-and-deploy.yml` for multi-environment support
- Two separate deployment jobs: `deploy-dev` and `deploy-prod`
- **Dev Job Triggers**: Push to `develop` branch
- **Prod Job Triggers**: Push to `main` branch
- **Environment Protection**: Prod uses GitHub Environments feature
- Separate S3 buckets and CloudFront distributions per environment

#### `.github/workflows/terraform.yml` - Updated
- Matrix strategy: Runs for both dev and prod environments
- **Dev Deploy**: Triggered on push to `develop`
- **Prod Deploy**: Triggered on push to `main`
- Environment-specific `tfvars` files used
- Comments on PRs with environment-specific plan output

## 📁 Project Structure

```
terraform/
├── main.tf                      # AWS provider configuration
├── variables.tf                 # Updated with dev/prod variables
├── outputs.tf                   # Enhanced with environment outputs
├── s3.tf                        # Environment-specific S3 setup
├── cloudfront.tf                # Environment-specific CloudFront
├── terraform.tfvars.example     # Example configuration
├── dev.tfvars                   # ✨ NEW - Dev environment config
├── prod.tfvars                  # ✨ NEW - Prod environment config
└── .gitignore                   # Terraform ignore rules

.github/workflows/
├── multi-env-deploy.yml         # ✨ NEW - Multi-env deployment
├── terraform.yml                # Updated - Multi-env Terraform
├── build-and-deploy.yml         # (Kept for reference)
└── README.md                    # Workflow documentation

Root Files:
├── DEPLOYMENT.md                # Original deployment guide
├── MULTI_ENVIRONMENT_SETUP.md   # ✨ NEW - This setup guide
└── README.md                    # Updated with new info
```

## 🚀 Deployment Flow

### Development Environment
```
Feature Branch → develop → GitHub Actions
                            ↓
                   Build Next.js App
                            ↓
                   Deploy to Dev S3
                            ↓
                   Invalidate Dev CloudFront
```

**S3 Bucket**: `databro-dev-build-{account-id}`
**Access**: Direct from develop branch pushes

### Production Environment
```
Feature Branch → develop → main → GitHub Actions
                            ↓
                   Build Next.js App
                            ↓
                   Deploy to Prod S3
                            ↓
                   Invalidate Prod CloudFront
                            ↓
                   GitHub Deployment Record
```

**S3 Bucket**: `databro-prod-build-{account-id}`
**Access**: Through GitHub approval (optional)

## 🔐 GitHub Secrets Required

Update your GitHub repository secrets:

```
AWS_ACCESS_KEY_ID              # Shared AWS credentials
AWS_SECRET_ACCESS_KEY          # Shared AWS credentials

DEV_S3_BUCKET_NAME             # databro-dev-build-{account-id}
DEV_CLOUDFRONT_DISTRIBUTION_ID # Dev CloudFront ID

PROD_S3_BUCKET_NAME            # databro-prod-build-{account-id}
PROD_CLOUDFRONT_DISTRIBUTION_ID # Prod CloudFront ID
PROD_CLOUDFRONT_DOMAIN         # Prod CloudFront domain
```

## 📝 Next Steps

1. **Review Terraform Files**:
   - Check `dev.tfvars` and `prod.tfvars`
   - Customize bucket names if needed

2. **Deploy Infrastructure**:
   ```bash
   cd terraform
   terraform init
   
   # Deploy Dev
   terraform plan -var-file=dev.tfvars
   terraform apply -var-file=dev.tfvars
   
   # Deploy Prod
   terraform plan -var-file=prod.tfvars
   terraform apply -var-file=prod.tfvars
   ```

3. **Configure GitHub**:
   - Add the required secrets
   - (Optional) Create production environment with approvals

4. **Test Deployments**:
   - Push to `develop` → test dev deployment
   - Push to `main` → test prod deployment

5. **Monitor**:
   - Check GitHub Actions logs
   - Verify S3 buckets have content
   - Test CloudFront distributions

## 🎯 Differences Between Dev and Prod

| Feature | Dev | Prod |
|---------|-----|------|
| **Trigger** | develop branch | main branch |
| **Bucket Name** | `databro-dev-build-*` | `databro-prod-build-*` |
| **Log Retention** | 15 days | 90 days |
| **Approval Required** | No | Optional (GitHub Environments) |
| **CloudFront** | Yes (if enabled) | Yes (if enabled) |
| **Versioning** | Enabled | Enabled |

## 💡 Key Benefits

✅ **Isolation**: Dev and prod completely separate
✅ **Cost Control**: Dev can use lower retention periods
✅ **Safety**: Prod requires explicit push to main branch
✅ **Scalability**: Easy to add more environments
✅ **Traceability**: Each environment has separate resources
✅ **Automation**: GitHub Actions handles deployments
✅ **Infrastructure as Code**: All resources defined in Terraform

## 🔄 Workflow Examples

### Deploy to Dev Only
```bash
git checkout develop
git commit -m "Update content"
git push origin develop
# Automatically deploys to dev S3
```

### Deploy to Prod
```bash
git checkout develop
# Make changes
git push origin develop
# Deploy to dev, test it

# When ready for production
git checkout main
git merge develop
git push origin main
# Automatically deploys to prod S3
```

## 📊 AWS Resources Summary

**Per Environment**:
- 1 S3 Bucket (built content)
- 1 S3 Bucket (access logs)
- 1 CloudFront Distribution (optional)
- Encryption & versioning configured
- Lifecycle policies for logs

**Total Resources**:
- 4 S3 Buckets (2 per environment)
- 2 CloudFront Distributions (1 per environment)
- Associated policies and configurations

## 🚨 Important Notes

1. **S3 Bucket Names are Global**: 
   - Must be unique across all AWS accounts
   - Customize in `dev.tfvars` and `prod.tfvars` if needed

2. **CloudFront Distribution Time**:
   - Takes 5-10 minutes to deploy
   - Wait before testing the domain

3. **State Files**:
   - `.terraform.lock.hcl` is gitignored
   - Consider remote state for team collaboration

4. **Terraform Workspaces** (Optional):
   - Alternative to separate tfvars files
   - Run `terraform workspace new dev/prod`

## 📚 Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md) - Original deployment guide
- [MULTI_ENVIRONMENT_SETUP.md](MULTI_ENVIRONMENT_SETUP.md) - Detailed multi-env guide
- [terraform/README.md](terraform/README.md) - Terraform configuration details
- [.github/workflows/README.md](.github/workflows/README.md) - Workflow documentation

## ❓ FAQ

**Q: Can I change bucket names?**
A: Yes, edit `dev.tfvars` and `prod.tfvars` before deploying.

**Q: How do I switch environments locally?**
A: Use `terraform plan -var-file=dev.tfvars` or `prod.tfvars`

**Q: What if a bucket already exists?**
A: Use a more unique name in the tfvars files.

**Q: How do I add a staging environment?**
A: Create `staging.tfvars` and update GitHub Actions workflows.

**Q: Can I use the same bucket for both?**
A: Not recommended, defeats the purpose of separation.

## ✅ Verification Checklist

After setup, verify:

- [ ] Terraform files reviewed and customized
- [ ] AWS credentials configured locally
- [ ] Dev S3 bucket created and accessible
- [ ] Prod S3 bucket created and accessible
- [ ] CloudFront distributions operational
- [ ] GitHub secrets configured
- [ ] Push to develop triggers dev deployment
- [ ] Push to main triggers prod deployment
- [ ] S3 buckets contain deployed artifacts
- [ ] CloudFront can access S3 content

## 🎉 You're All Set!

Your infrastructure now supports:
- ✅ Separate dev and prod environments
- ✅ Automated deployments based on branch
- ✅ Independent S3 buckets and CDN
- ✅ Environment-specific configurations
- ✅ Infrastructure as Code with Terraform
- ✅ CI/CD with GitHub Actions

For detailed information, see [MULTI_ENVIRONMENT_SETUP.md](MULTI_ENVIRONMENT_SETUP.md).
