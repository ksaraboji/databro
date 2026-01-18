# GitHub Actions Workflow Separation

## Overview

The CI/CD workflows are now completely separated into two distinct paths:

1. **Terraform Infrastructure Deployment** (`terraform.yml`)
2. **Application Build and Deploy** (`multi-env-deploy.yml`)

This separation provides cleaner, faster, and more maintainable workflows.

---

## 🏗️ Terraform Infrastructure Deployment

**File**: `.github/workflows/terraform.yml`

### Purpose
Manages AWS infrastructure (S3 buckets, CloudFront, IAM) for both dev and prod environments.

### Trigger Events
```yaml
on:
  push:
    branches:
      - main
      - develop
    paths:
      - 'terraform/**'
      - '.github/workflows/terraform.yml'
  pull_request:
    branches:
      - main
      - develop
    paths:
      - 'terraform/**'
```

**Triggers when:**
- Changes to any file in `terraform/` directory
- Changes to the workflow file itself
- On PRs targeting main or develop

### Workflow Steps

#### Plan Phase (Always runs)
1. ✅ Checkout code
2. ✅ Setup Terraform (v1.6.0)
3. ✅ Configure AWS credentials
4. ✅ Format check
5. ✅ Initialize Terraform
6. ✅ Validate configuration
7. ✅ Plan changes
8. ✅ Comment on PR with plan output (if PR)

#### Apply Phase (Main/Develop only)
- **Dev**: Applies when pushing to `develop` branch
- **Prod**: Applies when pushing to `main` branch

#### Output Phase
- Displays infrastructure outputs in GitHub workflow summary
- Shows deployment status

### Matrix Strategy
Runs for both environments simultaneously:
- `dev` - Uses `terraform/dev.tfvars`
- `prod` - Uses `terraform/prod.tfvars`

### Example Trigger
```bash
# This will trigger terraform.yml workflow
git push origin develop  # Plans/applies dev environment
git push origin main     # Plans/applies prod environment
```

---

## 📦 Application Build and Deploy

**File**: `.github/workflows/multi-env-deploy.yml`

### Purpose
Builds Next.js application and deploys to S3 buckets for dev/prod environments.

### Trigger Events
```yaml
on:
  push:
    branches:
      - main
      - develop
    paths:
      - 'app/**'
      - 'lib/**'
      - 'public/**'
      - 'package.json'
      - 'package-lock.json'
      - 'tsconfig.json'
      - '.github/workflows/multi-env-deploy.yml'
  pull_request:
    branches:
      - main
      - develop
```

**Triggers when:**
- Changes to application code (`app/`, `lib/`, `public/`)
- Changes to dependencies (`package.json`, `package-lock.json`)
- Changes to TypeScript config (`tsconfig.json`)
- Changes to the workflow file itself
- On PRs targeting main or develop

### Workflow Jobs

#### 1. Build Job
**Always runs on PRs and pushes**

Steps:
1. ✅ Checkout code
2. ✅ Setup Node.js 20.x
3. ✅ Install dependencies (`npm ci`)
4. ✅ Run linter (continues on error)
5. ✅ Build Next.js application
6. ✅ Generate build metadata (build ID, git SHA, branch)
7. ✅ Upload artifact (5-day retention)

**Output**: Build artifacts (`.next/`, `public/`)

#### 2. Deploy-Dev Job
**Runs only when pushing to `develop` branch**

Dependencies: Requires `build` job to succeed

Steps:
1. ✅ Checkout code
2. ✅ Setup Node.js 20.x
3. ✅ Install dependencies
4. ✅ Build Next.js application
5. ✅ Configure AWS credentials
6. ✅ Deploy to Dev S3 bucket
   - Static assets: Cache 1 year (immutable)
   - Public files: Cache 1 hour
   - HTML files: No cache (always revalidate)
7. ✅ Invalidate CloudFront cache
8. ✅ Print deployment summary

**Target**: `databro-dev-build-{account-id}` S3 bucket

#### 3. Deploy-Prod Job
**Runs only when pushing to `main` branch**

Dependencies: Requires `build` job to succeed

Environment Protection: GitHub environment `production` (optional approval)

Steps:
1. ✅ Checkout code
2. ✅ Setup Node.js 20.x
3. ✅ Install dependencies
4. ✅ Build Next.js application
5. ✅ Configure AWS credentials
6. ✅ Deploy to Prod S3 bucket
   - Static assets: Cache 1 year (immutable)
   - Public files: Cache 1 hour
   - HTML files: No cache (always revalidate)
7. ✅ Invalidate CloudFront cache
8. ✅ Create GitHub deployment record
9. ✅ Print deployment summary

