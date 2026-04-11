export interface ContextChunk {
    id: string;
    keywords: string[];
    text: string;
}

export const KNOWLEDGE_BASE: ContextChunk[] = [
    { 
        id: "about",
        keywords: ["databro", "about", "portfolio", "what is this", "purpose", "goal", "website", "author", "creator", "developer", "engineer", "who built", "who made", "created by", "kumar", "saraboji", "owner"], 
        text: "The developer and owner of this portfolio site is Kumar Saraboji. It demonstrates skills in Data Engineering, Cloud Automation (AWS), and AI Integration." 
    },
    { 
        id: "repo",
        keywords: ["github", "repo", "repository", "source code", "git", "url", "codebase", "code base", "open source", "link", "where is the code"], 
        text: "The complete source code is available on GitHub at https://github.com/ksaraboji/databro.git." 
    },
    { 
        id: "stack",
        keywords: ["tech stack", "technologies", "framework", "library", "react", "next.js", "typescript", "tailwind", "tech", "css", "frontend", "ui", "vue", "angular", "svelte", "jquery", "bootstrap"], 
        text: "The tech stack uses Next.js v16.x (App Router), React v19.2.3, TypeScript v5, Tailwind CSS v4, and Framer Motion v12." 
    },
    { 
        id: "infra",
        keywords: ["infrastructure", "cloud", "aws", "hosting", "hosted", "where hosted", "where", "deploy", "deployed", "s3", "cloudfront", "cdn", "terraform", "azure", "gcp", "google", "digitalocean", "vps", "server", "docker", "kubernetes", "lambda", "ec2", "site hosted", "live"], 
        text: "The site is hosted on AWS: the frontend uses S3 (static files) and CloudFront (CDN). Backend services are deployed on Azure Container Apps via Azure Container Registry. Infrastructure for both clouds is managed as code with Terraform." 
    },
    { 
        id: "arch",
        keywords: ["architecture", "backend", "database", "api", "security", "serverless", "jamstack", "api", "graphql", "rest", "mysql", "postgres", "mongodb", "oracle", "sql", "sqlite", "auth", "login"], 
        text: "The architecture is frontend-first with many browser-only tools, plus containerized backend microservices for API and AI use cases. The web frontend is static-hosted, and backend services run in Azure Container Apps." 
    },
    { 
        id: "cicd",
        keywords: ["ci", "cd", "ci/cd", "continuous integration", "continuous delivery", "pipeline", "github actions", "build", "automation", "jenkins", "gitlab", "built", "how built", "compilation", "process"], 
        text: "CI/CD is automated via GitHub Actions with separate workflows for AWS Terraform, Azure Terraform, web app build/deploy, and backend service image build/deploy." 
    },
    { 
        id: "ai",
        keywords: ["ai", "model", "chatbot", "genai", "llm", "qwen", "phi", "phi-2", "tiny", "llama", "tinylama", "transformer", "gpt", "openai", "claude", "embedding", "semantic", "search", "rag"], 
        text: "The GenAI models used are Llama-3.2-1B-Instruct (Text Generation) via WebLLM and Xenova/all-MiniLM-L6-v2 (Semantic Embeddings). They run entirely in the browser." 
    },
    { 
        id: "tool-sql",
        keywords: ["sql", "formatter", "database", "query", "link", "url"], 
        text: "The SQL Formatter tool is available at https://databro.dev/tools/sql-formatter" 
    },
    { 
        id: "tool-checksum",
        keywords: ["checksum", "hash", "calculator", "generator", "md5", "sha", "link", "url"], 
        text: "The Checksum Calculator tool is available at https://databro.dev/tools/checksum-calculator" 
    },
    { 
        id: "tool-json",
        keywords: ["json", "formatter", "beautify", "pretty", "link", "url"], 
        text: "The JSON Formatter tool is available at https://databro.dev/tools/json-formatter" 
    },
    {
        id: "tool-json-flatten-unflatten",
        keywords: ["json flatten", "unflatten", "flatten", "nested json", "json paths", "dot notation", "link", "url"],
        text: "The JSON Flatten / Unflatten tool is available at https://databro.dev/tools/json-flatten-unflatten. It flattens nested JSON into key paths and reconstructs nested JSON from flattened keys."
    },
    {
        id: "tool-yaml-json-converter",
        keywords: ["yaml", "yml", "json", "converter", "yaml to json", "json to yaml", "transform", "link", "url"],
        text: "The YAML / JSON Converter tool is available at https://databro.dev/tools/yaml-json-converter. It converts YAML to JSON and JSON to YAML with instant validation."
    },
    {
        id: "tool-universal",
        keywords: ["universal", "converter", "file", "format", "transform", "arrow", "avro", "csv", "parquet", "excel", "link", "url"],
        text: "The File Converter & SQL Query Tool is available at https://databro.dev/tools/universal-converter. It supports conversion between CSV, Excel, Parquet, Arrow, and Avro formats, and allows SQL querying via DuckDB."
    },
    {
        id: "tool-pdf-merger",
        keywords: ["pdf", "merger", "combine", "join", "merge", "document", "link", "url"],
        text: "The PDF Merger tool is available at https://databro.dev/tools/pdf-merger. It helps combine multiple PDF files into one."
    },
    {
        id: "tool-pdf-splitter",
        keywords: ["pdf", "splitter", "extract", "page", "split", "remove", "separate", "link", "url"],
        text: "The PDF Splitter & Extractor tool is available at https://databro.dev/tools/pdf-splitter. It allows extracting specific pages from PDF documents."
    },
    {
        id: "tool-doc-md",
        keywords: ["doc", "docx", "word", "pdf", "markdown", "md", "convert", "extract", "text", "llm", "prompt", "link", "url"],
        text: "The Doc to Markdown tool is available at https://databro.dev/tools/doc-to-markdown. It converts Microsoft Word (.docx) and PDF files into clean Markdown text for LLM prompts."
    },
    {
        id: "tool-base64",
        keywords: ["base64", "encoder", "decoder", "encode", "decode", "text", "binary", "link", "url"],
        text: "The Base64 Encoder / Decoder tool is available at https://databro.dev/tools/base64-converter. It handles UTF-8 text encoding and decoding."
    },
    {
        id: "tool-zip",
        keywords: ["zip", "secure", "compress", "archive", "password", "protect", "encryption", "link", "url"],
        text: "The Secure Zip Creator tool is available at https://databro.dev/tools/secure-zip. It creates password-protected ZIP archives entirely in the browser using AES-256 or ZipCrypto."
    },
    { 
        id: "tool-profiler",
        keywords: ["data", "profiler", "explorer", "stats", "statistics", "distribution", "analysis", "analyze", "column", "null", "unique", "link", "url"], 
        text: "The Data Profiler & Explorer tool is available at https://databro.dev/tools/data-profiler. It allows uploading CSV/Parquet files to instantly view column statistics (min, max, nulls, unique count) and value distributions." 
    },
    { 
        id: "tool-finance",
        keywords: ["financial", "planner", "calculator", "income", "expense", "budget", "retirement", "fire", "investment", "money", "corpus", "wealth", "projection", "link", "url"], 
        text: "The Financial Planner tool is available at https://databro.dev/tools/future-income-calculator. It helps project financial freedom timelines with detailed asset growth, expense inflation, and PDF reporting features." 
    },
    {
        id: "tool-parquet-inspector",
        keywords: ["parquet", "inspector", "schema", "row group", "metadata", "codec", "column stats", "link", "url"],
        text: "The Parquet Inspector Plus tool is available at https://databro.dev/tools/parquet-inspector-plus. It inspects schema, row groups, codecs, metadata, and sample rows in Parquet files."
    },
    {
        id: "tool-arrow-inspector",
        keywords: ["arrow", "inspector", "feather", "ipc", "schema", "metadata", "link", "url"],
        text: "The Arrow Inspector Plus tool is available at https://databro.dev/tools/arrow-inspector-plus. It inspects Arrow schema fields, metadata, and sample rows from Arrow/Feather IPC files."
    },
    {
        id: "tool-schema-diff",
        keywords: ["schema", "diff", "compare", "json schema", "parquet schema", "changes", "added", "removed", "link", "url"],
        text: "The Schema Diff Tool is available at https://databro.dev/tools/schema-diff. It compares JSON or Parquet-derived schemas and highlights added, removed, and changed fields."
    },
    {
        id: "tool-json-schema-inferrer",
        keywords: ["json schema", "inferrer", "infer", "draft-07", "schema generation", "link", "url"],
        text: "The JSON Schema Inferrer tool is available at https://databro.dev/tools/json-schema-inferrer. It infers Draft-07 JSON Schema from sample JSON input."
    },
    {
        id: "tool-pdf-to-image",
        keywords: ["pdf to image", "convert pdf", "png", "jpeg", "webp", "pages", "link", "url"],
        text: "The PDF to Image Converter tool is available at https://databro.dev/tools/pdf-to-image. It converts PDF pages to PNG, JPEG, or WebP images in-browser."
    },
    {
        id: "tool-image-to-pdf",
        keywords: ["image to pdf", "combine images", "jpg to pdf", "png to pdf", "webp", "gif", "link", "url"],
        text: "The Image to PDF Converter tool is available at https://databro.dev/tools/image-to-pdf. It combines multiple images into a single PDF document."
    },
    {
        id: "tool-uuid-cuid",
        keywords: ["uuid", "cuid", "hash generator", "sha", "id generator", "token", "link", "url"],
        text: "The UUID / CUID / Hash Generator tool is available at https://databro.dev/tools/uuid-cuid-hash-generator. It generates UUIDs, CUID-style IDs, and cryptographic hashes."
    },
    {
        id: "tool-timestamp-timezone",
        keywords: ["timestamp", "timezone", "unix time", "epoch", "date converter", "time zone", "link", "url"],
        text: "The Timestamp / Timezone Converter tool is available at https://databro.dev/tools/timestamp-timezone-converter. It converts Unix timestamps and transforms date-times across timezones."
    },
    {
        id: "tool-cron-time-window-simulator",
        keywords: ["cron", "scheduler", "time window", "simulator", "next runs", "schedule preview", "link", "url"],
        text: "The Cron and Time Window Simulator tool is available at https://databro.dev/tools/cron-time-window-simulator. It previews next run times from cron expressions and estimates execution counts within custom time windows."
    },
    {
        id: "tool-document-summarizer",
        keywords: ["document summarizer", "summarize", "pdf summary", "docx summary", "ai summary", "link", "url"],
        text: "The Document Summarizer tool is available at https://databro.dev/tools/document-summarizer. It sends supported documents to a backend summarization service and returns condensed output."
    },
    { 
        id: "tools-usp",
        keywords: ["unique", "feature", "selling point", "special", "privacy", "security", "local", "offline", "data safety", "why use", "advantage", "tools"], 
        text: "The unique feature of these tools is that all data processing happens locally in your browser. No data ever leaves your machine or is sent to a server." 
    },
    {
        id: "site-highlights",
        keywords: ["cool", "interesting", "standout", "highlight", "what makes", "impressive", "amazing", "awesome", "best feature", "showcase", "capability", "capabilities", "differentiator", "why is this site", "notable"],
        text: "What makes this site stand out: 28+ browser-only tools where no data ever leaves your device; a built-in AI chat assistant (this one!) running entirely in-browser via WebLLM and local semantic embeddings; real-time data profiling for CSV and Parquet files; multi-cloud infrastructure managed with Terraform (AWS + Azure); and full CI/CD via GitHub Actions. It is a living showcase of full-stack, data engineering, and AI skills."
    },
    { 
        id: "tools",
        keywords: ["tools", "utils", "available", "list", "features", "links", "urls"], 
        text: "Available tools include: File Converter & SQL Query Tool (/tools/universal-converter), PDF Merger (/tools/pdf-merger), PDF Splitter & Extractor (/tools/pdf-splitter), Doc to Markdown (/tools/doc-to-markdown), PDF to Image Converter (/tools/pdf-to-image), Image to PDF Converter (/tools/image-to-pdf), JSON Pretty Print (/tools/json-formatter), YAML / JSON Converter (/tools/yaml-json-converter), SQL Formatter (/tools/sql-formatter), Parquet Inspector Plus (/tools/parquet-inspector-plus), Arrow Inspector Plus (/tools/arrow-inspector-plus), JSON Schema Inferrer (/tools/json-schema-inferrer), Schema Diff Tool (/tools/schema-diff), JSON Flatten / Unflatten (/tools/json-flatten-unflatten), Base64 Encoder / Decoder (/tools/base64-converter), Secure Zip Creator (/tools/secure-zip), File Checksum (/tools/checksum-calculator), Credit Card / Luhn Validator (/tools/credit-card-validator), UPC / EAN Validator (/tools/upc-validator), Aadhaar Validator (/tools/aadhaar-validator), JWT Debugger (/tools/jwt-debugger), QR Code Generator (/tools/qr-code-generator), UUID / CUID / Hash Generator (/tools/uuid-cuid-hash-generator), Timestamp / Timezone Converter (/tools/timestamp-timezone-converter), Cron and Time Window Simulator (/tools/cron-time-window-simulator), Data Profiler & Explorer (/tools/data-profiler), Detailed Financial Planner (/tools/future-income-calculator), and Document Summarizer (/tools/document-summarizer)." 
    },
    {
        id: "qr-generator",
        keywords: ["qr", "code", "generator", "barcode", "make qr", "create qr"],
        text: "The QR Code Generator (/tools/qr-code-generator) creates customizable QR codes locally in the browser. Users can adjust size, color, and error correction levels."
    },
    {
        id: "cc-validator",
        keywords: ["credit card", "finance", "luhn", "validate", "card number", "payment"],
        text: "The Credit Card Validator (/tools/credit-card-validator) uses the Luhn algorithm to check if a card number is valid. It processes entirely in-browser for complete privacy."
    },
    {
        id: "upc-validator",
        keywords: ["upc", "ean", "gtin", "barcode", "retail", "product code"],
        text: "The UPC/EAN Validator (/tools/upc-validator) checks the validity of 12-digit UPCs, 13-digit EANs, and other GTIN formats using the standard Modulo-10 checksum algorithm."
    },
    {
        id: "aadhaar-validator",
        keywords: ["aadhaar", "uidai", "india", "id", "verhoeff"],
        text: "The Aadhaar Validator (/tools/aadhaar-validator) uses the Verhoeff algorithm to validate Indian national ID numbers. It runs locally and does not contact UIDAI servers."
    },
    {
        id: "jwt-debugger",
        keywords: ["jwt", "token", "json web token", "decode", "security", "auth"],
        text: "The JWT Debugger (/tools/jwt-debugger) decodes the Header and Payload of a JWT string. It checks for structural validity and expiration timestamps but does not verify cryptographic signatures."
    }
];
