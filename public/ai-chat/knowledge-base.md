# Databro AI Chat Knowledge Base

## Site Owner and Purpose
Tags: owner, about, portfolio, creator, purpose

Kumar Saraboji is a Data Engineer and the creator of Databro.
Kumar Saraboji specialises in data engineering, cloud automation, AI integration, and end-to-end serverless architecture.
Databro is a portfolio and tooling site created by Kumar Saraboji.
It showcases practical engineering work across data engineering, cloud automation, and AI integration.
The goal is to provide useful browser-first tools, practical GenAI tools and utilities, and demonstrate end-to-end implementation quality.

## AI Chatbot Runtime
Tags: ai-chatbot, chatbot-model, inference-model, webllm, llama, minilm, rag-retrieval, web-worker, browser-inference, embeddings-model, llm-widget

Yes, RAG (retrieval-augmented generation) is implemented in the chatbot.
The chatbot widget runs entirely in the browser using a web worker with local retrieval-augmented generation.
Generation model: WebLLM with Llama-3.2-1B-Instruct (quantized, runs locally in browser, no server calls).
Embeddings model: Xenova all-MiniLM-L6-v2 for semantic similarity scoring.
Re-ranker model: Xenova mMiniLMv2-L12-H384-uncased for cross-encoder relevance re-ranking.
Retrieval uses hybrid scoring (semantic + sparse BM25), then cross-encoder re-ranking, confidence gating, and bounded context assembly.
Responses are grounded to retrieved chunks and paired with citations.

## AI Chatbot Model Names (Exact)
Tags: model-names, exact-model-identifiers, chatbot-model-names, llm-names, embeddings-model-names, answer-short

Exact model names used by the chatbot widget: Llama-3.2-1B-Instruct (generation via WebLLM), all-MiniLM-L6-v2 (semantic embeddings via Xenova), and mMiniLMv2-L12-H384-uncased (cross-encoder re-ranker via Xenova).

## AI Chatbot Architecture
Tags: ai-chatbot-architecture, chatbot-design, rag-pipeline, browser-ai, local-inference, web-worker, knowledge-base, embeddings, bm25, reranker, grounding

The AI chatbot assistant is fully browser-local with no server-side inference.
It is built as a Next.js React widget backed by a Web Worker so AI processing never blocks the UI.

Pipeline summary: the user question goes through hybrid retrieval (dense semantic search + sparse BM25), then cross-encoder re-ranking, then confidence gating, then context assembly, and finally local LLM generation.

Step 1 — Knowledge Base: a curated Markdown knowledge base (knowledge-base.md) is pre-chunked and embedded at build time into a vector artifact (knowledge-base-vectors.json) shipped with the app.

Step 2 — Hybrid Retrieval: on each query, the embedder (all-MiniLM-L6-v2) encodes the question and scores all KB chunks using a weighted combination of dense cosine similarity and sparse BM25 keyword scoring.

Step 3 — Re-ranking: the top hybrid candidates are re-scored by a cross-encoder (mMiniLMv2-L12-H384-uncased) for precise relevance ordering.

Step 4 — Confidence Gating: chunks below the confidence threshold are dropped so only grounded context reaches the model.

Step 5 — Generation: the top chunks are assembled into a bounded context and passed to Llama-3.2-1B-Instruct running locally via WebLLM. The model generates a grounded response streamed token by token to the UI.

Step 6 — Post-processing: the raw model output is stripped of citation artifacts, deduplicated, and cleaned before display.

The chatbot uses no API keys, no backend calls, and no cloud inference. All models run in the browser using ONNX Runtime Web (WASM) for embeddings and re-ranker, and WebGPU/WASM for LLM generation.

## Tech Stack (Exact Summary)
Tags: tech-stack-exact, full-stack-summary, frontend-stack, backend-stack, infra-stack, answer-short

Databro tech stack summary: frontend uses Next.js, React, TypeScript, Tailwind CSS, and Framer Motion; backend uses Python FastAPI microservices with Uvicorn in containers; infrastructure and deployment use Terraform across AWS and Azure with GitHub Actions.

## Libraries vs Languages (Canonical Fact)
Tags: library-vs-language, disambiguation, canonical

Libraries and packages are different from programming languages.
If the question asks for libraries, answer with package/library names only and do not list languages.

## Hosting and Infrastructure
Tags: hosting, hosted, infra, aws, azure, terraform, cloudfront, s3, container apps

