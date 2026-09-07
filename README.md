# 🚀 GlobalTix Plan Manager & Node.js Sync Engine

Production-ready, memory-efficient **Node.js** engine for managing, synchronizing, enriching, deduplicating, and batch-updating GlobalTix product plans for **Traviia / Staybook**.

---

## 🔒 100% Provider Isolation Guarantee (Safety Architecture)

> [!IMPORTANT]
> **Can our code ever touch other source plans (KKday, Headout, Klook, Viator)?**
> **Answer: NO — 100% IMPOSSIBLE.**
> The engine implements **5 independent, fail-safe security layers** that guarantee non-GlobalTix provider plans are **completely isolated, protected, and untouched**.

### The 5 Isolation Layers:

1. **Layer 1: Filtered Plan Retrieval (`GET` Filter)**
   When fetching existing plans for an activity (`GET /api/v1/variant/details/{slug}/variantDetails`), the system immediately discards any plan that does not belong to GlobalTix:
   ```javascript
   const existingGlobaltixPlans = allExistingPlans.filter(p => {
       const src = p.association?.source || p.activityPlan_Association?.source || p.properties?.source;
       return String(src || '').toLowerCase() === 'globaltix';
   });
   ```
   *Any plan with `source` equal to `kkday`, `headout`, `klook`, `viator`, etc., is never placed in the candidate list.*

2. **Layer 2: Strict Option-Level Candidate Matching**
   Matching a live GlobalTix option to an existing database plan is performed **strictly within `existingGlobaltixPlans`**:
   ```javascript
   const allMatches = existingGlobaltixPlans.filter(p => {
       let optId = p.association?.option_id || p.association?.optionId || p.properties?.option_id;
       if (!optId && p.unique_id && String(p.unique_id).includes('globaltix-')) {
           const parts = String(p.unique_id).split('-');
           optId = parts[parts.length - 1];
       }
       return String(optId) === String(optionId);
   });
   const existingMatch = allMatches[0];
   ```

3. **Layer 3: Pre-PATCH Verification Guard**
   Before sending any `PATCH` request (`PATCH /api/v1/variant/details/{slug}/variantDetails/{planId}`), the source of the target plan is verified again at runtime:
   ```javascript
   const matchSource = String(
       existingMatch?.association?.source || 
       existingMatch?.activityPlan_Association?.source || 
       existingMatch?.properties?.source || 
       ''
   ).toLowerCase();

   if (existingMatch && existingMatch.id && matchSource === 'globaltix') {
       // Only sends PATCH to this specific GlobalTix plan ID
   }
   ```

4. **Layer 4: Pre-DELETE Verification Guard & Safe Defaults**
   Duplicate deletion only executes if `config.importer.deleteDuplicates === true` (default is `false`). Even if enabled, deletion strictly asserts `extraSource === 'globaltix'`:
   ```javascript
   if (extraDup.id && extraSource === 'globaltix') {
       // Only deleted if source is explicitly 'globaltix'
   } else {
       console.log(`[SAFETY-SKIP] Skipped non-GlobalTix plan ID ${extraDup.id}`);
   }
   ```

5. **Layer 5: Mode-Specific Isolation (`--mode update`)**
   In `"update"` mode:
   - `POST` requests are **completely disabled**. No new plans can be created.
   - If an option has no existing GlobalTix plan, it is safely skipped.
   - Only plans that already exist in PostgreSQL with `source: 'globaltix'` and a matching `option_id` are touched.

---

## 📦 Rich `properties` Field & Full `ticketTiers`

GlobalTix plans store **all 40+ raw fields** from the live GlobalTix API response (`GET /api/v1/globaltix/product/options/{id}`) inside the JSONB `properties` column. This includes full ticket tiers with comprehensive pricing, age restrictions, and booking rules.

### Stored Fields in `properties`:

| Category | Fields Included |
| :--- | :--- |
| **Identity & Source** | `source: "globaltix"`, `product_id`, `prod_no`, `option_id`, `type`, `sourceName`, `sourceTitle`, `sourceCurrency`, `currency`, `sortOrder`, `keywords` |
| **Booking & Validity** | `ticketValidity` (`"FixedDate"` or `"Duration"`), `visitDate` (`isOpenDated`, `request`, `required`), `definedDuration`, `timeSlot` (array of slot objects) |
| **Advance Booking** | `advanceBooking` (`required`, `day`, `hour`, `minute`, `dayMinute`) |
| **Cancellation Policy** | `isCancellable` (bool), `cancellationPolicy` (`percentReturn`, `refundDuration`), `cancellationNotes` (array) |
| **Checkout Questions** | `questions` (array of question objects: `id`, `question`, `type`, `questionCode`, `options`) |
| **Fulfillment & Controls** | `ticketFormat`, `isCapacity`, `isDynamicPricing`, `demandType`, `isBypass`, `hideManageBookingLink`, `tourInformation` |
| **Ticket Tiers** | `ticketTiers` (array of full ticket tier objects) |

### Complete `ticketTiers` Object Structure:
Every entry in `properties.ticketTiers` preserves the complete, untruncated pricing and ticket specification:
```json
{
  "id": 16960,
  "sku": "GT-16960-ADULT",
  "name": "Adult (Age 13+)",
  "nameTranslated": "Adult (Age 13+)",
  "type": "adult",
  "currency": "SGD",
  "recommendedSellingPrice": 48.00,
  "nettPrice": 40.80,
  "originalPrice": 48.00,
  "minimumSellingPrice": 43.20,
  "nettMerchantPrice": 40.80,
  "originalMerchantPrice": 48.00,
  "minPurchaseQty": 1,
  "maxPurchaseQty": 10,
  "ageFrom": 13,
  "ageTo": 99,
  "useBin": false
}
```

