# Databro AI Chat Knowledge Base

## Site Owner and Purpose
Tags: owner, about, portfolio, creator, purpose

Databro is a portfolio and tooling site created by Kumar Saraboji.
It showcases practical engineering work across data engineering, cloud automation, and AI integration.
The goal is to provide useful browser-first tools, practical GenAI tools and utilities, and demonstrate end-to-end implementation quality.

## Hosting and Infrastructure
Tags: hosting, hosted, infra, aws, azure, terraform, cloudfront, s3, container apps

The web frontend is hosted on AWS using S3 for static assets and CloudFront as CDN.
Backend services are deployed on Azure Container Apps and packaged through Azure Container Registry.
Infrastructure for both AWS and Azure is managed with Terraform.

## Architecture
Tags: architecture, frontend, backend, microservices, browser-only

The architecture is frontend-first with many browser-only utilities.
AI and API scenarios are handled with containerized backend microservices where required.
Core interaction patterns emphasize privacy, responsiveness, and practical workflows.

## CI/CD and Delivery
Tags: cicd, github actions, deploy, workflows, automation

CI/CD is automated with GitHub Actions.
Workflows cover AWS Terraform, Azure Terraform, web build and deploy, and backend image build and deploy.

## AWS Services Used
Tags: aws, cloudfront, s3, acm, route-security, terraform, web-hosting

AWS services provisioned through Terraform include S3, CloudFront, and ACM.
S3 stores static web assets.
CloudFront serves the site globally with caching and response-header controls.
ACM certificates are used for HTTPS/TLS on the distribution.
CloudFront origin access and bucket policies are configured so static assets are served securely.

## Azure Services Used
Tags: azure, container-apps, acr, cosmosdb, log-analytics, storage, terraform

Azure services provisioned through Terraform include Container Apps, Container App Environment, Container Registry, Cosmos DB, Storage Account and Storage Container, Log Analytics Workspace, and supporting Resource Groups.
Container Apps host API and AI microservices.
ACR stores service container images.
Cosmos DB stores application data for selected backend workflows.
Storage services are used for file and artifact handling in backend flows.

## Frontend and Backend Tech Stack
Tags: stack, frontend, backend, typescript, python, fastapi, nextjs, react

Frontend stack: Next.js (App Router), React, TypeScript, Tailwind CSS, and Framer Motion.
Frontend also uses browser-native APIs such as Web Workers, File APIs, and Web Speech features where supported.
Backend stack: Python FastAPI microservices running with Uvicorn in containers.
AI/backend workloads include RAG service patterns, speech processing, and API gateway orchestration deployed to Azure Container Apps.

## Important Libraries by Tool and Module
Tags: libraries, dependencies, tools, ai-widget, backend, utility-libs

Key libraries used across tools and modules:
- AI Chat widget: @mlc-ai/web-llm, @xenova/transformers, onnxruntime-web wasm backend.
- Universal Converter: @duckdb/duckdb-wasm, apache-arrow, hyparquet, hyparquet-writer, exceljs, avsc.
- Data Profiler and Arrow/Parquet inspectors: apache-arrow, hyparquet, recharts.
- Document and PDF utilities: pdf-lib, pdfjs-dist, mammoth, jsPDF/jspdf-autotable.
- Formatter and conversion utilities: sql-formatter, yaml, crypto-js, uuid.
- Archive and encoding utilities: @zip.js/zip.js, Base64 browser APIs.
- Visual and chart utilities: recharts, framer-motion, lucide-react.
- QR and validation utilities: qrcode.react plus in-browser algorithmic validators.

Backend-related library highlights:
- API Gateway service: fastapi, uvicorn, langgraph, langchain-core/community, langchain-groq, langchain-huggingface, azure-storage-blob, azure-cosmos, pypdf, python-docx, tweepy, google-api-python-client.
- RAG service: fastapi, uvicorn, sentence-transformers, faiss-cpu, duckdb, azure-storage-blob.
- Speech service: fastapi, uvicorn, faster-whisper, TTS, torch (CPU), transformers, av, scipy, sentencepiece.
- LLM container service: Ollama-based runtime image with pre-pulled model.

