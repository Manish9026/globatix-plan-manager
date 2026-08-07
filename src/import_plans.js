import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import readline from 'readline';
import { config } from '../config/config.js';

function askConfirmation(promptText) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question(promptText, (answer) => {
            rl.close();
            const trimmed = String(answer || '').trim().toLowerCase();
            resolve(trimmed === 'y' || trimmed === 'yes');
        });
    });
}
import {
    loadQueue,
    buildQueue,
    getPendingItems,
    markProcessing,
    markCompleted,
    markFailed,
    getStats
} from './queue_manager.js';

// Production Server Safety: Global Error Catching
process.on('unhandledRejection', (reason, promise) => {
    console.error('[!] Unhandled Promise Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[!] Uncaught Exception:', err);
});

// Paths & Defaults from Config
const CHUNKS_DIR = config.paths.chunksDir;
const PROGRESS_FILE = config.paths.progressFile;

// Parse CLI flags (overrides config values)
const args = process.argv.slice(2);
function getArg(flag, defaultValue = null) {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) {
        return args[idx + 1];
    }
    return defaultValue;
}
const isDryRun = args.includes('--dry-run') || config.importer.dryRun;
const useQueueMode = args.includes('--use-queue') || config.importer.useQueue;
const chunkNum = getArg('--chunk', null);
const baseUrl = getArg('--base-url', config.server.baseUrl).replace(/\/$/, '');
const concurrency = parseInt(getArg('--concurrency', String(config.importer.concurrency)), 10);
const apiKey = getArg('--api-key', config.server.apiKey || '');
const limit = parseInt(getArg('--limit', '0'), 10);
const skipConfirm = args.includes('--yes') || args.includes('-y') || config.importer.skipConfirm || false;

function loadProgress() {
    if (fs.existsSync(PROGRESS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
        } catch (e) {
            return { completed_ids: [], failed_ids: {} };
        }
    }
    return { completed_ids: [], failed_ids: {} };
}

function saveProgress(progress) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf-8');
}

function makePostRequest(urlStr, headers = {}, bodyData = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const transport = url.protocol === 'https:' ? https : http;

        const postData = bodyData ? JSON.stringify(bodyData) : '';

        const reqOptions = {
            method: 'POST',
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Accept': 'application/json',
                ...headers
            }
        };

        const req = transport.request(reqOptions, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ statusCode: res.statusCode, data: parsed });
                } catch (err) {
                    resolve({ statusCode: res.statusCode, raw: body });
                }
            });
        });

        req.on('error', (e) => reject(e));
        if (postData) req.write(postData);
        req.end();
    });
}

function makePatchRequest(urlStr, headers = {}, bodyData = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const transport = url.protocol === 'https:' ? https : http;

        const patchData = bodyData ? JSON.stringify(bodyData) : '';

        const reqOptions = {
            method: 'PATCH',
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(patchData),
                'Accept': 'application/json',
                ...headers
            }
        };

        const req = transport.request(reqOptions, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ statusCode: res.statusCode, data: parsed });
                } catch (err) {
                    resolve({ statusCode: res.statusCode, raw: body });
                }
            });
        });

        req.on('error', (e) => reject(e));
        if (patchData) req.write(patchData);
        req.end();
    });
}

function makeGetRequest(urlStr, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const transport = url.protocol === 'https:' ? https : http;

        const reqOptions = {
            method: 'GET',
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            headers: {
                'Accept': 'application/json',
                ...headers
            }
        };

        const req = transport.request(reqOptions, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ statusCode: res.statusCode, data: parsed });
                } catch (err) {
                    resolve({ statusCode: res.statusCode, raw: body });
                }
            });
        });

        req.setTimeout(60000, () => {
            req.destroy(new Error('HTTP GET request timeout (60s)'));
        });

        req.on('error', (e) => reject(e));
        req.end();
    });
}

