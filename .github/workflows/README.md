# GitHub Actions Workflows

This folder contains CI/CD workflows for AWS web deployment, Azure infrastructure, and backend service image deployments.

## Workflow Inventory

### 1. `multi-env-deploy.yml`

Builds and deploys the Next.js web app to AWS.

- Triggers:
   - `push` on `main`/`develop` for app paths
   - `pull_request` for app paths
   - `workflow_call` (used by infra workflow)
- Core jobs:
   - `check-changes`: decides whether dev/prod deploy should run
   - `deploy-dev`: build + deploy to dev S3 + CloudFront invalidation
   - `deploy-prod`: build + deploy to prod S3 + CloudFront invalidation

### 2. `deploy-aws-infra.yml`

Runs Terraform for AWS infrastructure in `terraform/aws`.

- Triggers:
   - `push`/`pull_request` on `main`/`develop` for `terraform/aws/**`
- Core jobs:
   - `terraform-dev`: fmt/validate/plan/apply (develop)
   - `terraform-prod`: fmt/validate/plan/apply (main)
   - `call-deploy-dev` and `call-deploy-prod`: call `multi-env-deploy.yml` after successful infra deploy

### 3. `deploy-azure-infra.yml`

Runs Terraform for Azure infrastructure in `terraform/azure`.

- Triggers:
   - `push`/`pull_request` on `main`/`develop` for `terraform/azure/**`
- Core jobs:
   - `terraform-dev`: fmt/validate/plan/apply using `backend-dev.hcl` and `dev.tfvars`
   - `terraform-prod`: fmt/validate/plan/apply using `backend-prod.hcl` and `prod.tfvars`

### 4. Service Build/Deploy Workflows

- `build-api-gateway.yml`
- `build-llm-service.yml`
- `build-rag-service.yml`
- `build-speech-service.yml`

Common behavior:

- Trigger on `push` to `main`/`develop` when service-specific paths change
- Azure login via service principal secrets
- Build and push image to env-specific ACR (`databro{env}acr.azurecr.io/...`)
- Deploy/update Azure Container App

### 5. `manual-import.yml`

Manual utility workflow for Terraform import in Azure (`workflow_dispatch` only).

## Execution Strategy

- App-only changes:
   - `multi-env-deploy.yml` runs directly.
- AWS infra-only changes:
   - `deploy-aws-infra.yml` runs; on success it calls `multi-env-deploy.yml`.
- Mixed app + AWS infra changes:
   - app workflow defers direct deploy path when both change in push; infra workflow then calls app deployment.

This avoids deploying app changes before infrastructure is ready.

## Required Secrets

### AWS

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

Optional fallback values used by web deploy workflow:

- `DEV_S3_BUCKET_NAME`
- `DEV_CLOUDFRONT_DISTRIBUTION_ID`
- `PROD_S3_BUCKET_NAME`
- `PROD_CLOUDFRONT_DISTRIBUTION_ID`
- `PROD_CLOUDFRONT_DOMAIN`

### Azure

- `ARM_CLIENT_ID`
- `ARM_CLIENT_SECRET`
- `ARM_SUBSCRIPTION_ID`
- `ARM_TENANT_ID`

### Service/API Keys (used in service deploys)

- `HF_API_KEY`
- `GROQ_API_KEY`
- `YOUTUBE_API_KEY`
- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_ACCOUNT_ID`
- `DEVTO_API_KEY`

## Branch to Environment Mapping

- `develop` -> dev
- `main` -> prod

This mapping is used consistently in both infra and service workflows.

## Troubleshooting Checklist

### Workflow did not trigger

- Confirm branch is `main` or `develop`.
- Confirm changed files match each workflow `paths` filter.
- Check if the run was skipped due to change-detection logic.

### Terraform issues

- Verify backend config files and tfvars exist for target environment.
- Verify cloud credentials and permissions.
- Re-run fmt/validate/plan locally in matching terraform folder.

### App deploy issues (AWS)

- Verify `out/` build artifacts exist in workflow run.
- Confirm resolved S3 bucket and CloudFront distribution IDs.
- Validate AWS IAM permissions for S3 sync and CloudFront invalidation.

### Service deploy issues (Azure)

- Verify ACR name and resource group follow env naming pattern.
- Confirm image tag exists in ACR.
- Inspect Container App deploy step logs for runtime/config errors.

## Related References

- [../../README.md](../../README.md)
- [../../terraform/README.md](../../terraform/README.md)
