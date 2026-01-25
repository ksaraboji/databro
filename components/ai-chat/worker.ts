import { pipeline, env } from '@xenova/transformers';

// Skip local model checks since we are running in browser
env.allowLocalModels = false;
env.useBrowserCache = true;

// Signal that the worker script has at least loaded
self.postMessage({ status: 'worker-loaded' });

class AIWorker {
  static instance: any = null;

  static async getInstance(progress_callback: any = null) {
    if (this.instance === null) {
      // Robust Solution: Qwen1.5-0.5B-Chat
      // Why: It's a true LLM (Chat), not just a T5 translator. It understands conversation.
      // Optimization: We will use STREAMING to show the user it is working, instead of waiting 2 mins.
      this.instance = await pipeline('text-generation', 'Xenova/Qwen1.5-0.5B-Chat', { progress_callback });
    }
    return this.instance;
  }
}

// Simple strict keyword matching to find the relevant chunk
// This acts as a semantic filter before the LLM sees the prompt
function findMostRelevantChunk(query: string, contextJSON: string): string {
    try {
        const chunks = JSON.parse(contextJSON);
        const q = query.toLowerCase();
        
        let bestChunk = null;
        let maxScore = 0;

        for (const chunk of chunks) {
            let score = 0;
            // Robust keyword scoring with boundaries
            for (const keyword of chunk.keywords) {
                // Escape special regex characters
                const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                
                // Regex checks for word boundaries (start/end or non-alphanumeric)
                // This prevents "ui" matching "built", "ai" matching "said", etc.
                const regex = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i');
                
                if (regex.test(q)) {
                    score += 1;
                }
            }
            if (score > maxScore) {
                maxScore = score;
                bestChunk = chunk.text;
            }
        }

        // If no keywords match, return a generic help message via the LLM prompt
        if (!bestChunk || maxScore === 0) {
            return "NO_RELEVANT_CONTEXT_FOUND";
        }

        return bestChunk;

    } catch (e) {
        return "Error parsing context."; // Fallback 
    }
}

// Listen for messages from the main thread
self.addEventListener('message', async (event: MessageEvent) => {
  const { text, context } = event.data;

  // Send status update
  self.postMessage({ status: 'initiate' });

  try {
    const generator = await AIWorker.getInstance((data: any) => {
      self.postMessage({ status: 'progress', data });
    });

    self.postMessage({ status: 'ready' });

    // Step 1: Pre-filter context to prevent hallucinations
    const relevantFact = findMostRelevantChunk(text, context);
    
    // Step 2: Manually construct ChatML format to force the model to behave.
    // We do NOT use the 'messages' array abstraction because it might be misconfiguring the template.
    // Qwen/ChatML format: <|im_start|>system\n{msg}<|im_end|>\n<|im_start|>user\n{msg}<|im_end|>\n<|im_start|>assistant\n
    
    if (relevantFact === "NO_RELEVANT_CONTEXT_FOUND") {
        // Optimization: Skip valid generation for completely checkless queries
        // This guarantees 0% hallucination for off-topic questions
        self.postMessage({ status: 'update', output: "I can mostly answer questions about the tech stack, hosting, architecture, and tools used in this portfolio." });
        self.postMessage({ status: 'complete', output: "I can mostly answer questions about the tech stack, hosting, architecture, and tools used in this portfolio." });
        return;
    }

    // Strict Fact Relay
    // Improved Prompting: Move Context to User Message to force attention
    const fullPrompt = `<|im_start|>system
You are a helpful assistant.
<|im_end|>
<|im_start|>user
Context: "${relevantFact}"

Question: ${text}

Instruction: Answer using ONLY the Context. Do not explain or define the technologies. List all tools mentioned in the Context.
<|im_end|>
<|im_start|>assistant
`;

    // GENERATE WITH STREAMING
    const output = await generator(fullPrompt, {
      max_new_tokens: 60,
      
      // Strict settings
      do_sample: false,     // Deterministic
      temperature: 0.01,    
      repetition_penalty: 1.0, // Allow repeating the context facts exactly
      return_full_text: false, // Important for raw prompt usage
      
      // STREAMING KEY
      callback_function: (beams: any[]) => {
          try {
            const decodedText = generator.tokenizer.decode(beams[0].output_token_ids, { skip_special_tokens: true });
            // Since we use raw prompt, we just get the new tokens
            const cleanText = decodedText.trim();
            if (cleanText.length > 0) {
                 self.postMessage({ status: 'update', output: cleanText });
            }
          } catch (e) {
             // ignore
          }
      }
    });

    // Final cleanup pass
    let finalResponse = "";
    if (output && output.length > 0) {
        // When using raw string prompt + return_full_text: false, 
        // the output is just the generated part.
        finalResponse = output[0].generated_text;
    }

    self.postMessage({ status: 'complete', output: finalResponse.trim() });

  } catch (error: any) {
    self.postMessage({ status: 'error', error: error.message });
  }
});