## Frontend to Backend Service Flow
Tags: flow, architecture-flow, request-path, gateway, api, rag, speech

Typical request flow:
- User interacts with frontend pages or widgets in the Next.js app.
- Browser-first tools process files locally when backend is not required.
- Backend-required features call the API Gateway URL configured by NEXT_PUBLIC_API_GATEWAY_URL.
- API Gateway routes requests to specialized backend services (RAG, LLM, speech, and related workflows).
- Services may read/write supporting data in Azure services (for example Cosmos DB or Blob Storage) and return a response to the gateway.
- Gateway returns normalized JSON responses to the frontend UI.

Representative backend endpoints used by frontend modules include:
- /visitor-count and /visitor-stats for analytics counters.
- /summarize for document summarization.
- /topics and /start_lesson for professor/RAG-assisted learning flows.
- /rag/ingest and /rag/seed for admin RAG management operations.

## Other Utilities (Non-Tools)
Tags: utilities, non-tools, platform-features, admin, seo, analytics

In addition to the tools catalog, the site includes platform utilities and supporting features:
- AI assistant widget with local/browser inference and citation-grounded responses.
- Visitor counting and admin visitor statistics dashboard.
- Admin system health and RAG management panels.
- Learning and writing sections for knowledge sharing and build logs.
- Visualizations section for data-story style content.
- SEO and discoverability utilities such as sitemap and robots routes.
- Navigation and UX helpers such as floating home button, feature gating, and reusable layout components.

## AI Chatbot Workflow
Tags: ai, chatbot, rag, semantic, embeddings, webllm, onnx, worker

The chatbot runs in a web worker and uses local retrieval-augmented generation.
Generation uses WebLLM with Llama-3.2-1B-Instruct.
Semantic embeddings use Xenova all-MiniLM-L6-v2.
The retrieval pipeline uses hybrid scoring: semantic similarity plus keyword signals.
Top candidates are ranked, confidence-gated, and assembled into a bounded context window.
Answers are grounded to retrieved chunks and accompanied by source citations.

## What Makes the Site Unique
Tags: unique, cool, standout, differentiator, privacy, local-processing

A major differentiator is browser-first processing for many tools, which keeps user data local.
The site combines practical utilities, cloud engineering depth, and an in-browser AI assistant in one place.
This creates a strong balance of privacy, speed, and demonstrable full-stack capability.

## Tooling Catalog Overview
Tags: tools, catalog, utilities

The site includes a broad utility catalog, including:
- File conversion and SQL querying workflows
- PDF merge, split, image conversion, and extraction workflows
- JSON, YAML, Base64, and schema tooling
- Data profiling and dataset inspection for CSV and Parquet
- Security and validation utilities (JWT, credit card/Luhn, Aadhaar, UPC/EAN)
- Time, schedule, and identifier utilities (timestamps, cron simulation, UUID/CUID/hash)

## Repository and Primary URLs
Tags: urls, repository, github, links

Primary repository URL:
- https://github.com/ksaraboji/databro

Primary site URL:
- https://databro.dev

Secondary site URL:
- https://data-bro.com

## Tool URLs
Tags: tool-urls, links, catalog-links, tools

