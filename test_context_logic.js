
const contextJSON = JSON.stringify([
  { 
    id: "infra",
    keywords: ["infrastructure", "cloud", "aws", "hosting", "deploy", "s3", "cloudfront", "terraform", "where hosted", "azure", "gcp", "google", "digitalocean", "vps", "server", "docker", "kubernetes", "lambda", "ec2"], 
    text: "The infrastructure exclusively uses AWS S3 (Storage) and AWS CloudFront (CDN). There are NO other AWS services used." 
  }
]);

const query = "what AWS services are used";

function findMostRelevantChunk(query, contextJSON) {
    let chunks = [];
    try {
        chunks = JSON.parse(contextJSON);
    } catch {
        return "NO_RELEVANT_CONTEXT_FOUND";
    }

    const q = query.toLowerCase();

    // --- PHASE 1: Keyword Scoring (Fast & Strict) ---
    let bestKeywordChunk = null;
    let maxKeywordScore = 0;

    for (const chunk of chunks) {
        let score = 0;
        if (Array.isArray(chunk.keywords)) {
            for (const keyword of chunk.keywords) {
                // Smarter Match: Word Boundary Check
                // Allows "c++" but prevents "ui" finding "build"
                const esc = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const boundaryRegex = new RegExp(`(?:^|[^a-z0-9])${esc}(?:$|[^a-z0-9])`, 'i');
                
                if (boundaryRegex.test(q)) {
                    score += 1; 
                }
            }
        }
        if (score > maxKeywordScore) {
            maxKeywordScore = score;
            bestKeywordChunk = chunk.text;
        }
    }
    
    console.log(`Max Score: ${maxKeywordScore}`);
    console.log(`Best Chunk: ${bestKeywordChunk}`);

    if (maxKeywordScore >= 1 && bestKeywordChunk) {
        return bestKeywordChunk;
    }
    
    return "NO_RELEVANT_CONTEXT_FOUND";
}

const result = findMostRelevantChunk(query, contextJSON);
console.log("Result:", result);