function makeDeleteRequest(urlStr, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const transport = url.protocol === 'https:' ? https : http;

        const reqOptions = {
            method: 'DELETE',
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            headers: {
                'Accept': 'application/json',
                ...headers
            }
        };

        const req = transport.request(reqOptions, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ statusCode: res.statusCode, data: parsed });
                } catch (err) {
                    resolve({ statusCode: res.statusCode, raw: body });
                }
            });
        });

        req.setTimeout(60000, () => {
            req.destroy(new Error('HTTP DELETE request timeout (60s)'));
        });

    });
}

function parseLiveOptions(resData) {
    if (!resData) return [];
    let payload = resData.data !== undefined ? resData.data : resData;
    if (typeof payload === 'object' && payload !== null) {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload.data)) return payload.data;
        if (Array.isArray(payload.options)) return payload.options;
        if (Array.isArray(payload.option)) return payload.option;
        if (Array.isArray(payload.ticketOptions)) return payload.ticketOptions;
    }
    return Array.isArray(payload) ? payload : [];
}

const DB_EXPORT_FILE = config.paths.dbExportFile;
const isProdWriteAllowed = args.includes('--prod-write-allow') || config.server.prod_write_allow;

function saveDbExportProduct(slug, gtId, plansList) {
    let existingData = {};
    if (fs.existsSync(DB_EXPORT_FILE)) {
        try {
            existingData = JSON.parse(fs.readFileSync(DB_EXPORT_FILE, 'utf-8'));
            if (Array.isArray(existingData)) existingData = {};
        } catch (e) {
            existingData = {};
        }
    }
    existingData[slug] = {
        activity_slug: slug,
        globaltix_product_id: gtId,
        plans_count: plansList.length,
        updated_at: new Date().toISOString(),
        plans: plansList
    };
    fs.writeFileSync(DB_EXPORT_FILE, JSON.stringify(existingData, null, 2), 'utf-8');
}