- SQL Formatter: https://databro.dev/tools/sql-formatter
- Checksum Calculator: https://databro.dev/tools/checksum-calculator
- JSON Formatter: https://databro.dev/tools/json-formatter
- JSON Flatten and Unflatten: https://databro.dev/tools/json-flatten-unflatten
- YAML and JSON Converter: https://databro.dev/tools/yaml-json-converter
- Universal Converter and SQL Query Tool: https://databro.dev/tools/universal-converter
- PDF Merger: https://databro.dev/tools/pdf-merger
- PDF Splitter and Extractor: https://databro.dev/tools/pdf-splitter
- Doc to Markdown: https://databro.dev/tools/doc-to-markdown
- Base64 Converter: https://databro.dev/tools/base64-converter
- Secure Zip Creator: https://databro.dev/tools/secure-zip
- Data Profiler and Explorer: https://databro.dev/tools/data-profiler
- Future Income Calculator: https://databro.dev/tools/future-income-calculator
- Parquet Inspector Plus: https://databro.dev/tools/parquet-inspector-plus
- Arrow Inspector Plus: https://databro.dev/tools/arrow-inspector-plus
- Schema Diff: https://databro.dev/tools/schema-diff
- JSON Schema Inferrer: https://databro.dev/tools/json-schema-inferrer
- PDF to Image Converter: https://databro.dev/tools/pdf-to-image
- Image to PDF Converter: https://databro.dev/tools/image-to-pdf
- UUID CUID Hash Generator: https://databro.dev/tools/uuid-cuid-hash-generator
- Timestamp Timezone Converter: https://databro.dev/tools/timestamp-timezone-converter
- Cron and Time Window Simulator: https://databro.dev/tools/cron-time-window-simulator
- Document Summarizer: https://databro.dev/tools/document-summarizer
- QR Code Generator: https://databro.dev/tools/qr-code-generator
- Credit Card Validator: https://databro.dev/tools/credit-card-validator
- UPC Validator: https://databro.dev/tools/upc-validator
- Aadhaar Validator: https://databro.dev/tools/aadhaar-validator
- JWT Debugger: https://databro.dev/tools/jwt-debugger

## Detailed Workflow Specs (Input, Output, Edge Cases, Limits)
Tags: workflow-details, inputs, outputs, edge-cases, limits, per-tool

### AI Chat Widget (Local RAG)
Input: natural language question from user and markdown-derived knowledge-base chunks.
Output: grounded text response with chunk citations.
Edge cases: embedder download failure, low-confidence retrieval, model returns only citations, ambiguous questions.
Limits: context window is bounded; answers are limited to the local knowledge base and may not include external real-time facts.

### Universal Converter and SQL Query Tool
Input: CSV, Excel, Parquet, Arrow, or Avro files, plus optional SQL query.
Output: converted file, table preview, and query results.
Edge cases: malformed files, unsupported schemas, mixed data types across rows, very wide columns.
Limits: browser memory and CPU constraints for very large datasets; conversion speed depends on file size and structure.

### Data Profiler and Explorer
Input: CSV or Parquet file.
Output: inferred schema, per-column statistics (nulls, unique, min/max where applicable), and value distributions.
Edge cases: sparse columns, mixed numeric/string values, high-cardinality categorical columns.
Limits: large files may require sampling and can be constrained by browser memory.

### Parquet Inspector Plus and Arrow Inspector Plus
Input: Parquet or Arrow IPC/Feather files.
Output: schema metadata, row-group or field-level details, and sample records.
Edge cases: nested/complex types, unusual encodings, missing metadata blocks.
Limits: deep nested structures and very large row groups can impact responsiveness.

### Schema Diff and JSON Schema Inferrer
Input: two schemas (for diff) or representative JSON samples (for inference).
Output: added, removed, changed fields; or inferred Draft-07 schema.
Edge cases: inconsistent sample shapes, optional fields appearing sparsely, conflicting types.
Limits: inferred schemas are best-effort and depend on sample quality and coverage.

### Document and PDF Workflows (Doc to Markdown, PDF Merge/Split, PDF/Image)
Input: PDF, DOCX, and supported image formats.
Output: extracted markdown text, merged/split PDF files, or converted image/PDF outputs.
Edge cases: scanned PDFs with little extractable text, password-protected files, malformed documents.
Limits: OCR quality is document-dependent; very large documents can increase processing time in browser.

