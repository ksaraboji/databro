# Databro

Databro is a Next.js application with client-side data tools and multi-cloud deployment workflows.

## Overview

- Frontend: Next.js 16 + React 19 + TypeScript
- UI: Tailwind CSS v4 + Framer Motion + Lucide icons
- Data tooling: DuckDB WASM, Apache Arrow, Parquet utilities, PDF/image utilities
- Infrastructure as Code: Terraform for AWS, Azure, and GCP
- CI/CD: GitHub Actions for infra deployment, app deployment, and service image builds

## Repository Structure

```text
databro/
├── app/                    # Next.js App Router pages and routes
├── components/             # Shared React UI components
├── lib/                    # App utilities and integration helpers
├── public/                 # Static assets
├── services/               # Containerized backend services (api_gateway, ai, llm, rag, speech)
├── terraform/              # Terraform code for AWS, Azure, and GCP
├── tests/                  # Test scripts and manual test assets
├── .github/workflows/      # CI/CD and infra workflows
└── package.json            # Project scripts and dependencies
```

## Local Development

### Prerequisites

- Node.js 20+
- npm 10+

### Install Dependencies

```bash
npm ci
```

### Start Dev Server

```bash
npm run dev
```

Open http://localhost:3000.

### Lint and Build

```bash
npm run lint
npm run build
npm start
```

## Deployment Model

### Web App (AWS)

- Static export/build artifacts are deployed to S3
- CloudFront serves content and handles cache invalidation
- Terraform in `terraform/aws` provisions infra

### Backend Services (Azure)

- `services/api_gateway` remains the legacy Azure-facing backend container
- `services/ai` is the GCP-specific backend container
- `services/llm`, `services/rag`, and `services/speech` are built as container images
- Images are pushed to Azure Container Registry (ACR)
- Workflows deploy to Azure Container Apps
- Terraform in `terraform/azure` provisions infra

### Agentic Backend (GCP)

- Agent backend container is stored in Google Artifact Registry
- Cloud Run serves the backend runtime
- Terraform in `terraform/gcp` provisions Artifact Registry, Cloud Run, and IAM
- Next.js should call Supabase Edge Functions, which then call Cloud Run

### Supabase Edge Function

- `supabase/functions/ask-data-dev/index.ts` and `supabase/functions/ask-data-prod/index.ts` proxy multipart uploads to Cloud Run
- The dev function reads `CLOUDRUN_BASE_URL_DEV`; the prod function reads `CLOUDRUN_BASE_URL_PROD`
- The frontend resolves `NEXT_PUBLIC_SUPABASE_EDGE_FUNCTION_URL` to the `ask-data-dev` or `ask-data-prod` invoke URL based on the site hostname
- The function forwards `POST /v1/ask-data` requests from the frontend to the GCP backend

### Supabase Deployment Workflow

- `.github/workflows/deploy-supabase.yml` deploys the `ask-data-dev` and `ask-data-prod` edge functions
- It uses your existing Supabase account through `SUPABASE_ACCESS_TOKEN`
- Required GitHub secrets:
	- `SUPABASE_ACCESS_TOKEN`
	- `SUPABASE_PROJECT_REF`
	- `CLOUDRUN_BASE_URL_DEV`
	- `CLOUDRUN_BASE_URL_PROD`

## Branch and Environment Mapping

- `develop` -> dev environment
- `main` -> prod environment

This mapping is used by infra and deployment workflows.

## CI/CD Workflows

Primary workflows are in `.github/workflows`:

- `deploy-aws-infra.yml` - Terraform plan/apply for AWS infra and optional app deploy chaining
- `multi-env-deploy.yml` - Next.js build and deploy to AWS (dev/prod)
- `deploy-azure-infra.yml` - Terraform plan/apply for Azure infra
- `build-api-gateway.yml` - Build/push/deploy API Gateway service
- `build-llm-service.yml` - Build/push/deploy LLM service
- `build-rag-service.yml` - Build/push/deploy RAG service
- `build-speech-service.yml` - Build/push/deploy Speech service
- `deploy-gcp-infra.yml` - Terraform plan/apply for GCP backend infra
- `build-agent-backend-gcp.yml` - Build/push/deploy agent backend image to Artifact Registry + Cloud Run update
- `manual-import.yml` - Manual Terraform import helper (Azure)

## Required Secrets

### AWS-related

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

### Azure-related

- `ARM_CLIENT_ID`
- `ARM_CLIENT_SECRET`
- `ARM_SUBSCRIPTION_ID`
- `ARM_TENANT_ID`

### Service-specific (as used by workflows)

- `HF_API_KEY`
- `GROQ_API_KEY`
- `YOUTUBE_API_KEY`
- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_ACCOUNT_ID`
- `DEVTO_API_KEY`

### GCP-related

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

### Supabase-related

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_EDGE_FUNCTION_URL` should point to the base Supabase invoke URL, for example `https://<project-ref>.supabase.co/functions/v1`

## Additional References

- [terraform/README.md](terraform/README.md)
- [.github/workflows/README.md](.github/workflows/README.md)
- [Next.js Documentation](https://nextjs.org/docs)

