import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/config.js';

const __filename = fileURLToPath(import.meta.url);
const QUEUE_FILE = config.paths.queueFile;
const LITE_FILE = config.paths.outputLite;
const MINIFIED_FILE = config.paths.outputMinified;
const MAX_RETRIES = config.queue.maxRetries;

export function loadQueue() {
    if (fs.existsSync(QUEUE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
        } catch (e) {
            console.error(`[!] Error loading queue.json: ${e.message}`);
        }
    }
    return {
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        total_enqueued: 0,
        items: {}
    };
}

export function saveQueue(queue) {
    queue.updated_at = new Date().toISOString();
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf-8');
}

export function buildQueue(sourceFile = null) {
    const targetFile = sourceFile || (fs.existsSync(LITE_FILE) ? LITE_FILE : MINIFIED_FILE);
    console.log(`[*] Building task queue list from: ${targetFile}`);

    if (!fs.existsSync(targetFile)) {
        throw new Error(`Source data file not found at ${targetFile}. Run 'npm run build-data' first.`);
    }

    const raw = fs.readFileSync(targetFile, 'utf-8');
    const sourceData = JSON.parse(raw);

    const existingQueue = loadQueue();
    const itemsMap = existingQueue.items || {};

    let newCount = 0;
    const duplicatesList = [];
    const seenGtIds = new Map();

    for (const item of sourceData) {
        const gtId = item.globaltix_product_id;
        if (!gtId) continue;

        if (!seenGtIds.has(gtId)) {
            seenGtIds.set(gtId, item);
            if (!itemsMap[gtId]) {
                itemsMap[gtId] = {
                    globaltix_product_id: gtId,
                    traviia_slug: item.traviia_slug,
                    traviia_product_name: item.traviia_product_name,
                    status: 'pending',
                    attempts: 0,
                    last_attempt_at: null,
                    error: null
                };
                newCount++;
            }
        } else {
            const primaryItem = seenGtIds.get(gtId);
            duplicatesList.push({
                globaltix_product_id: gtId,
                duplicate_traviia_slug: item.traviia_slug,
                duplicate_traviia_name: item.traviia_product_name,
                primary_traviia_slug: primaryItem.traviia_slug,
                primary_traviia_name: primaryItem.traviia_product_name,
                reason: `Duplicate GlobalTix Product ID ${gtId} matched multiple Traviia products. Primary task enqueued under '${primaryItem.traviia_slug}'.`,
                globaltix_info: {
                    matched_name: item.globaltix_matched_name || item.globaltix_product_data?.name || null,
                    country: item.globaltix_product_data?.country || null,
                    city: item.globaltix_product_data?.city || null
                }
            });
        }
    }

    if (duplicatesList.length > 0) {
        const duplicateExportData = {
            total_dataset_items: sourceData.length,
            unique_globaltix_products: Object.keys(itemsMap).length,
            total_duplicate_entries: duplicatesList.length,
            updated_at: new Date().toISOString(),
            duplicates: duplicatesList
        };
        const dupeFile = config.paths.duplicateExportFile || './duplicate_products_export.json';
        fs.writeFileSync(dupeFile, JSON.stringify(duplicateExportData, null, 2), 'utf-8');
        console.log(`[+] Duplicates Tracked: Logged ${duplicatesList.length} duplicate entry(ies) to ${dupeFile}`);
    }

    const updatedQueue = {
        created_at: existingQueue.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        total_enqueued: Object.keys(itemsMap).length,
        items: itemsMap
    };

    saveQueue(updatedQueue);
    console.log(`[+] Task Queue Built: ${Object.keys(itemsMap).length} total unique tasks (${newCount} newly enqueued).`);
    return updatedQueue;
}

export function getPendingItems(limit = 100) {
    const queue = loadQueue();
    const pending = [];

    for (const id in queue.items) {
        const task = queue.items[id];
        if (task.status === 'pending') {
            pending.push(task);
            if (pending.length >= limit) break;
        }
    }
    return pending;
}

export function markProcessing(gtIds) {
    const queue = loadQueue();
    const now = new Date().toISOString();
    const idList = Array.isArray(gtIds) ? gtIds : [gtIds];

    for (const id of idList) {
        if (queue.items[id]) {
            queue.items[id].status = 'processing';
            queue.items[id].attempts += 1;
            queue.items[id].last_attempt_at = now;
        }
    }
    saveQueue(queue);
}

