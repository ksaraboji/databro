# Terraform Infrastructure

This folder contains two independent Terraform stacks:

- `terraform/aws` for web hosting infrastructure (S3 + CloudFront)
- `terraform/azure` for backend/service infrastructure

## Folder Layout

```text
terraform/
├── aws/
│   ├── backend-dev.hcl
│   ├── backend-prod.hcl
│   ├── dev.tfvars
│   ├── prod.tfvars
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── s3.tf
│   ├── cloudfront.tf
│   └── acm.tf
└── azure/
    ├── backend-dev.hcl
    ├── backend-prod.hcl
    ├── dev.tfvars
    ├── prod.tfvars
    ├── main.tf
    ├── variables.tf
    ├── outputs.tf
    ├── aca_apps.tf
    ├── aca_env.tf
    ├── acr.tf
    ├── cosmosdb.tf
    └── storage.tf
```

## Prerequisites

- Terraform >= 1.5
- AWS CLI configured (for AWS stack)
- Azure CLI configured (for Azure stack)

## AWS Stack (`terraform/aws`)

### Typical Workflow

```bash
cd terraform/aws
terraform fmt -check -recursive
terraform init -backend-config=backend-dev.hcl
terraform validate
terraform plan -var-file=dev.tfvars -input=false
terraform apply -var-file=dev.tfvars -input=false
```

Use production backend/vars on `main`:

```bash
terraform init -reconfigure -backend-config=backend-prod.hcl
terraform plan -var-file=prod.tfvars -input=false
terraform apply -var-file=prod.tfvars -input=false
```

### Main Outputs Used by App Deploy

- `s3_bucket_name`
- `cloudfront_distribution_id`
- `cloudfront_domain_name`

## Azure Stack (`terraform/azure`)

### Typical Workflow

```bash
cd terraform/azure
terraform fmt -check -recursive
terraform init -backend-config=backend-dev.hcl
terraform validate
terraform plan -var-file=dev.tfvars -input=false
terraform apply -var-file=dev.tfvars -input=false
```

Use production backend/vars on `main`:

```bash
terraform init -reconfigure -backend-config=backend-prod.hcl
terraform plan -var-file=prod.tfvars -input=false
terraform apply -var-file=prod.tfvars -input=false
```

### Typical Resources Managed

- Azure Container Apps environment
- Azure Container Registry
- Cosmos DB
- Storage account(s)
- Supporting networking/config resources

## State and Environment Conventions

- `develop` branch -> dev backend/vars
- `main` branch -> prod backend/vars
- Keep backend and tfvars pairs aligned (`backend-dev.hcl` + `dev.tfvars`, etc.)

## Common Commands

### Show current outputs

```bash
terraform output -no-color
```

### Plan destroy (safety preview)

```bash
terraform plan -destroy -var-file=dev.tfvars -input=false
```

### Targeted import (manual scenarios)

```bash
terraform import <resource_address> <cloud_resource_id>
```

## CI/CD Integration

Terraform is automated via GitHub Actions:

- AWS infra: `.github/workflows/deploy-aws-infra.yml`
- Azure infra: `.github/workflows/deploy-azure-infra.yml`
- Manual import helper: `.github/workflows/manual-import.yml`

## Troubleshooting

### Backend init issues

- Verify cloud credentials and permissions.
- Confirm backend config files are valid and reachable.

### Plan/apply drift

- Run `terraform fmt -check -recursive` and `terraform validate`.
- Ensure the correct tfvars file is used for the target environment.

### Unexpected replacements

- Inspect plan carefully for force-recreate attributes.
- Check provider/resource version changes and immutable fields.

## References

- [../README.md](../README.md)
- [../.github/workflows/README.md](../.github/workflows/README.md)
- [Terraform Docs](https://developer.hashicorp.com/terraform/docs)
