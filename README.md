This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

A modern data engineer portfolio with responsive design, smooth animations, and cloud infrastructure.

## 🚀 Features

- **Next.js 16** - React framework for production
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first CSS framework
- **Framer Motion** - Smooth animations
- **Lucide Icons** - Beautiful icon library
- **AWS Infrastructure** - S3 + CloudFront deployment
- **Terraform IaC** - Infrastructure as Code
- **GitHub Actions CI/CD** - Automated build and deploy

## 📂 Project Structure

```
databro/
├── app/                    # Next.js app directory
├── lib/                    # Utility functions
├── public/                 # Static assets
├── terraform/              # Infrastructure as Code (Terraform)
├── .github/workflows/      # CI/CD workflows (GitHub Actions)
├── DEPLOYMENT.md           # Deployment guide
└── package.json            # Dependencies
```

## 🛠️ Getting Started

### Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Production Build

```bash
npm run build
npm start
```

## 🚀 Deployment

### Option 1: Automated with GitHub Actions

1. Push to `main` branch
2. GitHub Actions automatically:
   - Builds the Next.js app
   - Deploys to S3
   - Invalidates CloudFront cache

### Option 2: Manual Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions on:

- Setting up Terraform
- Configuring AWS credentials
- Deploying infrastructure
- Managing S3 and CloudFront

### Quick Deployment Steps

1. **Setup Infrastructure**:

   ```bash
   cd terraform
   terraform init
   terraform plan
   terraform apply
   ```

2. **Build and Deploy**:
   ```bash
   npm run build
   aws s3 sync .next s3://your-bucket-name/ --delete
   ```

## 📋 Terraform & Infrastructure

Infrastructure setup with Terraform includes:

- **S3 Bucket** - Static file hosting with encryption and versioning
- **CloudFront** - CDN for faster content delivery
- **Access Logging** - Monitor and audit S3 access
- **Security** - Public access blocked, HTTPS enforced

See [terraform/README.md](terraform/README.md) for detailed infrastructure documentation.

## 🔄 CI/CD Workflows

GitHub Actions workflows handle:

- **Build** - Install dependencies, run linter, build Next.js
- **Deploy** - Sync to S3, invalidate CloudFront
- **Infrastructure** - Terraform plan and apply

See [.github/workflows/README.md](.github/workflows/README.md) for workflow documentation.

## 🔐 Environment Variables

Required for deployment:

```bash
AWS_ACCESS_KEY_ID          # AWS IAM access key
AWS_SECRET_ACCESS_KEY      # AWS IAM secret key
S3_BUCKET_NAME             # Target S3 bucket
CLOUDFRONT_DISTRIBUTION_ID # CloudFront distribution ID (optional)
```

## 📚 Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md) - Infrastructure and deployment guide
- [terraform/README.md](terraform/README.md) - Terraform configuration guide
- [.github/workflows/README.md](.github/workflows/README.md) - CI/CD workflows guide
- [Next.js Documentation](https://nextjs.org/docs) - Learn about Next.js
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest) - Infrastructure as Code

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