export function markCompleted(gtId) {
    const queue = loadQueue();
    if (queue.items[gtId]) {
        queue.items[gtId].status = 'completed';
        queue.items[gtId].error = null;
        saveQueue(queue);
    }
}

export function markFailed(gtId, errorMsg) {
    const queue = loadQueue();
    if (queue.items[gtId]) {
        const item = queue.items[gtId];
        item.error = String(errorMsg);
        if (item.attempts < MAX_RETRIES) {
            item.status = 'pending'; // Re-queue automatically for retry
            console.log(`[RE-QUEUED] Task ${gtId} failed (${item.attempts}/${MAX_RETRIES}). Will retry.`);
        } else {
            item.status = 'failed';
            console.error(`[FAILED] Task ${gtId} reached max retries (${MAX_RETRIES}).`);
        }
        saveQueue(queue);
    }
}

export function retryFailed() {
    const queue = loadQueue();
    let resetCount = 0;

    for (const id in queue.items) {
        if (queue.items[id].status === 'failed') {
            queue.items[id].status = 'pending';
            queue.items[id].attempts = 0;
            queue.items[id].error = null;
            resetCount++;
        }
    }

    saveQueue(queue);
    console.log(`[+] Re-enqueued ${resetCount} failed tasks back to 'pending'.`);
    return resetCount;
}

export function resetQueue() {
    const queue = loadQueue();
    let resetCount = 0;

    for (const id in queue.items) {
        queue.items[id].status = 'pending';
        queue.items[id].attempts = 0;
        queue.items[id].error = null;
        resetCount++;
    }

    saveQueue(queue);
    console.log(`[+] Reset all ${resetCount} tasks in queue back to 'pending'.`);
    return resetCount;
}

export function getStats() {
    const queue = loadQueue();
    const stats = {
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        created_at: queue.created_at,
        updated_at: queue.updated_at
    };

    for (const id in queue.items) {
        const st = queue.items[id].status || 'pending';
        stats.total++;
        if (stats[st] !== undefined) {
            stats[st]++;
        }
    }
    return stats;
}

export function cleanAllStateFiles() {
    const filesToDelete = [
        config.paths.queueFile,
        config.paths.progressFile,
        config.paths.dbExportFile
    ];

    let deletedCount = 0;
    for (const f of filesToDelete) {
        if (fs.existsSync(f)) {
            fs.unlinkSync(f);
            console.log(`[+] Deleted state file: ${path.basename(f)}`);
            deletedCount++;
        }
    }
    console.log(`[+] Cleanup completed: ${deletedCount} state files removed.`);
}

export function enqueueProduct(productId, traviiaSlug, traviiaProductName) {
    const queue = loadQueue();
    if (!queue.items) queue.items = {};
    const strId = String(productId);
    queue.items[strId] = {
        globaltix_product_id: Number(productId),
        traviia_slug: traviiaSlug,
        traviia_product_name: traviiaProductName || traviiaSlug,
        status: 'pending',
        attempts: 0,
        last_attempt_at: null,
        error: null
    };
    queue.updated_at = new Date().toISOString();
    saveQueue(queue);
    console.log(`[+] Successfully enqueued Product ID ${productId} ('${traviiaSlug}') into queue.`);
}

// CLI handler
if (process.argv[1] === __filename) {
    const command = process.argv[2] || 'status';

    if (command === 'build') {
        buildQueue();
    } else if (command === 'enqueue' || command === 'add-product') {
        const prodId = process.argv[3];
        const slug = process.argv[4];
        const name = process.argv[5] || slug;
        if (!prodId || !slug) {
            console.error('[!] Usage: node queue_manager.js enqueue <product_id> <traviia_slug> [product_name]');
            process.exit(1);
        }
        enqueueProduct(prodId, slug, name);
    } else if (command === 'retry') {
        retryFailed();
    } else if (command === 'reset') {
        resetQueue();
    } else if (command === 'clean') {
        cleanAllStateFiles();
    } else {
        const stats = getStats();
        console.log(`=======================================================`);
        console.log(` GlobalTix Plan Queue Status List`);
        console.log(`=======================================================`);
        console.log(` Queue File : ${QUEUE_FILE}`);
        console.log(` Total Tasks: ${stats.total}`);
        console.log(` ⏳ Pending  : ${stats.pending}`);
        console.log(` ⚙️ Processing: ${stats.processing}`);
        console.log(` ✅ Completed: ${stats.completed}`);
        console.log(` ❌ Failed   : ${stats.failed}`);
        console.log(` Last Updated: ${stats.updated_at}`);
        console.log(`=======================================================`);
    }
}
