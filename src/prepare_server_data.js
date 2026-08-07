import fs from 'fs';
import path from 'path';
import { config } from '../config/config.js';

// Configured Paths & Settings
const SOURCE_MATCHED_FILE = config.paths.sourceMatchedFile;
const OUTPUT_MINIFIED = config.paths.outputMinified;
const OUTPUT_LITE = config.paths.outputLite;
const OUTPUT_STATS = config.paths.outputStats;
const CHUNKS_DIR = config.paths.chunksDir;
const CHUNK_SIZE = config.dataset.chunkSize;


function createLiteRecord(item) {
    const gtData = item.globaltix_product_data || {};
    
    // Extract slim options summary
    const optionsSummary = (gtData.options || []).map(opt => {
        let rawTickets = opt.ticketType || opt.ticketTypes || opt.tickets || [];
        if (typeof rawTickets === 'object' && !Array.isArray(rawTickets)) {
            rawTickets = [rawTickets];
        }
        if (!Array.isArray(rawTickets)) {
            rawTickets = [];
        }

        const ticketTypes = rawTickets.map(tt => ({
            id: tt.id,
            sku: tt.sku || '',
            name: tt.name,
            nettPrice: tt.nettPrice,
            recommendedSellingPrice: tt.recommendedSellingPrice,
            retailPrice: tt.retailPrice,
            originalPrice: tt.originalPrice,
            currency: tt.currency
        }));

        return {
            id: opt.id,
            name: opt.name,
            ticket_count: ticketTypes.length,
            tickets: ticketTypes
        };
    });

    return {
        traviia_slug: item.traviia_slug,
        traviia_product_name: item.traviia_product_name,
        globaltix_product_id: item.globaltix_product_id,
        globaltix_matched_name: item.globaltix_matched_name,
        decision: item.decision,
        manual_note: item.manual_note,
        city: gtData.city,
        country: gtData.country,
        currency: gtData.currency,
        options_count: optionsSummary.length,
        options: optionsSummary
    };
}

function getFileSizeMB(filePath) {
    const stats = fs.statSync(filePath);
    return (stats.size / (1024 * 1024)).toFixed(2);
}

function main() {
    console.log(`[*] Loading source matched products file: ${SOURCE_MATCHED_FILE}`);
    if (!fs.existsSync(SOURCE_MATCHED_FILE)) {
        console.error(`[!] Error: Source file not found at ${SOURCE_MATCHED_FILE}`);
        process.exit(1);
    }

    const rawData = fs.readFileSync(SOURCE_MATCHED_FILE, 'utf-8');
    const matchedData = JSON.parse(rawData);
    const totalItems = matchedData.length;
    console.log(`[+] Total matched products loaded: ${totalItems}`);

    // 1. Save Minified File
    console.log(`[*] Creating Minified JSON: ${OUTPUT_MINIFIED} ...`);
    fs.writeFileSync(OUTPUT_MINIFIED, JSON.stringify(matchedData), 'utf-8');
    console.log(`    [+] Minified file created (${getFileSizeMB(OUTPUT_MINIFIED)} MB)`);

    // 2. Save Lite File
    console.log(`[*] Creating Lite Matching JSON: ${OUTPUT_LITE} ...`);
    const liteData = matchedData.map(createLiteRecord);
    fs.writeFileSync(OUTPUT_LITE, JSON.stringify(liteData, null, 2), 'utf-8');
    console.log(`    [+] Lite file created (${getFileSizeMB(OUTPUT_LITE)} MB)`);

    // 3. Save Chunked Files
    console.log(`[*] Creating Chunks in: ${CHUNKS_DIR} ...`);
    if (!fs.existsSync(CHUNKS_DIR)) {
        fs.mkdirSync(CHUNKS_DIR, { recursive: true });
    }

    const totalChunks = Math.ceil(totalItems / CHUNK_SIZE);
    const chunkInfo = [];

    for (let i = 0; i < totalChunks; i++) {
        const chunkSlice = matchedData.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const chunkIndexStr = String(i + 1).padStart(3, '0');
        const chunkFileName = `chunk_${chunkIndexStr}.json`;
        const chunkPath = path.join(CHUNKS_DIR, chunkFileName);

        fs.writeFileSync(chunkPath, JSON.stringify(chunkSlice), 'utf-8');
        const sizeMb = getFileSizeMB(chunkPath);
        console.log(`    [+] Chunk ${i + 1}/${totalChunks}: ${chunkFileName} (${chunkSlice.length} items, ${sizeMb} MB)`);

        chunkInfo.push({
            chunk: i + 1,
            file: chunkFileName,
            item_count: chunkSlice.length,
            size_mb: parseFloat(sizeMb)
        });
    }

    // 4. Save Stats Metadata
    const statsObj = {
        total_matched_products: totalItems,
        total_chunks: totalChunks,
        chunk_size: CHUNK_SIZE,
        files: {
            minified_json: { file: path.basename(OUTPUT_MINIFIED), size_mb: parseFloat(getFileSizeMB(OUTPUT_MINIFIED)) },
            lite_json: { file: path.basename(OUTPUT_LITE), size_mb: parseFloat(getFileSizeMB(OUTPUT_LITE)) }
        },
        chunks: chunkInfo,
        updated_at: new Date().toISOString()
    };
    fs.writeFileSync(OUTPUT_STATS, JSON.stringify(statsObj, null, 2), 'utf-8');
    console.log(`[*] Stats saved to: ${OUTPUT_STATS}`);

    console.log('\n[+] All Node.js server-friendly plan datasets successfully prepared!');
}

main();