---

## ⚡ Production Server & Rate-Limit Safeguards

To prevent overwhelming the production Cloud Run backend or getting rate-limited (HTTP 429) by the GlobalTix live API, the engine provides built-in rate limiting:

- **Low Concurrency**: Default set to `concurrency: 2` parallel worker threads.
- **Batch Delay (`batchDelayMs`)**: 1,500ms pause between product chunks.
- **Request Delay (`requestDelayMs`)**: 300ms pause between individual plan updates.
- **HTTP 429 Auto-Backoff**: Automatically catches 429 status codes, pauses for 5,000ms, and safely retries the request.
- **Duplicate Deletion Safeguard**: `deleteDuplicates` set to `false` by default to ensure safe non-destructive operation.

---

## ⚙️ Configuration Reference (`config/config.json`)

```json
{
  "server": {
    "baseUrl": "https://traviia-backend-167648433424.europe-north1.run.app",
    "prod_write_allow": true
  },
  "importer": {
    "concurrency": 2,
    "useQueue": true,
    "mode": "update",
    "defaultAvailability": false,
    "deleteDuplicates": false,
    "deleteOnlyGlobaltix": true,
    "dryRun": false,
    "batchDelayMs": 1500,
    "requestDelayMs": 300,
    "retryAttempts": 3,
    "retryDelayMs": 2000,
    "timeoutMs": 60000
  }
}
```

### Configuration Options:

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `mode` | `string` | `"update"` | `"update"`: PATCHes existing GlobalTix plans only.<br>`"upsert"`: Updates existing & creates new plans via POST.<br>`"add"`: Creates new plans only. |
| `concurrency` | `number` | `2` | Number of products processed concurrently (keep at 1–3 for prod stability). |
| `batchDelayMs` | `number` | `1500` | Milliseconds to sleep between product batches. |
| `requestDelayMs` | `number` | `300` | Milliseconds to sleep between individual HTTP requests. |
| `defaultAvailability` | `boolean` | `false` | Plan availability state (`true` = active on website, `false` = hidden). |
| `deleteDuplicates` | `boolean` | `false` | When `true`, cleans up duplicate GlobalTix plans for the same option ID. |
| `prod_write_allow` | `boolean` | `true` | Master switch. When `false`, exports plans to `data/db_ready_plans_export.json` without modifying live DB. |

---

## 🚀 CLI Commands

### 1. Run Plan Importer / Updater

```powershell
# Update existing GlobalTix plans across the queue (with confirmation prompt)
node import_plans.js --mode update --use-queue

# Run automatically without interactive prompt
node import_plans.js --mode update --use-queue --yes

# Test a small batch (e.g. first 5 products)
node import_plans.js --mode update --use-queue --limit 5 --yes

# Dry run simulation (no HTTP writes)
node import_plans.js --dry-run
```

### 2. Manage the Processing Queue (`src/queue_manager.js`)

```powershell
# View active queue statistics (Pending, In-Progress, Completed, Failed)
node queue_manager.js status

# Retry all failed items
node queue_manager.js retry

# Reset all in-progress or completed items back to pending
node queue_manager.js reset

# Enqueue a specific product manually
node queue_manager.js enqueue 12345 "singapore-flyer-tickets" "Singapore Flyer Tickets"

# Clean and clear queue files
node queue_manager.js clean
```

---

## 📁 Directory Structure

```text
traviia-globaltix-plan mapper/
│
├── ⚙️ config/
│   ├── config.json                             # Master configuration (endpoints, delays, flags)
│   └── config.js                               # ES Module configuration loader
│
├── 📜 src/
│   ├── import_plans.js                         # Core execution engine (Live Fetch, PATCH, POST)
│   ├── queue_manager.js                        # Multi-worker queue state & CLI manager
│   ├── prepare_server_data.js                  # Dataset partitioning (minified, lite, chunks)
│   └── index.js                                # Core module exports
│
├── 💾 data/
│   ├── queue.json                              # Active queue file (tracks 2,355 products)
│   ├── stats.json                              # Dataset build metrics
│   └── chunks/                                 # 500-item chunk files
│
├── 🚀 Root CLI Wrappers
│   ├── import_plans.js                         # CLI entry wrapper -> src/import_plans.js
│   ├── queue_manager.js                        # CLI entry wrapper -> src/queue_manager.js
│   └── index.js                                # Library wrapper
│
├── package.json
├── README.md
└── IMPORTER_MANUAL.md
```

---

## 🧪 Live Verification Results

The script was verified against live production endpoints on Google Cloud Run:
- **Singapore River Sightseeing Cruise** (`singapore-river-sightseeing-cruise`):
  - GlobalTix plan `21053` successfully updated with all 40+ properties.
  - Headout plans `7289`, `7132`, `18810` remained **100% untouched and identical**.
- **Singapore Zoo Tickets** (`singapore-zoo-tickets-mandai-wildlife-reserve-singapore`):
  - GlobalTix plan `21224` updated with complete `ticketTiers` (prices, age brackets, SKUs).
  - KKday plans `899`, `894`, `892`, `897` remained **100% untouched and identical**.