async function processProduct(item, progress, headers) {
    const gtId = item.globaltix_product_id;
    const slug = item.traviia_slug;

    if (!useQueueMode && progress.completed_ids.includes(gtId)) {
        console.log(`[SKIPPED] Product ID ${gtId} (${slug}) already processed.`);
        return { success: true, skipped: true };
    }

    if (isDryRun) {
        console.log(`[DRY-RUN] Would import Product ID: ${gtId} | Slug: ${slug}`);
        if (useQueueMode) {
            markCompleted(gtId);
        }
        return { success: true, dryRun: true };
    }

    const planPattern = config.server.variantPlanEndpointPattern;

    const planPath = planPattern.replace('{slug}', encodeURIComponent(slug));
    const createPlanEndpoint = `${baseUrl}${planPath.startsWith('/') ? '' : '/'}${planPath}`;

    const timestamp = () => new Date().toLocaleTimeString('en-GB');
    console.log(`\n[${timestamp()}] [*] Processing Product ID ${gtId} -> '${slug}'`);
    const gtData = item.globaltix_product_data || {};
    let options = gtData.options || [];

    // Fetch LIVE options directly from GET /api/v1/globaltix/product/options/{product_id}
    try {
        const liveOptionsPattern = config.server.getLiveOptionsEndpointPattern || '/api/v1/globaltix/product/options/{id}';
        const livePath = liveOptionsPattern.replace('{id}', gtId);
        const baseLiveUrl = `${baseUrl}${livePath.startsWith('/') ? '' : '/'}${livePath}`;
        const sep = baseLiveUrl.includes('?') ? '&' : '?';

        // Primary attempt: default isDynamicPrice=true
        const urlTrue = `${baseLiveUrl}${sep}isDynamicPrice=true`;
        console.log(`    [LIVE-GET] Requesting options (isDynamicPrice=true) -> ID ${gtId}`);
        let liveRes = await makeGetRequest(urlTrue, headers);
        let liveOptionsList = (liveRes.statusCode === 200) ? parseLiveOptions(liveRes.data) : [];

        // Fallback attempt: if no options found, try isDynamicPrice=false
        if (!liveOptionsList || liveOptionsList.length === 0) {
            const urlFalse = `${baseLiveUrl}${sep}isDynamicPrice=false`;
            console.log(`    [LIVE-GET] [!] No options found with isDynamicPrice=true. Retrying with isDynamicPrice=false -> ID ${gtId}`);
            liveRes = await makeGetRequest(urlFalse, headers);
            if (liveRes.statusCode === 200) {
                liveOptionsList = parseLiveOptions(liveRes.data);
            }
        }

        if (liveOptionsList && liveOptionsList.length > 0) {
            options = liveOptionsList;
            console.log(`    [LIVE-GET] [+] Successfully retrieved ${options.length} live option(s) from API for ID ${gtId}.`);
        }
    } catch (e) {
        console.warn(`    [LIVE-GET] [!] Live options fetch exception (${e.message}), using local dataset options.`);
    }

    if (options.length === 0) {
        console.log(`[!] SKIPPED: Product ID ${gtId} (${slug}) has no options to create plans for.`);
        if (useQueueMode) markCompleted(gtId);
        return { success: true, skipped: true };
    }

    let createdCount = 0;
    const compiledPlans = [];

    let existingGlobaltixPlans = [];
    if (isProdWriteAllowed) {
        try {
            const getPlansEndpoint = `${baseUrl}/api/v1/variant/details/${encodeURIComponent(slug)}/variantDetails`;
            const getPlansRes = await makeGetRequest(getPlansEndpoint, headers);
            if (getPlansRes.statusCode === 200 && getPlansRes.data && Array.isArray(getPlansRes.data.data)) {
                existingGlobaltixPlans = getPlansRes.data.data.filter(p => {
                    const src = p.association?.source || p.activityPlan_Association?.source || p.properties?.source;
                    return String(src || '').toLowerCase() === 'globaltix';
                });
                if (existingGlobaltixPlans.length > 0) {
                    console.log(`    [GET-PLANS] Found ${existingGlobaltixPlans.length} existing GlobalTix plan(s) for ${slug}`);
                }
            }
        } catch (e) {
            // Non-fatal GET warning
        }
    }

    for (const opt of options) {
        if (!opt || opt.id === undefined || opt.id === null) continue;
        const optionId = opt.id;
        const planName = opt.name || `GlobalTix Option ${optionId}`;
        const planSlug = `${slug}-${optionId}`;

        const rawTickets = opt.ticketType || opt.ticketTypes || opt.tickets || [];
        const tickets = Array.isArray(rawTickets) ? rawTickets : [rawTickets];

        // Classification helper for proper ticket types
        const classifyTicketType = (name) => {
            const raw = String(name || '').toLowerCase();
            if (raw.includes('child') || raw.includes('kid') || raw.includes('junior') || raw.includes('son')) return 'child';
            if (raw.includes('infant') || raw.includes('baby') || raw.includes('toddler')) return 'infant';
            if (raw.includes('senior') || raw.includes('elderly')) return 'senior';
            if (raw.includes('student') || raw.includes('youth')) return 'student';
            if (raw.includes('package') || raw.includes('combo')) return 'package';
            if (raw.includes('general') || raw.includes('standard')) return 'general';
            if (raw.includes('adult')) return 'adult';
            return 'adult';
        };

        // Priority ranking: Adult/General/Senior/Package preferred over Child/Infant
        const getTicketPriority = (type) => {
            switch (type) {
                case 'adult': return 1;
                case 'general': return 2;
                case 'senior': return 3;
                case 'package': return 4;
                case 'student': return 5;
                case 'child': return 6;
                case 'infant': return 7;
                default: return 8;
            }
        };

        const ticketTypesList = [];
        let primaryTicket = null;
        let bestPriority = 999;

        for (const ticket of tickets) {
            if (!ticket || ticket.id === undefined || ticket.id === null) continue;
            const ticketId = ticket.id;
            const rawTicketType = ticket.type || ticket.name || 'ADULT';
            const ticketName = ticket.name || ticket.type || 'ADULT';
            const ticketSku = ticket.sku || '';
            const ticketType = classifyTicketType(rawTicketType);

            ticketTypesList.push({
                id: ticketId,
                sku: ticketSku,
                name: ticketName,
                type: ticketType
            });

            const prio = getTicketPriority(ticketType);
            if (!primaryTicket || prio < bestPriority) {
                primaryTicket = ticket;
                bestPriority = prio;
            }
        }

        if (ticketTypesList.length === 0 || !primaryTicket) continue;

        const basePrice = primaryTicket.recommendedSellingPrice || primaryTicket.nettPrice || primaryTicket.retailPrice || primaryTicket.originalPrice || 0;
        const recSellingPrice = primaryTicket.recommendedSellingPrice !== undefined ? primaryTicket.recommendedSellingPrice : null;
        const nettPrice = primaryTicket.nettPrice !== undefined ? primaryTicket.nettPrice : null;
        const retailPrice = primaryTicket.retailPrice !== undefined ? primaryTicket.retailPrice : null;
        const originalPrice = primaryTicket.originalPrice !== undefined ? primaryTicket.originalPrice : null;
        const ticketCurrency = primaryTicket.currency || opt.currency || gtData.currency || 'SGD';
        const minQty = primaryTicket.minPurchaseQty || primaryTicket.minQuantity || 1;
        const maxQty = primaryTicket.maxPurchaseQty || primaryTicket.maxQuantity || 10;
        const primaryType = classifyTicketType(primaryTicket.type || primaryTicket.name || 'ADULT');

        // Helper to clean HTML text
        const cleanText = (str) => {
            if (!str) return '';
            return String(str)
                .replace(/<p>|<\/p>|<br\s*\/?>|<li>|<\/li>|<ul>|<\/ul>/gi, '\n')
                .replace(/&nbsp;/g, ' ')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        };

        // Compile rich info string from actual GlobalTix fields
        const compileInfo = () => {
            const parts = [];
            const inc = opt.inclusions || gtData.inclusions || [];
            const exc = opt.exclusions || gtData.exclusions || [];
            if (inc.length > 0 || exc.length > 0) {
                let text = 'Includes/Excludes:\n';
                if (inc.length > 0) text += 'Includes:\n' + inc.filter(Boolean).join('\n') + '\n';
                if (exc.length > 0) text += 'Excludes:\n' + exc.filter(Boolean).join('\n');
                parts.push(text.trim());
            }

            const descText = cleanText(opt.description || '');
            if (descText) parts.push(`Package Description:\n${descText}`);

            const canc = opt.cancellationNotes || opt.cancellationPolicy || gtData.cancellationNotes || [];
            const cancList = Array.isArray(canc) ? canc.filter(Boolean) : (canc ? [canc] : []);
            if (cancList.length > 0) parts.push(`Cancellation Policy:\n${cancList.join('\n')}`);

            const htu = opt.howToUse || gtData.howToUse || [];
            const htuList = Array.isArray(htu) ? htu.filter(Boolean) : (htu ? [htu] : []);
            if (htuList.length > 0) parts.push(`Voucher Redemption Period / How To Use:\n${htuList.join('\n')}`);

            const termsText = cleanText(opt.termsAndConditions || gtData.termsAndConditions || '');
            if (termsText && termsText.toLowerCase() !== 'nil' && termsText !== '--') {
                parts.push(`Terms & Conditions:\n${termsText}`);
            }

            return parts.length > 0 ? parts.join('\n\n') : null;
        };

        // Determine image URL from actual GlobalTix data or null
        let imageUrl = null;
        if (opt.image) imageUrl = opt.image;
        else if (gtData.image) imageUrl = gtData.image;
        else if (gtData.media && gtData.media[0] && gtData.media[0].path) {
            imageUrl = `https://media.globaltix.com/${gtData.media[0].path}`;
        }

        // Determine tags and categories from actual GlobalTix data or null
        let tags = null;
        if (gtData.highlights && Array.isArray(gtData.highlights) && gtData.highlights.length > 0) {
            tags = gtData.highlights.map(h => String(h).toLowerCase().trim()).slice(0, 5);
        } else if (gtData.keywords && typeof gtData.keywords === 'string') {
            tags = gtData.keywords.split(',').map(k => k.toLowerCase().trim()).filter(Boolean);
        }

        let categories = null;
        if (gtData.category) {
            categories = [String(gtData.category).toLowerCase().trim()];
        }

        const parseOperatingTimes = (text) => {
            if (!text || typeof text !== 'string') return { openTime: "00:00", closeTime: "23:59", infoStr: "Open" };
            const m = text.match(/(\d{1,2}:\d{2})\s*[~-]\s*(\d{1,2}:\d{2})/);
            if (m) {
                const openTime = m[1].padStart(5, '0');
                const closeTime = m[2].padStart(5, '0');
                return { openTime, closeTime, infoStr: `${openTime} - ${closeTime}` };
            }
            return { openTime: "00:00", closeTime: "23:59", infoStr: "Open" };
        };

        const hoursSource = opt.description || opt.termsAndConditions || gtData.description || gtData.summary || '';
        const { openTime, closeTime, infoStr } = parseOperatingTimes(hoursSource);

        const realDayInfo = {
            is_Open: true,
            info: infoStr,
            opening_Time: openTime,
            closing_Time: closeTime,
            timing_Slot_List: [],
            price_PerPerson: {}
        };
        const weekOpeningInfo = {
            Mon: { ...realDayInfo },
            Tues: { ...realDayInfo },
            Weds: { ...realDayInfo },
            Thur: { ...realDayInfo },
            Fri: { ...realDayInfo },
            Sat: { ...realDayInfo },
            Sun: { ...realDayInfo }
        };

        const cleanListingPrice = {
            type: primaryTicket.type || primaryTicket.name || 'PER_PERSON',
            final_price: Math.ceil(basePrice),
            currency_code: ticketCurrency
        };
        if (originalPrice !== null && originalPrice !== undefined) cleanListingPrice.original_price = Math.ceil(originalPrice);
        if (nettPrice !== null && nettPrice !== undefined) cleanListingPrice.net_price = Math.ceil(nettPrice);
        if (recSellingPrice !== null && recSellingPrice !== undefined) cleanListingPrice.recommended_selling_price = Math.ceil(recSellingPrice);
        if (retailPrice !== null && retailPrice !== undefined) cleanListingPrice.retail_price = Math.ceil(retailPrice);

        // Step 1 Payload: Create Activity Plan (Table: activity_plans) per option
        const planPayload = {
            unique_id: `globaltix-${optionId}`,
            slug: planSlug,
            activity_slug: slug,
            name: planName,
            info: compileInfo() || "",
            type: primaryType || 'adult',
            description: cleanText(opt.description || gtData.description || gtData.summary || opt.name || '') || planName,
            inventory_type: 'FIXED',
            image_url: imageUrl || "",
            tags: tags,
            categories: categories,
            min_purchase_count: minQty,
            max_purchase_count: maxQty,
            availability: config.importer.defaultAvailability ?? false,
            week_opening_info: weekOpeningInfo,
            listing_price: cleanListingPrice,
            properties: null,
            association: {
                source: 'globaltix',
                prod_no: gtId,
                option_id: optionId,
                pkg_no: primaryTicket.id,
                ticket_type_id: primaryTicket.id,
                ticketTypeId: primaryTicket.id,
                ticket_types: ticketTypesList
            }
        };

        if (!isProdWriteAllowed) {
            compiledPlans.push({
                target_table_activity_plans: planPayload,
                created_at: new Date().toISOString()
            });
        } else {
            // PROD WRITE ALLOWED MODE: Check for existing GlobalTix plan match first
            const allMatches = existingGlobaltixPlans.filter(p => {
                let optId = p.association?.option_id || p.association?.optionId || p.properties?.option_id;
                if (!optId && p.unique_id && String(p.unique_id).includes('globaltix-')) {
                    const parts = String(p.unique_id).split('-');
                    optId = parts[parts.length - 1];
                }
                return String(optId) === String(optionId);
            });
            const existingMatch = allMatches[0];

            // If extra duplicate plans exist for the same option, DELETE duplicate GlobalTix plans ONLY if explicitly enabled in config
            const shouldDeleteDuplicates = config.importer.deleteDuplicates === true;
            if (allMatches.length > 1 && isProdWriteAllowed && shouldDeleteDuplicates) {
                for (const extraDup of allMatches.slice(1)) {
                    const extraSource = String(
                        extraDup.association?.source || 
                        extraDup.activityPlan_Association?.source || 
                        ''
                    ).toLowerCase();

                    // CRITICAL SAFETY CHECK: ONLY delete if source is explicitly 'globaltix'
                    if (extraDup.id && extraSource === 'globaltix') {
                        try {
                            const deleteUrl = `${baseUrl}/api/v1/variant/details/${encodeURIComponent(slug)}/variantDetails/${extraDup.id}`;
                            const delRes = await makeDeleteRequest(deleteUrl, headers);
                            if (delRes.statusCode === 200 && delRes.data && delRes.data.status !== false) {
                                console.log(`    [DELETE-DUP] [-] Deleted duplicate GlobalTix Plan ID ${extraDup.id} for option ${optionId}`);
                            } else {
                                console.warn(`    [DELETE-DUP] [!] Failed to delete duplicate Plan ID ${extraDup.id}: ${JSON.stringify(delRes.data || delRes.raw)}`);
                            }
                        } catch (dErr) {
                            console.error(`    [DELETE-DUP] [!] Error deleting duplicate Plan ID ${extraDup.id}: ${dErr.message}`);
                        }
                    } else if (extraDup.id) {
                        console.log(`    [SAFETY-SKIP] [!] Skipped non-GlobalTix plan ID ${extraDup.id} (source='${extraSource}') from deletion.`);
                    }
                }
            }

            // Check if mode is explicitly 'patch_only', 'patch', or 'update'
            const currentMode = String(config.importer.mode || 'upsert').toLowerCase();
            if (currentMode !== 'patch_only' && currentMode !== 'patch' && currentMode !== 'update') {
                // Execute live HTTP POST request (Upserts plan, updating slug, unique_id, listing_price, and availability in PostgreSQL)
                try {
                    const planRes = await makePostRequest(createPlanEndpoint, headers, planPayload);
                    if (planRes.statusCode === 200 && planRes.data && planRes.data.status !== false) {
                        console.log(`    [PROD-WRITE] [+] Plan Upserted (POST): ${planSlug} for Activity (${slug})`);
                        createdCount++;
                        continue;
                    } else {
                        const errDetail = planRes.data ? JSON.stringify(planRes.data) : (planRes.raw || `HTTP ${planRes.statusCode}`);
                        console.warn(`    [PROD-WRITE] [!] POST Upsert failed for plan ${planSlug} (HTTP ${planRes.statusCode}): ${errDetail}`);
                    }
                } catch (err) {
                    console.error(`    [PROD-WRITE] [!] Error in POST upsert for plan ${planSlug}: ${err.message}`);
                }
            }

            const matchSource = String(
                existingMatch?.association?.source || 
                existingMatch?.activityPlan_Association?.source || 
                existingMatch?.properties?.source || 
                ''
            ).toLowerCase();

            if (existingMatch && existingMatch.id && matchSource === 'globaltix') {
                // Directly PATCH existing GlobalTix plan by integer plan ID
                const patchUrl = `${baseUrl}/api/v1/variant/details/${encodeURIComponent(slug)}/variantDetails/${existingMatch.id}`;
                const patchPayload = {
                    unique_id: `globaltix-${optionId}`,
                    name: planName,
                    slug: planSlug,
                    availability: config.importer.defaultAvailability ?? true,
                    description: cleanText(opt.description || gtData.description || gtData.summary || opt.name || '') || planName,
                    info: compileInfo() || "",
                    week_opening_info: weekOpeningInfo,
                    listing_price: cleanListingPrice
                };
                try {
                    const patchRes = await makePatchRequest(patchUrl, headers, patchPayload);
                    if (patchRes.statusCode === 200 && patchRes.data && patchRes.data.status !== false) {
                        console.log(`    [PROD-WRITE] [+] GlobalTix Plan PATCH Updated (ID ${existingMatch.id}): ${planSlug}`);
                        createdCount++;
                        continue;
                    }
                } catch (pErr) {
                    console.warn(`    [PROD-WRITE] [!] PATCH failed for Plan ID ${existingMatch.id}`);
                }
            }
        }
    }

    if (!isProdWriteAllowed && compiledPlans.length > 0) {
        saveDbExportProduct(slug, gtId, compiledPlans);
        console.log(`    [EXPORT-ONLY] Compiled ${compiledPlans.length} plan(s) for Product ID ${gtId} -> categorized under '${slug}' in db_ready_plans_export.json`);
        createdCount = compiledPlans.length;
    }

    if (createdCount > 0) {
        const modeLabel = isProdWriteAllowed ? 'PROD-WRITE' : 'EXPORT-ONLY';
        console.log(`[+] SUCCESS (${modeLabel}): Compiled/Imported ${createdCount} plans for Product ID ${gtId} -> ${slug}`);
        if (useQueueMode) markCompleted(gtId);
        else progress.completed_ids.push(gtId);
        return { success: true };
    } else {
        const errMsg = 'Failed to compile or create plans/variants';
        if (useQueueMode) markFailed(gtId, errMsg);
        else progress.failed_ids[gtId] = errMsg;
        return { success: false, error: errMsg };
    }
}

