
import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

const modelsToCheck = [
    { id: 'Xenova/vit-base-patch16-224-in21k', task: 'image-classification' },
    { id: 'Xenova/vit-base-patch16-224', task: 'image-classification' },
    { id: 'Xenova/vit-gpt2-image-captioning', task: 'image-to-text' },
    { id: 'Xenova/blip-image-captioning-base', task: 'image-to-text' }
];

async function checkModels() {
    console.log("Checking models...");
    
    for (const m of modelsToCheck) {
        console.log(`\n----------------------------------------`);
        console.log(`Checking ${m.id} for task ${m.task}...`);
        try {
            const pipe = await pipeline(m.task, m.id);
            console.log(`✅ Success loading ${m.id}`);
            
            if (m.task === 'image-classification') {
                // Check id2label to see number of classes
                if (pipe.model.config.id2label) {
                    const numLabels = Object.keys(pipe.model.config.id2label).length;
                    console.log(`   Classes: ${numLabels}`);
                    // Print a few sample labels to verify
                    const labels = Object.values(pipe.model.config.id2label);
                    console.log(`   Sample labels: ${labels.slice(0, 5).join(', ')}`);
                    
                    // Specific check for food items user cares about
                    const edamame = labels.find(l => l.includes('edamame'));
                    const pomegranate = labels.find(l => l.includes('pomegranate'));
                    console.log(`   Contains 'edamame': ${!!edamame}`);
                    console.log(`   Contains 'pomegranate': ${!!pomegranate}`);
                } else {
                    console.log(`   No id2label found in config.`);
                }
            }
            
            // cleanup if possible (not strictly available in all versions but good practice)
            if (pipe.dispose) await pipe.dispose();
            
        } catch (error) {
            console.log(`❌ Failed loading ${m.id}`);
            console.error(`   Error: ${error.message}`);
        }
    }
}

checkModels();