**Target**: `databro-prod-build-{account-id}` S3 bucket

### Branch-Based Deployment
- **`develop` branch** → Deploy to dev environment
- **`main` branch** → Deploy to prod environment

### Example Trigger
```bash
# This will trigger multi-env-deploy.yml workflow
git push origin develop  # Builds and deploys to dev S3
git push origin main     # Builds and deploys to prod S3
```

---

## 📊 Workflow Separation Benefits

### Performance
| Aspect | Before | After |
|--------|--------|-------|
| Build only changes | Build + Terraform runs | ✅ Only Build runs |
| Terraform only changes | Build + Terraform runs | ✅ Only Terraform runs |
| Parallel execution | Sequential | ✅ Simultaneous |

### Clarity
- ✅ Each workflow has single responsibility
- ✅ Cleaner log output
- ✅ Easier to debug
- ✅ Clear trigger conditions

### Maintenance
- ✅ Easier to update one without affecting the other
- ✅ Simpler to add new jobs
- ✅ Better code organization

### Cost
- ✅ Fewer unnecessary job runs
- ✅ Faster feedback to developers
- ✅ Reduced GitHub Actions minutes

---

## 🔄 Typical Development Workflow

### Scenario 1: Making Application Changes

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make changes to app, lib, or public
# (Changes to infrastructure code NOT included)

# 3. Commit and push to develop
git push origin feature/my-feature
git checkout develop
git merge feature/my-feature
git push origin develop

# Result: ✅ multi-env-deploy.yml runs (build + deploy to dev)
# Result: ❌ terraform.yml does NOT run (not triggered)
```

### Scenario 2: Making Infrastructure Changes

```bash
# 1. Create feature branch
git checkout -b feature/add-s3-policy

# 2. Make changes only to terraform/ directory
# (Changes to app code NOT included)

# 3. Commit and push to develop
git push origin feature/add-s3-policy
git checkout develop
git merge feature/add-s3-policy
git push origin develop

# Result: ❌ multi-env-deploy.yml does NOT run (not triggered)
# Result: ✅ terraform.yml runs (plan + apply dev infrastructure)
```

### Scenario 3: Making Both Changes

```bash
# 1. Create feature branch
git checkout -b feature/new-feature-and-resources

# 2. Make changes to both app code AND terraform/
git push origin feature/new-feature-and-resources
git checkout develop
git merge feature/new-feature-and-resources
git push origin develop

# Result: ✅ multi-env-deploy.yml runs (build + deploy)
# Result: ✅ terraform.yml runs (plan + apply)
# Result: ✅ Both run simultaneously
```

---

## 📋 GitHub Secrets Required

Both workflows need these secrets configured in your GitHub repository:

```
AWS_ACCESS_KEY_ID              # AWS IAM user access key
AWS_SECRET_ACCESS_KEY          # AWS IAM user secret key
DEV_S3_BUCKET_NAME            # Dev bucket: databro-dev-build-{account-id}
DEV_CLOUDFRONT_DISTRIBUTION_ID # Dev CloudFront distribution ID
PROD_S3_BUCKET_NAME           # Prod bucket: databro-prod-build-{account-id}
PROD_CLOUDFRONT_DISTRIBUTION_ID # Prod CloudFront distribution ID
PROD_CLOUDFRONT_DOMAIN        # Prod CloudFront domain for deployment URL
```

**Where to configure:**
GitHub Repo → Settings → Secrets and variables → Actions

---

## 🚀 Deploying Changes

### Development Deployment (Dev)
```bash
# 1. Feature work on develop branch
git checkout develop
git pull origin develop

# 2. Make changes
# Edit app code, lib code, etc.

# 3. Commit and push
git add .
git commit -m "feat: add new feature"
git push origin develop

# 4. GitHub Actions automatically:
#    - Builds application (multi-env-deploy.yml)
#    - Runs linter
#    - Deploys to dev S3 bucket
#    - Invalidates dev CloudFront cache
#    ✅ Dev environment updated in ~5-10 minutes
```

### Production Deployment (Prod)
```bash
# 1. Merge develop to main
git checkout main
git pull origin main
git merge develop
git push origin main

# 2. GitHub Actions automatically:
#    - Builds application (multi-env-deploy.yml)
#    - Runs linter
#    - Deploys to prod S3 bucket
#    - Invalidates prod CloudFront cache
#    - Creates GitHub deployment record
#    - Waits for environment approval (if configured)
#    ✅ Prod environment updated in ~5-10 minutes
```

### Infrastructure Updates
```bash
# 1. Modify Terraform files
git checkout develop
git pull origin develop
git checkout -b feature/infra-update