The site is hosted on AWS for frontend delivery (S3 + CloudFront) and Azure for backend services (Azure Container Apps).
The web frontend is hosted on AWS using S3 for static assets and CloudFront as CDN.
Backend services are deployed on Azure Container Apps and packaged through Azure Container Registry.
Infrastructure for both AWS and Azure is managed with Terraform.
Cloud providers used in this project: AWS and Azure.

## Architecture
Tags: architecture, system-design, microservices, browser-first, privacy

Architecture summary: frontend-first system with browser-local processing for many tools, plus backend microservices for AI and API workflows.

Frontend architecture: Next.js App Router with React and TypeScript, where many utilities execute directly in the browser using Web Workers and browser APIs.

Backend architecture: API gateway + specialized microservices (RAG, LLM, speech) running in containers on Azure Container Apps.

Integration path: browser-first tools stay local when possible; backend-required features call the API gateway.

## CI/CD and Delivery
Tags: cicd, github-actions, deployment, workflows, automation

CI/CD is automated with GitHub Actions.
Workflows cover AWS Terraform, Azure Terraform, web build and deploy, and backend image build and deploy.
Code deployment is handled by GitHub Actions workflows that deploy the frontend to AWS and backend services to Azure Container Apps.

## GitHub Actions Workflow Inventory
Tags: github-actions, workflow-inventory, cicd, automation, deploy-pipeline

### Application Deployment Workflows
- `multi-env-deploy.yml`: builds and deploys the Next.js app to AWS for `develop` and `main`, including S3 sync and CloudFront invalidation.

### Infrastructure Workflows
- `deploy-aws-infra.yml`: runs Terraform for AWS infrastructure in `terraform/aws` and can trigger app deployment after infra changes.
- `deploy-azure-infra.yml`: runs Terraform for Azure infrastructure in `terraform/azure` for dev and prod environments.

### Backend Service Build and Deploy Workflows
- `build-api-gateway.yml`: builds, pushes, and deploys the API Gateway container to Azure Container Apps.
- `build-rag-service.yml`: builds, pushes, and deploys the RAG service container.
- `build-llm-service.yml`: builds, pushes, and deploys the LLM service container.
- `build-speech-service.yml`: builds, pushes, and deploys the speech service container.

### Utility Workflow
- `manual-import.yml`: manual workflow used for Terraform import operations in Azure.

### Branch and Environment Mapping
- `develop` maps to dev environments.
- `main` maps to prod environments.

### Trigger Patterns
- App workflows trigger on app/frontend file changes.
- AWS and Azure infra workflows trigger on Terraform path changes.
- Backend service workflows trigger on service-specific path changes.
- Pull requests can run validation/plan steps for Terraform workflows.

## AWS Services Used
Tags: aws, cloudfront, s3, acm, route-security, terraform, web-hosting

AWS services used in this project: S3, CloudFront, and ACM.
AWS services provisioned through Terraform include S3, CloudFront, and ACM.
There are no additional AWS services used in this project beyond S3, CloudFront, and ACM.
S3 stores static web assets.
CloudFront serves the site globally with caching and response-header controls.
ACM certificates are used for HTTPS/TLS on the distribution.
CloudFront origin access and bucket policies are configured so static assets are served securely.

## Azure Services Used
Tags: azure, container-apps, acr, cosmosdb, log-analytics, storage, terraform

Exact Azure services list: Container Apps, Container App Environment, Container Registry, Cosmos DB, Storage Account, Storage Container, Log Analytics Workspace, and Resource Groups.
Azure services used in this project: Container Apps, Container App Environment, Container Registry, Cosmos DB, Storage Account, Storage Container, Log Analytics Workspace, and Resource Groups.
Azure services provisioned through Terraform include Container Apps, Container App Environment, Container Registry, Cosmos DB, Storage Account and Storage Container, Log Analytics Workspace, and supporting Resource Groups.
Container Apps host API and AI microservices.
ACR stores service container images.
Cosmos DB stores application data for selected backend workflows.
Storage services are used for file and artifact handling in backend flows.

## Frontend Platform
Tags: frontend-platform, frontend-stack, nextjs, react, typescript, browser-apis, ui

Frontend tech stack: Next.js, React, TypeScript, Tailwind CSS, and Framer Motion.

### Frontend Stack and Languages
- TypeScript is the primary frontend language.
- JavaScript (ESM/Node.js) is used in build scripts and selected tests.
- Frontend framework stack: Next.js 16 (App Router), React 19, Tailwind CSS, and Framer Motion.

