# Quick Start: Multi-Environment Terraform & CI/CD

This is a quick reference guide for using the multi-environment setup.

## 🚀 First Time Setup

### Step 1: Review Configuration Files

```bash
# Review dev configuration
cat terraform/dev.tfvars

# Review prod configuration
cat terraform/prod.tfvars
```

### Step 2: Deploy Infrastructure

```bash
cd terraform

# Initialize Terraform (one-time)
terraform init

# Deploy Dev
echo "Deploying Dev..."
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars

# Deploy Prod
echo "Deploying Prod..."
terraform plan -var-file=prod.tfvars
terraform apply -var-file=prod.tfvars
```

### Step 3: Get Output Values

```bash
# Get dev outputs (bucket names, CloudFront IDs)
echo "=== DEV OUTPUTS ==="
terraform output -var-file=dev.tfvars all_buckets_info

# Get prod outputs
echo "=== PROD OUTPUTS ==="
terraform output -var-file=prod.tfvars all_buckets_info
```

### Step 4: Configure GitHub Secrets

1. Go to: GitHub Repo → Settings → Secrets and variables → Actions
2. Add these secrets:

```
AWS_ACCESS_KEY_ID=<your-value>
AWS_SECRET_ACCESS_KEY=<your-value>
DEV_S3_BUCKET_NAME=databro-dev-build-<account-id>
DEV_CLOUDFRONT_DISTRIBUTION_ID=<dev-cf-id>
PROD_S3_BUCKET_NAME=databro-prod-build-<account-id>
PROD_CLOUDFRONT_DISTRIBUTION_ID=<prod-cf-id>
PROD_CLOUDFRONT_DOMAIN=<prod-cf-domain>
```

## 📋 Daily Workflow

