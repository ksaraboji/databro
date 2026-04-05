# Databro

Databro is a Next.js application with client-side data tools and multi-cloud deployment workflows.

## Overview

- Frontend: Next.js 16 + React 19 + TypeScript
- UI: Tailwind CSS v4 + Framer Motion + Lucide icons
- Data tooling: DuckDB WASM, Apache Arrow, Parquet utilities, PDF/image utilities
- Infrastructure as Code: Terraform for AWS and Azure
- CI/CD: GitHub Actions for infra deployment, app deployment, and service image builds

## Repository Structure

```text
databro/
├── app/                    # Next.js App Router pages and routes
├── components/             # Shared React UI components
├── lib/                    # App utilities and integration helpers
├── public/                 # Static assets
├── services/               # Containerized backend services (api_gateway, llm, rag, speech)
├── terraform/              # Terraform code for AWS and Azure
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

- `services/api_gateway`, `services/llm`, `services/rag`, and `services/speech` are built as container images
- Images are pushed to Azure Container Registry (ACR)
- Workflows deploy to Azure Container Apps
- Terraform in `terraform/azure` provisions infra

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

## Additional References

- [terraform/README.md](terraform/README.md)
- [.github/workflows/README.md](.github/workflows/README.md)
- [Next.js Documentation](https://nextjs.org/docs)

