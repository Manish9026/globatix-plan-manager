import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadRawConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        console.warn(`[!] config.json not found at ${CONFIG_PATH}, using default values.`);
        return {};
    }
    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch (e) {
        console.error(`[!] Error parsing config.json: ${e.message}`);
        return {};
    }
}

const rawConfig = loadRawConfig();

function resolvePath(relativePath, defaultRel) {
    const p = relativePath || defaultRel;
    return path.isAbsolute(p) ? p : path.resolve(PROJECT_ROOT, p);
}

// Resolved configuration object
export const config = {
    paths: {
        sourceMatchedFile: resolvePath(rawConfig.paths?.sourceMatchedFile, '../globatix_product/globaltix_matched_ready_products.json'),
        outputMinified: resolvePath(rawConfig.paths?.outputMinified, './data/globaltix_matched_ready_products.min.json'),
        outputLite: resolvePath(rawConfig.paths?.outputLite, './data/globaltix_matched_ready_products_lite.json'),
        outputStats: resolvePath(rawConfig.paths?.outputStats, './data/stats.json'),
        chunksDir: resolvePath(rawConfig.paths?.chunksDir, './data/chunks'),
        progressFile: resolvePath(rawConfig.paths?.progressFile, './data/import_progress.json'),
        queueFile: resolvePath(rawConfig.paths?.queueFile, './data/queue.json'),
        dbExportFile: resolvePath(rawConfig.paths?.dbExportFile, './data/db_ready_plans_export.json'),
        duplicateExportFile: resolvePath(rawConfig.paths?.duplicateExportFile, './data/duplicate_products_export.json')
    },
    dataset: {
        chunkSize: parseInt(process.env.CHUNK_SIZE || rawConfig.dataset?.chunkSize || 500, 10)
    },
    queue: {
        autoEnqueue: rawConfig.queue?.autoEnqueue ?? true,
        maxRetries: parseInt(rawConfig.queue?.maxRetries || 3, 10)
    },
    server: {
        baseUrl: (process.env.BACKEND_URL || rawConfig.server?.baseUrl || 'http://localhost:8080').replace(/\/$/, ''),
        apiKey: process.env.ADMIN_API_KEY || rawConfig.server?.apiKey || '',
        prod_write_allow: process.env.PROD_WRITE_ALLOW ? (process.env.PROD_WRITE_ALLOW === 'true') : (rawConfig.server?.prod_write_allow ?? false),
        getLiveOptionsEndpointPattern: rawConfig.server?.getLiveOptionsEndpointPattern || '/api/v1/globaltix/product/options/{id}',
        variantPlanEndpointPattern: rawConfig.server?.variantPlanEndpointPattern || '/api/v1/variant/details/{slug}/variantDetails'
    },
    importer: {
        concurrency: parseInt(process.env.CONCURRENCY || rawConfig.importer?.concurrency || 5, 10),
        useQueue: rawConfig.importer?.useQueue ?? true,
        importMode: process.env.IMPORT_MODE || rawConfig.importer?.importMode || 'upsert',
        mode: process.env.MODE || rawConfig.importer?.mode || 'add',
        defaultAvailability: rawConfig.importer?.defaultAvailability ?? false,
        dryRun: rawConfig.importer?.dryRun || false,
        timeoutMs: parseInt(process.env.TIMEOUT_MS || rawConfig.importer?.timeoutMs || 60000, 10),
        retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || rawConfig.importer?.retryAttempts || 3, 10),
        retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || rawConfig.importer?.retryDelayMs || 2000, 10),
        batchDelayMs: parseInt(process.env.BATCH_DELAY_MS || rawConfig.importer?.batchDelayMs || 1500, 10),
        requestDelayMs: parseInt(process.env.REQUEST_DELAY_MS || rawConfig.importer?.requestDelayMs || 300, 10)
    }
};

export default config;