### Frontend Libraries and Browser APIs
- AI chat/web inference UI libraries: @mlc-ai/web-llm, @xenova/transformers, onnxruntime-web wasm backend.
- Data and inspection tools: @duckdb/duckdb-wasm, apache-arrow, hyparquet, hyparquet-writer, recharts.
- Document and utility tooling: pdf-lib, pdfjs-dist, mammoth, jsPDF/jspdf-autotable, sql-formatter, yaml, crypto-js, uuid, @zip.js/zip.js.
- Browser APIs used where supported: Web Workers, File API, Web Speech API, Canvas API, Clipboard API.

### Frontend Libraries (Exact Summary)
- Frontend libraries include Next.js, React, Tailwind CSS, Framer Motion, @mlc-ai/web-llm, @xenova/transformers, onnxruntime-web, @duckdb/duckdb-wasm, apache-arrow, hyparquet, recharts, pdf-lib, pdfjs-dist, mammoth, and jsPDF/jspdf-autotable.

### Frontend Pages and Experience
- The site includes tools, learning, writing, visualizations, and admin-facing pages.
- Core frontend experience emphasizes browser-first processing, responsiveness, and privacy-conscious workflows.

## Backend Platform
Tags: backend-platform, backend-stack, python, fastapi, uvicorn, rag, api-gateway, backend-workflows

Backend stack summary: Python 3, FastAPI, Uvicorn, Docker, LangGraph/LangChain orchestration, sentence-transformers, FAISS, faster-whisper, TTS, Torch (CPU), and Ollama-based LLM runtime. Azure Container Apps is the hosting platform for backend deployment, not the core application stack.

### Backend Stack, Services, and Runtime
- Python 3 is the primary backend language.
- Backend framework/runtime: FastAPI microservices with Uvicorn in Docker containers.
- AI/ML workloads include sentence-transformers, FAISS, faster-whisper, TTS, Torch (CPU), and Ollama-based LLM runtime.
- Infrastructure and config formats include Terraform HCL, Dockerfile definitions, and JSON/YAML configs.

### Backend Libraries by Service
- API Gateway service: fastapi, uvicorn, langgraph, langchain-core/community, langchain-groq, langchain-huggingface, azure-storage-blob, azure-cosmos, pypdf, python-docx, tweepy, google-api-python-client.
- RAG service: fastapi, uvicorn, sentence-transformers, faiss-cpu, duckdb, azure-storage-blob.
- Speech service: fastapi, uvicorn, faster-whisper, TTS, torch (CPU), transformers, av, scipy, sentencepiece.
- LLM container service: Ollama runtime image with pre-pulled model.

### Backend Libraries (Exact Summary)
Backend libraries include fastapi, uvicorn, langgraph, langchain-core/community, langchain-groq, langchain-huggingface, sentence-transformers, faiss-cpu, duckdb, faster-whisper, TTS, torch (CPU), transformers, av, scipy, sentencepiece, azure-storage-blob, azure-cosmos, pypdf, and python-docx.
- API Gateway libraries: fastapi, uvicorn, langgraph, langchain-core/community, langchain-groq, langchain-huggingface, azure-storage-blob, azure-cosmos, pypdf, python-docx.
- RAG/Semantic libraries: sentence-transformers, faiss-cpu, duckdb, azure-storage-blob.
- Speech libraries: faster-whisper, TTS, torch (CPU), transformers, av, scipy, sentencepiece.

### Frontend-to-Backend Flow and Endpoints
- User interacts with frontend pages/widgets in the Next.js app.
- Browser-first tools process files locally when backend is not required.
- Backend-required features call the API gateway URL configured by NEXT_PUBLIC_API_GATEWAY_URL.
- API gateway routes requests to specialized services (RAG, LLM, speech, and related workflows).
- Services may read/write supporting data in Azure services and return responses via the gateway.
- Gateway returns normalized JSON responses to the frontend.

Representative backend endpoints used by frontend modules:
- /visitor-count and /visitor-stats for analytics counters.
- /summarize for document summarization.
- /topics and /start_lesson for professor/RAG-assisted learning flows.
- /rag/ingest and /rag/seed for admin RAG management operations.

## What Makes the Site Unique
Tags: unique, differentiator, privacy, local-processing, browser-first

A major differentiator is browser-first processing for many tools, which keeps user data local.
Site USP: browser-first processing for many tools, keeping user data local by default.
The site combines practical utilities, cloud engineering depth, and an in-browser AI assistant in one place.
This creates a strong balance of privacy, speed, and demonstrable end-to-end engineering capability.

## Tooling Catalog Overview
Tags: tool-catalog, tool-overview, utilities

The site includes a broad utility catalog for data processing, document workflows, format conversion, and validation/security tasks.

