import fs from 'fs';
import path from 'path';
import { config } from '../config/config.js';
import * as QueueManager from './queue_manager.js';

export { config, QueueManager };

export const PATHS = {
    minified: config.paths.outputMinified,
    lite: config.paths.outputLite,
    stats: config.paths.outputStats,
    chunksDir: config.paths.chunksDir,
    progress: config.paths.progressFile,
    queue: config.paths.queueFile
};

export function loadLiteData() {
    if (!fs.existsSync(PATHS.lite)) {
        throw new Error(`Lite data file not found at ${PATHS.lite}. Run 'npm run build-data' first.`);
    }
    return JSON.parse(fs.readFileSync(PATHS.lite, 'utf-8'));
}

export function loadMinifiedData() {
    if (!fs.existsSync(PATHS.minified)) {
        throw new Error(`Minified data file not found at ${PATHS.minified}. Run 'npm run build-data' first.`);
    }
    return JSON.parse(fs.readFileSync(PATHS.minified, 'utf-8'));
}

export function loadChunk(chunkNumber) {
    const chunkStr = String(chunkNumber).padStart(3, '0');
    const chunkPath = path.join(PATHS.chunksDir, `chunk_${chunkStr}.json`);
    if (!fs.existsSync(chunkPath)) {
        throw new Error(`Chunk file not found at ${chunkPath}`);
    }
    return JSON.parse(fs.readFileSync(chunkPath, 'utf-8'));
}

export function findBySlug(slug) {
    const data = loadLiteData();
    return data.filter(item => item.traviia_slug === slug);
}

export function findByGlobalTixId(gtId) {
    const data = loadLiteData();
    return data.find(item => item.globaltix_product_id === parseInt(gtId, 10));
}

// CLI usage message
if (process.argv[1] === path.resolve(import.meta.url.replace('file:///', ''))) {
    console.log(`=======================================================`);
    console.log(` GlobalTix Plan Server Tools (Node.js)`);
    console.log(`=======================================================`);
    console.log(`Available Commands:`);
    console.log(`  npm run build-data   - Build server-friendly JSONs (minified, lite, chunks)`);
    console.log(`  npm run import-plans - Import ready matched product plans into database/backend API`);
    console.log(`  npm run queue:build  - Build / Populate task queue list`);
    console.log(`  npm run queue:status - Check task queue status counts`);
    console.log(`  npm run queue:retry  - Re-enqueue failed tasks`);
    console.log(`  npm run queue:reset  - Reset all queue tasks to pending`);
    console.log(`\nImport Options:`);
    console.log(`  node import_plans.js --use-queue`);
    console.log(`  node import_plans.js --dry-run`);
    console.log(`  node import_plans.js --base-url http://localhost:8080 --concurrency 10`);
    console.log(`=======================================================`);
}

