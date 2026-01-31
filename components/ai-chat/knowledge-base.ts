export interface ContextChunk {
    id: string;
    keywords: string[];
    text: string;
}

export const KNOWLEDGE_BASE: ContextChunk[] = [
    { 
        id: "about",
        keywords: ["databro", "site", "about", "portfolio", "what is this", "purpose", "goal", "website", "author", "creator", "developer", "engineer", "who built", "who made", "created by", "kumar", "saraboji", "owner"], 
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
        text: "The tech stack uses Next.js v16.1.3 (App Router), React v19.2.3, TypeScript v5, Tailwind CSS v4, and Framer Motion v12." 
    },
    { 
        id: "infra",
        keywords: ["infrastructure", "cloud", "aws", "hosting", "deploy", "s3", "cloudfront", "terraform", "where hosted", "azure", "gcp", "google", "digitalocean", "vps", "server", "docker", "kubernetes", "lambda", "ec2"], 
        text: "The infrastructure exclusively uses AWS S3 (Storage) and AWS CloudFront (CDN). There are NO other AWS services used." 
    },
    { 
        id: "arch",
        keywords: ["architecture", "backend", "database", "api", "security", "serverless", "jamstack", "api", "graphql", "rest", "mysql", "postgres", "mongodb", "oracle", "sql", "sqlite", "auth", "login"], 
        text: "The architecture is purely Jamstack (Static Export). There is NO backend server and NO database. All logic is client-side." 
    },
    { 
        id: "cicd",
        keywords: ["ci", "cd", "ci/cd", "continuous integration", "continuous delivery", "pipeline", "github actions", "build", "automation", "jenkins", "gitlab", "built", "how built", "compilation", "process"], 
        text: "CI/CD is automated via GitHub Actions. It runs Linting, Building, Security Checks, and S3 Deployment." 
    },
    { 
        id: "ai",
        keywords: ["ai", "model", "chatbot", "genai", "llm", "qwen", "phi", "phi-2", "tiny", "llama", "tinylama", "transformer", "gpt", "openai", "claude", "embedding", "semantic", "search", "rag"], 
        text: "The GenAI models used are Llama-3.2-1B-Instruct (Text Generation) via WebLLM and Xenova/all-MiniLM-L6-v2 (Semantic Embeddings). They run entirely in the browser." 
    },
    { 
        id: "tool-sql",
        keywords: ["sql", "formatter", "database", "query", "link", "url"], 
        text: "The SQL Formatter tool is available at https://dev.databro.dev/tools/sql-formatter" 
    },
    { 
        id: "tool-checksum",
        keywords: ["checksum", "hash", "calculator", "generator", "md5", "sha", "link", "url"], 
        text: "The Checksum Calculator tool is available at https://dev.databro.dev/tools/checksum-calculator" 
    },
    { 
        id: "tool-json",
        keywords: ["json", "formatter", "beautify", "pretty", "link", "url"], 
        text: "The JSON Formatter tool is available at https://dev.databro.dev/tools/json-formatter" 
    },
    {
        id: "tool-universal",
        keywords: ["universal", "converter", "file", "format", "transform", "arrow", "avro", "csv", "parquet", "excel", "link", "url"],
        text: "The File Converter & Query Tool is available at https://dev.databro.dev/tools/universal-converter. It supports conversion between CSV, Excel, Parquet, Arrow, and Avro formats, and allows SQL querying via DuckDB."
    },
    {
        id: "tool-pdf-merger",
        keywords: ["pdf", "merger", "combine", "join", "merge", "document", "link", "url"],
        text: "The PDF Merger tool is available at https://dev.databro.dev/tools/pdf-merger. It helps combine multiple PDF files into one."
    },
    {
        id: "tool-pdf-splitter",
        keywords: ["pdf", "splitter", "extract", "page", "split", "remove", "separate", "link", "url"],
        text: "The PDF Splitter & Extractor tool is available at https://dev.databro.dev/tools/pdf-splitter. It allows extracting specific pages from PDF documents."
    },
    {
        id: "tool-base64",
        keywords: ["base64", "encoder", "decoder", "encode", "decode", "text", "binary", "link", "url"],
        text: "The Base64 Encoder / Decoder tool is available at https://dev.databro.dev/tools/base64-converter. It handles UTF-8 text encoding and decoding."
    },
    {
        id: "tool-zip",
        keywords: ["zip", "secure", "compress", "archive", "password", "protect", "encryption", "link", "url"],
        text: "The Secure Zip Creator tool is available at https://dev.databro.dev/tools/secure-zip. It creates password-protected ZIP archives entirely in the browser using AES-256 or ZipCrypto."
    },
    { 
        id: "tool-profiler",
        keywords: ["data", "profiler", "explorer", "stats", "statistics", "distribution", "analysis", "analyze", "column", "null", "unique", "link", "url"], 
        text: "The Data Profiler & Explorer tool is available at https://dev.databro.dev/tools/data-profiler. It allows uploading CSV/Parquet files to instantly view column statistics (min, max, nulls, unique count) and value distributions." 
    },
    { 
        id: "tools-usp",
        keywords: ["unique", "feature", "selling point", "special", "privacy", "security", "local", "offline", "data safety", "why use", "advantage", "tools"], 
        text: "The unique feature of these tools is that all data processing happens locally in your browser. No data ever leaves your machine or is sent to a server." 
    },
    { 
        id: "tools",
        keywords: ["tools", "utils", "available", "list", "features", "links", "urls"], 
        text: "Available tools: SQL Formatter (/tools/sql-formatter), Checksum Calculator (/tools/checksum-calculator), JSON Formatter (/tools/json-formatter), File Converter (/tools/universal-converter), PDF Merger (/tools/pdf-merger), PDF Splitter (/tools/pdf-splitter), Base64 Converter (/tools/base64-converter), Secure Zip Creator (/tools/secure-zip), and Data Profiler (/tools/data-profiler)." 
    }
];