## Repository and Primary URLs
Tags: repository-url, github, source-code, primary-urls

Primary repository URL:
- https://github.com/ksaraboji/databro

Primary site URL:
- https://databro.dev

Secondary site URL:
- https://data-bro.com

## Tool URLs
Tags: tool-urls, catalog-links, tool-links, direct-tool-pages

URL for SQL Formatter tool: https://databro.dev/tools/sql-formatter
URL for Checksum Calculator tool: https://databro.dev/tools/checksum-calculator
URL for JSON Formatter tool: https://databro.dev/tools/json-formatter
URL for JSON Flatten and Unflatten tool: https://databro.dev/tools/json-flatten-unflatten
URL for YAML and JSON Converter tool: https://databro.dev/tools/yaml-json-converter
URL for Universal Converter tool: https://databro.dev/tools/universal-converter
URL for SQL Query tool (Universal Converter): https://databro.dev/tools/universal-converter
URL of Universal Converter tool: https://databro.dev/tools/universal-converter
URL for PDF Merger tool: https://databro.dev/tools/pdf-merger
URL for PDF Splitter and Extractor tool: https://databro.dev/tools/pdf-splitter
URL for Doc to Markdown tool: https://databro.dev/tools/doc-to-markdown
URL for Base64 Converter tool: https://databro.dev/tools/base64-converter
URL for Secure Zip Creator tool: https://databro.dev/tools/secure-zip
URL for Data Profiler and Explorer tool: https://databro.dev/tools/data-profiler
URL for Future Income Calculator tool: https://databro.dev/tools/future-income-calculator
URL for Parquet Inspector Plus tool: https://databro.dev/tools/parquet-inspector-plus
URL for Arrow Inspector Plus tool: https://databro.dev/tools/arrow-inspector-plus
URL for Schema Diff tool: https://databro.dev/tools/schema-diff
URL for JSON Schema Inferrer tool: https://databro.dev/tools/json-schema-inferrer
URL for PDF to Image Converter tool: https://databro.dev/tools/pdf-to-image
URL for Image to PDF Converter tool: https://databro.dev/tools/image-to-pdf
URL for UUID CUID Hash Generator tool: https://databro.dev/tools/uuid-cuid-hash-generator
URL for Timestamp Timezone Converter tool: https://databro.dev/tools/timestamp-timezone-converter
URL for Cron and Time Window Simulator tool: https://databro.dev/tools/cron-time-window-simulator
URL for Document Summarizer tool: https://databro.dev/tools/document-summarizer
URL for QR Code Generator tool: https://databro.dev/tools/qr-code-generator
URL for Credit Card Validator tool: https://databro.dev/tools/credit-card-validator
URL for UPC Validator tool: https://databro.dev/tools/upc-validator
URL for Aadhaar Validator tool: https://databro.dev/tools/aadhaar-validator
URL for JWT Debugger tool: https://databro.dev/tools/jwt-debugger
URL of JWT Debugger tool: https://databro.dev/tools/jwt-debugger


## Workflow Constraints (Canonical Summary)
Tags: workflow-summary, limits, tools, backend

Most tools are browser-first and constrained by client-side memory/CPU for very large files.
Backend workflows (summarization, professor/RAG, analytics) depend on API gateway and service availability, and quality depends on source data and model/runtime health.

## Data and File Processing Tools
Tags: data-tools, parquet, arrow, schema, profiler, conversion

Data-focused tools include Data Profiler and Explorer, Parquet Inspector Plus, Arrow Inspector Plus, Schema Diff, and JSON Schema Inferrer.
The universal converter supports practical format transformations and SQL querying workflows.

## Document and PDF Tools
Tags: pdf, document, markdown, summarizer, image

Document-oriented tools include Doc to Markdown, PDF Merger, PDF Splitter and Extractor, PDF to Image Converter, Image to PDF Converter, and Document Summarizer.

## Format, Conversion, and Generator Tools
Tags: format, conversion, generators, sql, json, yaml, base64, uuid, timestamps, cron, calculator

Format, conversion, and generator tools include SQL Formatter, JSON Formatter, JSON Flatten and Unflatten, YAML and JSON Converter, Base64 Converter, UUID/CUID/Hash Generator, QR Code Generator, Timestamp/Timezone Converter, Cron and Time Window Simulator, and Future Income Calculator.

## Security and Validation Tools
Tags: security, validators, jwt, checksum, zip, credit-card, aadhaar, upc, ids

Security and validation tools include Checksum Calculator, Secure Zip Creator, JWT Debugger, Credit Card Validator, UPC and EAN Validator, and Aadhaar Validator.