### Develop New Features

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes to app/*, lib/*, etc.
# Commit and push
git push origin feature/my-feature

# Create Pull Request to develop
```

### Deploy to Dev

```bash
# Merge to develop
git checkout develop
git merge feature/my-feature
git push origin develop

# GitHub Actions automatically:
# 1. Builds Next.js app
# 2. Deploys to dev S3 bucket
# 3. Invalidates dev CloudFront
# 4. Watch in Actions tab for confirmation
```

**Dev URL**: `https://{dev-cloudfront-domain}`

### Deploy to Prod

```bash
# Create Pull Request from develop to main
# Review changes
# Merge to main

git checkout main
git merge develop
git push origin main

# GitHub Actions automatically:
# 1. Builds Next.js app
# 2. Deploys to prod S3 bucket
# 3. Invalidates prod CloudFront
# 4. Creates GitHub deployment record
```

**Prod URL**: `https://{prod-cloudfront-domain}`

## 📊 File Organization

### Terraform Files

```
terraform/
├── dev.tfvars         # Dev config: bucket names, log retention
├── prod.tfvars        # Prod config: bucket names, log retention
├── main.tf            # AWS provider setup
├── variables.tf       # Variable definitions
├── s3.tf              # S3 bucket setup (uses dev/prod tfvars)
├── cloudfront.tf      # CloudFront (uses dev/prod tfvars)
└── outputs.tf         # Output both env buckets
```

### GitHub Actions

```
.github/workflows/
├── multi-env-deploy.yml  # Build and deploy (dev vs prod)
└── terraform.yml         # Terraform plan/apply (dev vs prod)
```

## 🔍 Monitoring Deployments

### View Deployment Status

1. Go to: GitHub Repo → Actions
2. Click on workflow run
3. View job output for details

### Common Checks

```bash
# Check if files were uploaded to dev
aws s3 ls s3://databro-dev-build-<account-id>/

# Check if files were uploaded to prod
aws s3 ls s3://databro-prod-build-<account-id>/

# Verify CloudFront is working
curl -I https://{cloudfront-domain}
```

## 🔧 Common Tasks

### Update Dev Configuration

```bash
# Edit dev settings
nano terraform/dev.tfvars

# Apply changes
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

### Update Prod Configuration

```bash
# Edit prod settings
nano terraform/prod.tfvars

# Apply changes
terraform plan -var-file=prod.tfvars
terraform apply -var-file=prod.tfvars
```

### Manual S3 Upload (if needed)

```bash
# Build locally
npm run build

# Upload to dev
aws s3 sync .next s3://databro-dev-build-<account-id>/_next --delete

# Upload to prod
aws s3 sync .next s3://databro-prod-build-<account-id>/_next --delete
```

### Manual CloudFront Invalidation

```bash
# Invalidate dev CloudFront
aws cloudfront create-invalidation \
  --distribution-id <dev-cf-id> \
  --paths "/*"

# Invalidate prod CloudFront
aws cloudfront create-invalidation \
  --distribution-id <prod-cf-id> \
  --paths "/*"
```

## 🌳 Branch Strategy

```
main (Production)
 ↑
 └─ develop (Development)
     ↑
     └─ feature branches (Work in Progress)
```

### Workflow

1. Create feature branch from `develop`
2. Make changes and commit
3. Push to GitHub
4. Create PR to `develop`
5. Review and merge
6. GitHub Actions deploys to dev
7. Test in dev environment
8. Create PR from `develop` to `main`
9. Review and merge
10. GitHub Actions deploys to prod

## 📈 Environment Differences

| Aspect        | Dev                   | Prod                   |
| ------------- | --------------------- | ---------------------- |
| Branch        | develop               | main                   |
| Deployment    | Automatic             | Automatic              |
| Approval      | Not required          | Optional               |
| S3 Bucket     | `databro-dev-build-*` | `databro-prod-build-*` |
| Log Retention | 15 days               | 90 days                |
| URL           | Dev CloudFront        | Prod CloudFront        |

## 🆘 Troubleshooting

### Deployment Failed

1. Check GitHub Actions logs: Actions tab → failed workflow
2. Look for specific error message
3. Common issues:
   - AWS credentials invalid
   - S3 bucket doesn't exist
   - CloudFront not configured

### S3 Bucket Not Found

```bash
# List all S3 buckets
aws s3 ls

# Check specific bucket
aws s3 ls s3://databro-dev-build-<account-id>/
```

### CloudFront Not Caching

```bash
# Check distribution status
aws cloudfront get-distribution --id <distribution-id>

# Check recent deployments
aws cloudfront list-distributions
```

### Terraform State Issues

```bash
# Show current state
terraform state list -var-file=dev.tfvars

# Refresh state
terraform refresh -var-file=dev.tfvars

# Plan without state
terraform plan -var-file=dev.tfvars -lock=false
```

## 💡 Tips & Best Practices

1. **Test in Dev First**
   - Always test changes in dev before prod
   - Fix issues in dev environment

2. **Monitor Logs**
   - S3 access logs in `databro-*-build-logs-*` buckets
   - CloudFront logs for cache hits

3. **Use Meaningful Commit Messages**
   - Easier to track what was deployed
   - Better for debugging

4. **Review Before Merging**
   - PRs provide opportunity to review changes
   - GitHub Actions shows deployment status

5. **Keep Buckets Clean**
   - Delete old deployments
   - S3 versioning helps with rollbacks

## 📚 Related Documentation

- [MULTI_ENVIRONMENT_SETUP.md](MULTI_ENVIRONMENT_SETUP.md) - Detailed guide
- [terraform/README.md](terraform/README.md) - Terraform details
- [.github/workflows/README.md](.github/workflows/README.md) - Workflow details

## ✅ Verification

After setup, verify this works:

```bash
# 1. Dev deployment test
git checkout develop
touch .verified-dev
git add .
git commit -m "Dev deployment test"
git push origin develop
# Wait for GitHub Actions to complete
# Check if files appear in dev S3 bucket

# 2. Prod deployment test
git checkout main
git merge develop
touch .verified-prod
git add .
git commit -m "Prod deployment test"
git push origin main
# Wait for GitHub Actions to complete
# Check if files appear in prod S3 bucket

# 3. Cleanup
git checkout develop
rm .verified-dev .verified-prod
git commit -m "Clean up verification files"
git push origin develop
git checkout main
git merge develop
git push origin main
```

## 🎯 Next Steps

- [ ] Review and customize `dev.tfvars` and `prod.tfvars`
- [ ] Deploy Terraform infrastructure
- [ ] Configure GitHub secrets
- [ ] Test dev deployment (push to develop)
- [ ] Test prod deployment (push to main)
- [ ] Document any custom configurations
- [ ] Train team on deployment workflow

## 📞 Quick Links

- AWS Console: https://console.aws.amazon.com
- GitHub Repo: Your repo URL
- Dev CloudFront: https://{dev-domain}
- Prod CloudFront: https://{prod-domain}

---

**Need help?** See the detailed documentation in:

- [MULTI_ENVIRONMENT_SETUP.md](MULTI_ENVIRONMENT_SETUP.md)
- [terraform/README.md](terraform/README.md)
- [.github/workflows/README.md](.github/workflows/README.md)