# 2. Edit terraform/dev.tfvars, terraform/prod.tfvars, or *.tf files
# Example: Increase log retention, add new S3 bucket, etc.

# 3. Commit and push
git add terraform/
git commit -m "infra: increase log retention to 30 days"
git push origin feature/infra-update

# 4. Create PR to develop
# GitHub shows Terraform plan in PR comments
# Review the planned changes

# 5. Merge PR
git checkout develop
git merge feature/infra-update
git push origin develop

# 6. GitHub Actions automatically:
#    - Runs terraform plan (terraform.yml)
#    - Runs terraform apply for dev (terraform.yml)
#    ✅ Dev infrastructure updated in ~3-5 minutes

# 7. Then merge to main for prod
git checkout main
git merge develop
git push origin main

# 8. GitHub Actions automatically:
#    - Runs terraform plan (terraform.yml)
#    - Runs terraform apply for prod (terraform.yml)
#    ✅ Prod infrastructure updated in ~3-5 minutes
```

---

## 🔍 Monitoring Workflows

### View Workflow Status
1. Go to GitHub repository
2. Click on **Actions** tab
3. See all workflow runs
4. Click on a run to see details

### Filter by Workflow
- **"Terraform Infrastructure Deployment"** - Infrastructure changes
- **"Build and Deploy Application"** - Application changes

### View Logs
Each job shows detailed logs of every step. Click on a step to expand:
- **Setup steps**: Show environment information
- **Build step**: Shows compilation errors/warnings
- **Deploy step**: Shows S3 sync output
- **Summary**: Shows final status

---

## 🆘 Troubleshooting

### Build Workflow Didn't Trigger
**Check**: Did you modify files in `app/`, `lib/`, `public/`, or package files?

If yes, but workflow didn't run:
1. Push to `develop` or `main` branch (not feature branch)
2. Check GitHub Actions tab for any error messages
3. Verify branch protection rules aren't blocking

### Terraform Workflow Didn't Trigger
**Check**: Did you modify files in `terraform/` directory?

If yes, but workflow didn't run:
1. Push to `develop` or `main` branch (not feature branch)
2. Check GitHub Actions tab for any error messages
3. Verify branch protection rules aren't blocking

### Both Workflows Triggered
This is expected! If you changed both app code and infrastructure, both should run.

### Deployment Failed - AWS Credentials
**Error**: `An error occurred (InvalidUserID.NotFound) when calling...`

**Fix**:
1. Check GitHub secrets are configured correctly
2. Verify AWS IAM user has necessary permissions:
   - `s3:*` for S3 buckets
   - `cloudfront:CreateInvalidation` for CloudFront
3. Check AWS credentials aren't expired

### Deployment Failed - S3 Bucket Not Found
**Error**: `An error occurred (NoSuchBucket) when calling...`

**Fix**:
1. Verify `DEV_S3_BUCKET_NAME` and `PROD_S3_BUCKET_NAME` secrets are correct
2. Check buckets exist in AWS:
   ```bash
   aws s3 ls | grep databro
   ```
3. Verify bucket names match Terraform outputs
4. Check GitHub secrets spelling (case-sensitive)

### Deployment Failed - CloudFront Not Found
**Error**: `An error occurred (InvalidArgument)...`

**Fix**:
1. Verify `DEV_CLOUDFRONT_DISTRIBUTION_ID` and `PROD_CLOUDFRONT_DISTRIBUTION_ID` are correct
2. Check distribution IDs exist in AWS:
   ```bash
   aws cloudfront list-distributions
   ```
3. Verify GitHub secrets are correct and not empty

---

## 📚 Related Documentation

- [QUICK_START.md](QUICK_START.md) - Quick reference for deployment
- [DEPLOYMENT.md](DEPLOYMENT.md) - Comprehensive deployment guide
- [MULTI_ENVIRONMENT_SETUP.md](MULTI_ENVIRONMENT_SETUP.md) - Multi-environment architecture
- [terraform/README.md](terraform/README.md) - Terraform configuration details
- [.github/workflows/README.md](.github/workflows/README.md) - Original workflow documentation

---

## Summary

The workflow separation provides:
- ✅ **Clarity**: Clear responsibility for each workflow
- ✅ **Performance**: Only relevant workflows trigger
- ✅ **Maintainability**: Easier to update without side effects
- ✅ **Debugging**: Clearer logs and error messages
- ✅ **Cost**: Fewer unnecessary job runs

**Remember:**
- **terraform.yml** → Infrastructure only (AWS resources)
- **multi-env-deploy.yml** → Application only (Build & deploy)