async function runQueueLoop(headers) {
    console.log(`[*] Starting Queue List Worker Loop...`);
    let queueObj = loadQueue();
    if (!queueObj.total_enqueued || Object.keys(queueObj.items).length === 0) {
        console.log(`[*] Queue is empty. Building queue list...`);
        queueObj = buildQueue();
    }

    let processedTotal = 0;
    while (true) {
        if (limit > 0 && processedTotal >= limit) {
            console.log(`[+] Reached requested item limit of ${limit}. Stopping queue run.`);
            break;
        }

        const fetchCount = (limit > 0 && (limit - processedTotal) < concurrency * 2) 
            ? (limit - processedTotal) 
            : concurrency * 2;

        const pendingBatch = getPendingItems(fetchCount);
        if (pendingBatch.length === 0) {
            console.log(`[+] No more pending tasks in queue list.`);
            break;
        }

        const qStats = getStats();
        const totalItems = qStats.total || (qStats.pending + qStats.completed + qStats.failed);
        console.log(`\n-------------------------------------------------------`);
        console.log(`[QUEUE-STATUS] Total: ${totalItems} | Completed: ${qStats.completed} | Pending: ${qStats.pending} | Failed: ${qStats.failed}`);
        console.log(`[*] Claiming next batch of ${pendingBatch.length} task(s)...`);
        console.log(`-------------------------------------------------------`);
        markProcessing(pendingBatch.map(t => t.globaltix_product_id));

        for (let i = 0; i < pendingBatch.length; i += concurrency) {
            const chunk = pendingBatch.slice(i, i + concurrency);
            await Promise.all(chunk.map(item => processProduct(item, null, headers)));
            processedTotal += chunk.length;
            if (limit > 0 && processedTotal >= limit) break;
        }
    }
    return processedTotal;
}

