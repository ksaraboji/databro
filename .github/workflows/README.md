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
- **Workflow trigger**: After successful Terraform Infrastructure Deployment workflow (depends on infrastructure being ready)

**Jobs**:
1. **get-terraform-outputs** (runs on all triggers)
   - Initializes Terraform and retrieves infrastructure identifiers
   - Extracts: S3 bucket names, CloudFront distribution IDs, CloudFront domains
   - Outputs are used by deploy jobs (with fallback to optional secrets)

2. **build** (runs on all triggers)
   - Installs dependencies
   - Runs linter
   - Builds Next.js application
   - Generates build metadata
   - Uploads artifacts (5-day retention)

3. **deploy-dev** (runs on push to develop with app-only changes OR after successful terraform on develop)
   - Builds Next.js application
   - Configures AWS credentials
   - Syncs to dev S3 bucket (from Terraform outputs)
   - Invalidates dev CloudFront cache

4. **deploy-prod** (runs on push to main with app-only changes OR after successful terraform on main)
   - Builds Next.js application
   - Configures AWS credentials
   - Syncs to prod S3 bucket (from Terraform outputs)
   - Invalidates prod CloudFront cache
   - Creates GitHub deployment record

**Features**:
- ✅ Separate dev and prod deployments
- ✅ Intelligent cache control (static files: 1 year, HTML: no cache)
- ✅ CloudFront invalidation
- ✅ Build artifact retention
- ✅ Deployment summaries
- ✅ **Dynamic Terraform outputs extraction** (no manual secret management for bucket names, CloudFront IDs)
- ✅ Graceful fallback to optional secrets if Terraform outputs unavailable
- ✅ Runs on app-only changes WITHOUT waiting for Terraform
- ✅ Skips deployment if Terraform fails (safety check)

## Workflow Execution Strategy

| Scenario | Terraform.yml | Multi-env-deploy.yml | Note |
|----------|---|---|---|
| **App-only changes** | Doesn't run | ✅ Runs immediately | No infrastructure wait, faster deployments |
| **Terraform-only changes** | ✅ Runs | Runs only if TF succeeds | Only rebuild if needed |
| **Both changes** | ✅ Runs → | ✅ Runs after TF succeeds | Infrastructure first, then deploy |
| **Terraform fails** | ❌ Fails | ❌ Skips deployment | Safety check, prevents broken deploys |

## Performance Improvement

```
Old Approach:        Terraform + Build + Deploy (sequential)
New Approach:        
  - App changes:     Build + Deploy (fast!)
  - TF changes:      Terraform → Build + Deploy (if TF succeeds)
  - Both changes:    Terraform (parallel) Build + Deploy (sequential)
```

## Required Secrets

Configure these in GitHub repository settings:

### Required (for AWS access)
```
AWS_ACCESS_KEY_ID              # AWS IAM access key
AWS_SECRET_ACCESS_KEY          # AWS IAM secret key
```

### Optional (fallback only, normally obtained from Terraform)
```
DEV_S3_BUCKET_NAME            # Dev bucket name (auto-fetched from Terraform)
DEV_CLOUDFRONT_DISTRIBUTION_ID # Dev CloudFront ID (auto-fetched from Terraform)
PROD_S3_BUCKET_NAME           # Prod bucket name (auto-fetched from Terraform)
PROD_CLOUDFRONT_DISTRIBUTION_ID # Prod CloudFront ID (auto-fetched from Terraform)
PROD_CLOUDFRONT_DOMAIN        # Prod CloudFront domain (auto-fetched from Terraform)
```

**Note**: The optional secrets serve as fallback if Terraform outputs retrieval fails. For new setups, only the required AWS credentials are needed.

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

**Application-only changes** (fast path):
```bash
git push origin develop  # Builds and deploys to dev S3 immediately
git push origin main     # Builds and deploys to prod S3 immediately
```

**Infrastructure changes** (with dependency):
```bash
git push origin develop  # Plans/applies dev infrastructure → builds & deploys app
git push origin main     # Plans/applies prod infrastructure → builds & deploys app
```

**Both app and infrastructure changes**:
- Infrastructure deploys first (Terraform)
- Application builds and deploys only if infrastructure succeeds
- Ensures infrastructure exists before deploying app

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
- ℹ️ If Terraform workflow ran, app deployment waits for it to succeed (watch status)

**Infrastructure changes** (terraform.yml):
- ✅ Did you modify files in `terraform/` directory?
- ✅ Did you push to `main` or `develop` branch?
- ✅ Check GitHub Actions tab for error messages

**After Terraform completes**:
- ✅ Multi-env-deploy.yml runs automatically if Terraform succeeded
- ⚠️ If Terraform failed, deployment is skipped (safety feature)
- ✅ Check "Workflow runs" to see if application deployment triggered

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

1. Verify Terraform outputs were retrieved successfully (check get-terraform-outputs job logs)
2. If using fallback secrets, verify S3 bucket names are correct in GitHub secrets
3. Check AWS IAM user has `s3:*` permissions
4. Confirm CloudFront distribution IDs if using CDN
5. Check AWS credentials are still valid

### Get Terraform Outputs Fails

1. Verify Terraform state file exists in S3 (databro-tf-state bucket)
2. Check AWS credentials in GitHub secrets (used for Terraform state access)
3. Verify DynamoDB table exists for state locking (terraform-locks)
4. Ensure Terraform backend is properly configured (backend-dev.hcl / backend-prod.hcl)
5. Check Terraform syntax and outputs.tf file definitions

If outputs fail consistently:
- Deployment continues using optional fallback secrets (if configured)
- Manually configure the optional secrets as backup
- Review Terraform state for infrastructure existence

### CloudFront Invalidation Fails

1. Verify CloudFront distribution ID is correct
2. Check IAM user has `cloudfront:CreateInvalidation` permission
3. Ensure distribution exists and is active

## Related Documentation

- [WORKFLOW_SEPARATION.md](../../WORKFLOW_SEPARATION.md) - Detailed workflow separation documentation
- [QUICK_START.md](../../QUICK_START.md) - Quick reference for deployments
- [DEPLOYMENT.md](../../DEPLOYMENT.md) - Complete deployment guide
- [terraform/README.md](../../terraform/README.md) - Terraform configuration details