### Security and Validation Utilities (JWT, Checksum, Credit Card, Aadhaar, UPC/EAN)
Input: tokens, IDs, card numbers, barcode digits, or arbitrary text.
Output: validity status, decoded payloads (where relevant), and checksum/hash values.
Edge cases: unsupported token formats, truncated input, non-standard separators.
Limits: JWT utility decodes payload/header structure but does not perform full cryptographic signature verification.

### Format and Utility Tools (SQL Formatter, YAML/JSON, Base64, UUID/CUID/Hash, Timestamp/Cron)
Input: text payloads (queries, JSON/YAML, timestamps, cron strings, generator options).
Output: formatted/converted text, generated IDs/hashes, timezone conversions, schedule previews.
Edge cases: invalid syntax, timezone alias mismatches, locale-dependent date assumptions.
Limits: conversions are deterministic within selected parser/formatter behavior and may differ from other engines.

### QR Code Generator and Secure Zip Creator
Input: text/url payloads (QR) or selected files + password/options (ZIP).
Output: downloadable QR image or encrypted ZIP archive.
Edge cases: extremely long QR payloads, weak passwords, unsupported file names.
Limits: QR readability decreases at high density; ZIP operation time grows with file count/size.

### Backend Document Summarizer Workflow
Input: uploaded document via API gateway /summarize endpoint.
Output: concise summary text returned by backend AI workflow.
Edge cases: unsupported MIME types, empty documents, extraction failures.
Limits: summarization quality depends on source text extraction quality and service/model constraints.

### Professor and RAG-Assisted Learning Workflow
Input: topic selection, lesson start requests, and follow-up interactions.
Output: guided lesson responses and topic-driven content from backend workflows.
Edge cases: unavailable topics, cold-start delays, transient gateway/service errors.
Limits: response depth and latency depend on backend service health and model/runtime availability.

### Visitor Analytics and Admin Monitoring Utilities
Input: passive frontend event calls and admin health-check actions.
Output: visitor counts, location-grouped stats, and service health snapshots.
Edge cases: network failures, blocked third-party endpoints, temporary backend unavailability.
Limits: analytics are lightweight and approximate (for example timezone-based location grouping).

## Utility and Feature URLs (Non-Tools)
Tags: utility-urls, feature-urls, non-tools, platform

- Home: https://databro.dev/
- Backend overview: https://databro.dev/backend
- Backend document summarizer page: https://databro.dev/backend/document-summarizer
- Backend professor page: https://databro.dev/backend/professor
- Learning: https://databro.dev/learning
- Writing: https://databro.dev/writing
- Visualizations: https://databro.dev/visualizations
- Admin: https://databro.dev/admin
- Admin marketing: https://databro.dev/admin/marketing
- API overview page: https://databro.dev/api
- Robots: https://databro.dev/robots.txt
- Sitemap: https://databro.dev/sitemap.xml
- Web manifest: https://databro.dev/manifest.json

## Data and File Processing Tools
Tags: data-tools, parquet, arrow, schema, profiler, conversion

Data-focused tools include Data Profiler and Explorer, Parquet Inspector Plus, Arrow Inspector Plus, Schema Diff, and JSON Schema Inferrer.
The universal converter supports practical format transformations and SQL querying workflows.

## Document and PDF Tools
Tags: pdf, document, markdown, summarizer, image

Document-oriented tools include Doc to Markdown, PDF Merger, PDF Splitter and Extractor, PDF to Image Converter, Image to PDF Converter, and Document Summarizer.

## Security, Validation, and Utility Tools
Tags: security, validators, jwt, checksum, qr, timestamps, cron, ids

Utility and validation tools include SQL Formatter, Checksum Calculator, JSON Formatter, JSON Flatten and Unflatten, YAML and JSON Converter, Secure Zip Creator, Credit Card Validator, UPC and EAN Validator, Aadhaar Validator, JWT Debugger, QR Code Generator, UUID/CUID/Hash Generator, and Timestamp/Timezone Converter.
