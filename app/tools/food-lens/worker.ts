import { pipeline, env } from '@xenova/transformers';

// Skip local model checks
env.allowLocalModels = false;
env.useBrowserCache = true;

// Singleton pattern for the classifier
class ImageClassifier {
    static task = 'image-classification' as const;
    static model = 'Xenova/vit-base-patch16-224-in21k-finetuned-food101';
    static instance: any = null;

    static async getInstance(progressCallback: any = null) {
        if (this.instance === null) {
            this.instance = await pipeline(this.task, this.model, { progress_callback: progressCallback });
        }
        return this.instance;
    }
}

// Listen for messages from the main thread
self.addEventListener('message', async (event) => {
    const { image } = event.data;

    try {
        const classifier = await ImageClassifier.getInstance((x: any) => {
            // Forward loading progress
            self.postMessage({ status: 'progress', ...x });
        });

        const output = await classifier(image);

        // Send the result back
        self.postMessage({
            status: 'complete',
            result: output
        });

    } catch (err: any) {
        self.postMessage({
            status: 'error',
            error: err.message
        });
    }
});
