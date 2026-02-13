import { pipeline, env } from '@xenova/transformers';

// Skip local model checks
env.allowLocalModels = false;
env.useBrowserCache = true;

// Singleton pattern for the classifier
class ImageClassifier {
    static task = 'zero-shot-image-classification' as const;
    static model = 'Xenova/clip-vit-base-patch32';
    static instance: any = null;

    static async getInstance(progressCallback: any = null) {
        if (this.instance === null) {
            this.instance = await pipeline(this.task, this.model, { progress_callback: progressCallback });
        }
        return this.instance;
    }
}

const FOOD_LABELS = [
    // Problematic items (Ingredients, Snacks, Packaging)
    "raw pomegranate", "pomegranate seeds", "raw peanuts", "peanuts", 
    "edamame", "edamame in pod", "edamame beans",
    "packaged food", "food in plastic packaging", "snack packet", "bag of chips", "candy bar",
    "raw chicken", "raw meat", "uncooked pasta", "fresh vegetables", "fruit",

    // Food101 & Common Dishes
    "apple pie", "baby back ribs", "baklava", "beef carpaccio", "bibimbap", "breakfast burrito", 
    "bruschetta", "caesar salad", "cannoli", "caprese salad", "carrot cake", "ceviche", "cheesecake", 
    "chicken curry", "chicken wings", "chocolate cake", "churros", "clam chowder", "club sandwich", 
    "cupcakes", "deviled eggs", "donuts", "dumplings", "falafel", "filet mignon", "fish and chips", 
    "french fries", "french onion soup", "fried calamari", "fried rice", "frozen yogurt", "garlic bread", 
    "gnocchi", "greek salad", "grilled cheese sandwich", "grilled salmon", "guacamole", "gyoza", "hamburger", 
    "hot dog", "hummus", "ice cream", "lasagna", "lobster roll", "macaroni and cheese", "macarons", "miso soup", 
    "mussels", "nachos", "omelette", "onion rings", "pad thai", "paella", "pancakes", "peking duck", "pho", 
    "pizza", "pork chop", "poutine", "prime rib", "ramen", "ravioli", "risotto", "samosa", "sashimi", 
    "scallops", "spaghetti bolognese", "spaghetti carbonara", "spring rolls", "steak", "strawberry shortcake", 
    "sushi", "tacos", "takoyaki", "tiramisu", "tuna tartare", "waffles"
];

// Listen for messages from the main thread
self.addEventListener('message', async (event) => {
    const { image } = event.data;

    try {
        const classifier = await ImageClassifier.getInstance((x: any) => {
            // Forward loading progress
            self.postMessage({ status: 'progress', ...x });
        });

        // Zero-shot classification requires the image and the list of candidate labels
        const output = await classifier(image, FOOD_LABELS);

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
