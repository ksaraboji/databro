# GitHub Actions Workflows

This folder contains CI/CD workflows for AWS web deployment, Azure infrastructure, and backend service image deployments.

It also includes GCP workflows for Artifact Registry + Cloud Run backend deployment.

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

### 4. `deploy-gcp-infra.yml`

Runs Terraform for GCP infrastructure in `terraform/gcp`.

- Triggers:
   - `push`/`pull_request` on `main`/`develop` for `terraform/gcp/**`
   - `workflow_dispatch` (manual target env and optional image override)
- Core jobs:
   - `terraform-dev`: fmt/validate/plan/apply for `develop` and PRs
   - `terraform-prod`: fmt/validate/plan/apply for `main`

### 5. `build-agent-backend-gcp.yml`

Builds and pushes the agent backend container to Google Artifact Registry and applies Terraform to update Cloud Run image.

- Trigger:
   - `push` on `main`/`develop` for `services/api_gateway/**`
   - `workflow_dispatch`
- Core behavior:
   - Auth to GCP using Workload Identity Federation
   - Build/push image from `services/ai` to `REGION-docker.pkg.dev/<project>/databro-<env>-agent/agent-backend`
   - Terraform apply in `terraform/gcp` with the new image URI

### 6. Azure Service Build/Deploy Workflows

- `build-api-gateway.yml`
- `build-llm-service.yml`
- `build-rag-service.yml`
- `build-speech-service.yml`

Common behavior:

- Trigger on `push` to `main`/`develop` when service-specific paths change
- Azure login via service principal secrets
- Build and push image to env-specific ACR (`databro{env}acr.azurecr.io/...`)
- Deploy/update Azure Container App

### 7. `manual-import.yml`

Manual utility workflow for Terraform import in Azure (`workflow_dispatch` only).

### 8. `upload-tool-search-manifest.yml`

Builds and uploads tool-search artifacts to AWS S3.

- Triggers:
   - `push` on `develop`/`main` when tool-search source/build/upload files change
   - `workflow_dispatch` with an explicit `environment` input (`dev` or `prod`)
- Behavior:
   - Builds manifest artifacts via `npm run build:tool-search-manifest`
   - Uploads only `parquet,csv` formats via `npm run upload:tool-search-manifest`
   - Resolves target bucket based on environment (`develop`->dev, `main`->prod)

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
- `AWS_REGION` (optional; defaults to `us-east-2` in manifest upload workflow)

Optional fallback values used by web deploy workflow:

- `DEV_S3_BUCKET_NAME`
- `DEV_CLOUDFRONT_DISTRIBUTION_ID`
- `PROD_S3_BUCKET_NAME`
- `PROD_CLOUDFRONT_DISTRIBUTION_ID`
- `PROD_CLOUDFRONT_DOMAIN`

Required by `upload-tool-search-manifest.yml`:

- `DEV_S3_BUCKET_NAME`
- `PROD_S3_BUCKET_NAME`

### Azure

- `ARM_CLIENT_ID`
- `ARM_CLIENT_SECRET`
- `ARM_SUBSCRIPTION_ID`
- `ARM_TENANT_ID`

### GCP

- `GCP_PROJECT_ID_DEV`
- `GCP_PROJECT_ID_PROD`
- `GCP_WIF_PROVIDER_DEV`
- `GCP_WIF_PROVIDER_PROD`
- `GCP_SERVICE_ACCOUNT_EMAIL_DEV`
- `GCP_SERVICE_ACCOUNT_EMAIL_PROD`

GCP GitHub Actions auth uses Workload Identity Federation with:

- Dev workload identity provider: `GCP_WIF_PROVIDER_DEV`
- Prod workload identity provider: `GCP_WIF_PROVIDER_PROD`
- Dev service account: `GCP_SERVICE_ACCOUNT_EMAIL_DEV`
- Prod service account: `GCP_SERVICE_ACCOUNT_EMAIL_PROD`
- Repository principal for `roles/iam.workloadIdentityUser`: `principalSet://iam.googleapis.com/projects/830624303497/locations/global/workloadIdentityPools/github-actions-pool/attribute.repository/ksaraboji/databro`

### Supabase

- `NEXT_PUBLIC_SUPABASE_EDGE_FUNCTION_URL_DEV`
- `NEXT_PUBLIC_SUPABASE_EDGE_FUNCTION_URL_PROD`

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
