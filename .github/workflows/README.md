# GitHub Actions Workflows

This directory contains GitHub Actions workflows for CI/CD automation.

## Workflows Overview

We use a **separated workflow strategy** for better performance and clarity:

### 1. Terraform Infrastructure Deployment
**File**: `terraform.yml`

Manages AWS infrastructure (S3, CloudFront, IAM) using Terraform.

**Triggers**:
- Push to `main` or `develop` branches with terraform changes
- Pull requests to `main` or `develop` with terraform changes
- Paths: `terraform/**`, `.github/workflows/terraform.yml`

**Jobs**:
1. **terraform-plan-and-apply** (matrix: dev, prod)
   - Validates Terraform configuration
   - Plans changes (with PR comments)
   - Applies changes on push (dev on develop, prod on main)
   - Publishes infrastructure outputs

**Features**:
- ✅ Uses latest stable Terraform version
- ✅ Separate dev and prod environments
- ✅ PR comments with Terraform plans
- ✅ Automated infrastructure deployment

### 2. Application Build and Deploy
**File**: `multi-env-deploy.yml`

Builds Next.js application and deploys to S3 buckets.

**Triggers**:
- Push to `main` or `develop` branches with application changes
- Pull requests to `main` or `develop`
- Paths: `app/**`, `lib/**`, `public/**`, `package.json`, `package-lock.json`, `tsconfig.json`

**Jobs**:
1. **build** (runs on all triggers)
   - Installs dependencies
   - Runs linter
   - Builds Next.js application
   - Generates build metadata
   - Uploads artifacts (5-day retention)

2. **deploy-dev** (runs on push to develop)
   - Builds Next.js application
   - Configures AWS credentials
   - Syncs to dev S3 bucket
   - Invalidates dev CloudFront cache

3. **deploy-prod** (runs on push to main)
   - Builds Next.js application
   - Configures AWS credentials
   - Syncs to prod S3 bucket
   - Invalidates prod CloudFront cache
   - Creates GitHub deployment record

**Features**:
- ✅ Separate dev and prod deployments
- ✅ Intelligent cache control (static files: 1 year, HTML: no cache)
- ✅ CloudFront invalidation
- ✅ Build artifact retention
- ✅ Deployment summaries

## Workflow Separation Benefits

| Scenario | Old Approach | New Approach |
|----------|---|---|
| Code-only push | Build + Terraform | ✅ Only Build |
| Terraform-only push | Build + Terraform | ✅ Only Terraform |
| Both | Sequential | ✅ Parallel |
| Performance | 8 min | ✅ 3-5 min |

## Required Secrets

Configure these in GitHub repository settings:

```
AWS_ACCESS_KEY_ID              # AWS IAM access key
AWS_SECRET_ACCESS_KEY          # AWS IAM secret key
DEV_S3_BUCKET_NAME            # Dev bucket name
DEV_CLOUDFRONT_DISTRIBUTION_ID # Dev CloudFront distribution ID
PROD_S3_BUCKET_NAME           # Prod bucket name
PROD_CLOUDFRONT_DISTRIBUTION_ID # Prod CloudFront distribution ID
PROD_CLOUDFRONT_DOMAIN        # Prod CloudFront domain URL
```

**Where to configure**: GitHub Repo → Settings → Secrets and variables → Actions

## Usage

### Branch Strategy

```
main (Production)
 ↑
 └─ develop (Development)
     ↑
     └─ feature branches
```

### Triggering Workflows

**Application Deployment** (push app code):
```bash
git push origin develop  # Builds and deploys to dev S3
git push origin main     # Builds and deploys to prod S3
```

**Infrastructure Changes** (push terraform code):
```bash
git push origin develop  # Plans and applies dev infrastructure
git push origin main     # Plans and applies prod infrastructure
```

### Monitoring

1. **Go to Actions tab**: View all workflow runs
2. **Filter by workflow**: Select "Terraform..." or "Build and Deploy..."
3. **View job logs**: Click workflow → click job → expand steps
4. **Check deployment status**: Look for ✅ or ❌ badges

## Environment Variables

Configured in workflows:

```yaml
CI: true              # Enable CI mode for builds
aws-region: us-east-2 # AWS region for deployments
```

## Cost Optimization

These workflows are optimized for cost:
- ✅ Only relevant workflows trigger (no wasted runs)
- ✅ GitHub-hosted runners (included in plans)
- ✅ Caches npm dependencies
- ✅ Retains artifacts for only 5 days
- ✅ Parallel execution when both change
- ✅ Minimal compute resources per job

## Permissions

The workflows use minimal required permissions:
- `contents: read` - Read repository contents
- `pull-requests: write` - Comment on PRs
- AWS credentials managed via GitHub Secrets

## Debugging

### View Workflow Logs

1. Go to repository → Actions tab
2. Click on workflow run
3. Click on job to expand
4. View detailed logs

### Enable Debug Logging

Add to secrets:
```
ACTIONS_STEP_DEBUG: true
```

### Re-run Failed Workflows

1. Go to Actions tab
2. Click failed workflow
3. Click "Re-run jobs" button
4. Select "Re-run failed jobs"

## Security

- Secrets are encrypted and never logged
- AWS credentials expire after workflow completes
- Each workflow run has unique execution context
- Code is checked before deployment

## Troubleshooting

### Workflow Didn't Trigger

**Application changes** (multi-env-deploy.yml):
- ✅ Did you modify files in `app/`, `lib/`, `public/`, or package files?
- ✅ Did you push to `main` or `develop` branch?
- ✅ Check GitHub Actions tab for error messages

**Infrastructure changes** (terraform.yml):
- ✅ Did you modify files in `terraform/` directory?
- ✅ Did you push to `main` or `develop` branch?
- ✅ Check GitHub Actions tab for error messages

### Build Fails

1. Check GitHub Actions logs for error details
2. Verify `npm run build` works locally:
   ```bash
   npm ci
   npm run build
   ```
3. Check for missing dependencies or syntax errors

### Terraform Apply Fails

1. Check Terraform plan output in workflow logs
2. Verify AWS credentials in GitHub secrets
3. Check IAM permissions for AWS user
4. Review error message in workflow summary

### Deployment to S3 Fails

1. Verify S3 bucket names in GitHub secrets
2. Check AWS IAM user has s3:* permissions
3. Confirm CloudFront distribution IDs if using CDN
4. Check AWS credentials are still valid

### CloudFront Invalidation Fails

1. Verify CloudFront distribution ID is correct
2. Check IAM user has `cloudfront:CreateInvalidation` permission
3. Ensure distribution exists and is active

## Related Documentation

- [WORKFLOW_SEPARATION.md](../../WORKFLOW_SEPARATION.md) - Detailed workflow separation documentation
- [QUICK_START.md](../../QUICK_START.md) - Quick reference for deployments
- [DEPLOYMENT.md](../../DEPLOYMENT.md) - Complete deployment guide
- [terraform/README.md](../../terraform/README.md) - Terraform configuration details