async function main() {
    const modeStr = String(config.importer.mode || 'upsert').toUpperCase();
    const availStr = config.importer.defaultAvailability ? 'true (Active on Site)' : 'false (Hidden on Site)';
    const dupStr = config.importer.deleteDuplicates ? 'true (ENABLED - Will delete duplicates)' : 'false (DISABLED - Deletions turned off)';
    const prodWriteStr = isProdWriteAllowed ? 'true (ALLOWED - Live Database Write)' : 'false (BLOCKED - Read Only / Dry Run)';

    console.log(`\n=======================================================`);
    console.log(` 🚨 GLOBALTIX PLAN MANAGER — CONFIGURATION ALERT 🚨`);
    console.log(`=======================================================`);
    console.log(` 🌐 Target Server URL   : ${baseUrl}`);
    console.log(` 🔓 PROD Write Allowed  : ${prodWriteStr}`);
    console.log(` ⚙️ Operational Mode    : ${modeStr}`);
    console.log(` 👁️ Default Availability: ${availStr}`);
    console.log(` 🗑️ Delete Duplicates   : ${dupStr}`);
    console.log(` 🛡️ Delete Only Source  : globaltix (Strict Safety Active)`);
    console.log(` ⚡ Parallel Concurrency : ${concurrency}`);
    console.log(` 📂 Queue Mode          : ${useQueueMode}`);
    console.log(` 🧪 Dry Run Mode        : ${isDryRun}`);
    console.log(`=======================================================`);
    console.log(`⚠️ ATTENTION: Please review all configuration settings above!`);

    if (!skipConfirm && process.stdin.isTTY) {
        const confirmed = await askConfirmation(`\n👉 Do you want to proceed with these settings? (yes/no): `);
        if (!confirmed) {
            console.log(`\n[!] Action cancelled by user. Exiting terminal.\n`);
            process.exit(0);
        }
        console.log(`\n[+] Confirmation received. Starting GlobalTix Plan Manager...\n`);
    } else if (skipConfirm) {
        console.log(`[+] Auto-confirm flag detected (--yes). Proceeding with execution...\n`);
    }

    const headers = {};
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
        headers['x-api-key'] = apiKey;
    }

    if (useQueueMode) {
        await runQueueLoop(headers);
        const qStats = getStats();
        console.log(`\n=======================================================`);
        console.log(` Queue List Import Run Finished`);
        console.log(` Pending Tasks   : ${qStats.pending}`);
        console.log(` Completed Tasks : ${qStats.completed}`);
        console.log(` Failed Tasks    : ${qStats.failed}`);
        console.log(` Queue File      : ${config.paths.queueFile}`);
        console.log(`=======================================================`);
        return;
    }

    const progress = loadProgress();
    let targetFiles = [];

    if (chunkNum) {
        const padChunk = String(chunkNum).padStart(3, '0');
        const targetChunkFile = path.join(CHUNKS_DIR, `chunk_${padChunk}.json`);
        if (!fs.existsSync(targetChunkFile)) {
            console.error(`[!] Error: Chunk file not found: ${targetChunkFile}`);
            process.exit(1);
        }
        targetFiles.push(targetChunkFile);
    } else if (fs.existsSync(CHUNKS_DIR)) {
        const files = fs.readdirSync(CHUNKS_DIR).filter(f => f.startsWith('chunk_') && f.endsWith('.json'));
        files.sort();
        targetFiles = files.map(f => path.join(CHUNKS_DIR, f));
    } else if (fs.existsSync(config.paths.sourceMatchedFile)) {
        targetFiles.push(config.paths.sourceMatchedFile);
    } else {
        console.error(`[!] Error: No data chunks or source dataset found. Source file missing at ${config.paths.sourceMatchedFile}`);
        process.exit(1);
    }

    console.log(`[*] Target files to process: ${targetFiles.length}`);
    let totalProcessed = 0;

    for (const filePath of targetFiles) {
        console.log(`\n[*] Processing dataset file: ${path.basename(filePath)} ...`);
        const content = fs.readFileSync(filePath, 'utf-8');
        const items = JSON.parse(content);

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < items.length; i += concurrency) {
            const batch = items.slice(i, i + concurrency);
            const results = await Promise.all(batch.map(item => processProduct(item, progress, headers)));
            for (const res of results) {
                if (res.success) successCount++;
                else failCount++;
            }
            if (!isDryRun) {
                saveProgress(progress);
            }
        }

        totalProcessed += items.length;
        console.log(`[+] Finished ${path.basename(filePath)} | Success/Skip: ${successCount} | Failed: ${failCount}`);
    }

    console.log(`\n=======================================================`);
    console.log(` Import Run Finished`);
    console.log(` Total Items Evaluated: ${totalProcessed}`);
    console.log(` Completed Items Total: ${progress.completed_ids.length}`);
    console.log(` Failed Items Total: ${Object.keys(progress.failed_ids).length}`);
    console.log(` Progress file: ${PROGRESS_FILE}`);
    console.log(`=======================================================`);
}

main();

