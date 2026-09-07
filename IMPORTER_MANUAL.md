# 📘 GlobalTix Plan Manager — Complete Architecture & Operations Guide

Production-grade, memory-efficient **GlobalTix Plan Manager** for **Traviia / Staybook**.

---

## 1. Directory & File Architecture

```text
traviia-globaltix-plan mapper/
│
├── ⚙️ config/                                    # Configuration Layer
│   ├── config.json                             # Central configuration JSON (Server, Importer, Delays, & Paths)
│   └── config.js                               # ES Module configuration loader & path resolver
│
├── 📜 src/                                       # Core Execution Engine
│   ├── import_plans.js                         # Core GlobalTix Plan Manager engine (Live Fetch, Upsert, PATCH, DELETE)
│   ├── queue_manager.js                        # Multi-worker queue state & CLI task manager
│   ├── prepare_server_data.js                  # Dataset partitioning script (Minified, Lite & Chunks)
│   └── index.js                                # Main Node.js library module & search helpers
│
├── 💾 data/                                      # Persistent Datasets & State Files
│   ├── queue.json                              # Active queue task state (2,355 products tracked)
│   ├── stats.json                              # Data build metrics & counts
│   ├── test.json                               # Payload validation & inspection export
│   ├── duplicate_products_export.json          # Catalog export of duplicate GlobalTix mappings
│   ├── globaltix_matched_ready_products.min.json # Full minified dataset (~15.9 MB)
│   ├── globaltix_matched_ready_products_lite.json# Ultra-fast Lite dataset (~1.5 MB)
│   └── chunks/                                 # Memory-safe 500-item JSON chunk directory
│
├── 🚀 Root CLI Entry Wrappers (Backwards Compatible)
│   ├── import_plans.js                         # Delegator entry point -> src/import_plans.js
│   ├── queue_manager.js                        # Delegator entry point -> src/queue_manager.js
│   └── index.js                                # Delegator entry point -> src/index.js
│
├── package.json                                # NPM dependencies and script shortcuts
├── README.md                                   # Quickstart guide
└── IMPORTER_MANUAL.md                          # Full operational manual
```

---

## 2. Complete Configuration Reference (`config/config.json`)

All operational behaviors, API endpoints, modes, flags, and concurrency limits are controlled via **[config/config.json](file:///d:/traviia-globaltix-plan%20mapper/config/config.json)**.

### Master Configuration Schema

```json
{
  "paths": {
    "sourceMatchedFile": "../globatix_product/globaltix_matched_ready_products.json",
    "outputMinified": "./data/globaltix_matched_ready_products.min.json",
    "outputLite": "./data/globaltix_matched_ready_products_lite.json",
    "outputStats": "./data/stats.json",
    "chunksDir": "./data/chunks",
    "progressFile": "./data/import_progress.json",
    "queueFile": "./data/queue.json",
    "dbExportFile": "./data/db_ready_plans_export.json",
    "duplicateExportFile": "./data/duplicate_products_export.json"
  },
  "dataset": {
    "chunkSize": 500
  },
  "queue": {
    "autoEnqueue": true,
    "maxRetries": 3
  },
  "server": {
    "baseUrl": "https://traviia-backend-167648433424.europe-north1.run.app",
    "apiKey": "",
    "prod_write_allow": true,
    "getLiveOptionsEndpointPattern": "/api/v1/globaltix/product/options/{id}",
    "variantPlanEndpointPattern": "/api/v1/variant/details/{slug}/variantDetails"
  },
  "importer": {
    "concurrency": 2,
    "useQueue": true,
    "importMode": "update",
    "mode": "update",
    "defaultAvailability": false,
    "deleteDuplicates": false,
    "deleteOnlyGlobaltix": true,
    "dryRun": false,
    "batchDelayMs": 1500,
    "requestDelayMs": 300,
    "timeoutMs": 60000,
    "retryAttempts": 3,
    "retryDelayMs": 2000
  }
}
```

---

### Configuration Fields Detailed Breakdown

| Section | Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| **`server`** | `baseUrl` | `string` | URL | Target backend REST API endpoint. |
| | `prod_write_allow` | `boolean` | `true` | Master safety switch. Must be `true` to perform live `POST`, `PATCH`, or `DELETE` operations. When `false`, plans are written to `db_ready_plans_export.json`. |
| **`importer`**| `mode` | `string` | `"update"` | **`"update"`**: Directly `PATCH`es existing GlobalTix plans only (skips `POST`).<br>**`"upsert"`**: Updates existing plans & creates missing plans for new live options.<br>**`"add"`**: Creates new plan records (`POST`). |
| | `concurrency` | `number` | `2` | Parallel worker threads processing products simultaneously. Keep at 1–3 for production stability. |
| | `batchDelayMs` | `number` | `1500` | Delay in milliseconds between product processing batches. |
| | `requestDelayMs` | `number` | `300` | Delay in milliseconds between consecutive HTTP requests. |
| | `retryDelayMs` | `number` | `2000` | Delay in milliseconds before retrying a failed HTTP request. |
| | `defaultAvailability`| `boolean` | `false` | Sets default plan `availability` state (`true` = active on website, `false` = hidden). |
| | `deleteDuplicates` | `boolean` | `false` | **`true`**: Auto-deletes duplicate GlobalTix plan IDs for the same option.<br>**`false`**: Completely disables `DELETE` HTTP calls. |
| | `deleteOnlyGlobaltix`| `boolean` | `true` | Enforces 100% strict isolation: `DELETE` operations ONLY touch plans where `source === 'globaltix'`. |
| | `useQueue` | `boolean` | `true` | Enables stateful processing via `queue.json`. |
| | `dryRun` | `boolean` | `false` | Runs simulations without sending write requests to backend API. |

---

## 3. Workflows & Management Capabilities

### Workflow 1: Safe Existing Plan Updating (`mode: "update"`)
1. Fetches live options from GlobalTix API (`/api/v1/globaltix/product/options/{id}`).
2. Requests existing plans via `GET /api/v1/variant/details/{slug}/variantDetails`.
3. Filters for plans where `source === 'globaltix'` matching the option ID.
4. If found, sends `PATCH /api/v1/variant/details/{slug}/variantDetails/{planId}` with full `properties` and `ticketTiers`.
5. Skips any options without existing GlobalTix plans (no `POST` requests sent).

### Workflow 2: Live Option Fetching & Plan Upserting (`mode: "upsert"`)
1. Fetches live options from GlobalTix API (`/api/v1/globaltix/product/options/{id}`).
2. Requests existing plans via `GET /api/v1/variant/details/{slug}/variantDetails`.
3. Issues `POST` requests to upsert plan details, update prices, set availability, and sync unique IDs (`globaltix-[optionId]`).
4. Falls back to `PATCH` if existing plan ID is already present.

### Workflow 3: Automatic Duplicate Plan Deletion (`deleteDuplicates: true`)
1. Identifies if multiple plan IDs exist in PostgreSQL for the same GlobalTix option ID.
2. Keeps the primary plan ID (`allMatches[0]`).
3. Verifies `extraDup.association.source === 'globaltix'`.
4. Sends `DELETE` request for secondary duplicate plan IDs.

---

## 4. 5-Layer Security Isolation (Non-GlobalTix Provider Protection)

To guarantee that non-GlobalTix provider plans (**KKday, Headout, Klook, Viator**) are **never touched or modified**:

1. **Layer 1 (GET Retrieval Filter)**:
   Filters `GET /variantDetails` responses to isolate plans where `source === 'globaltix'`. Non-GlobalTix plans are immediately excluded.
2. **Layer 2 (Client-Side Candidate Isolation)**:
   Candidate matching for an option ID is performed strictly against `existingGlobaltixPlans`.
3. **Layer 3 (Pre-PATCH Verification Guard)**:
   Pre-verifies `matchSource === 'globaltix'` and checks `existingMatch.id` before calling `PATCH`.
4. **Layer 4 (Pre-DELETE Verification Guard & Safe Defaults)**:
   Verifies `extraSource === 'globaltix'` before calling `DELETE`, and `deleteDuplicates` is set to `false` by default.
5. **Layer 5 (Mode Isolation)**:
   In `mode: "update"`, `POST` is bypassed entirely, eliminating any possibility of overwriting or inserting unintended records.

---

## 5. Complete CLI Command Reference

### Import & Sync Commands

```powershell
# Run full batch update across all queue products (with prompt)
node import_plans.js --mode update --use-queue

# Run full batch update automatically (skip confirmation)
node import_plans.js --mode update --use-queue --yes

# Run import with custom product limit (e.g., 5 products)
node import_plans.js --mode update --use-queue --limit 5 --yes

# Run dry-run simulation (no database changes)
node import_plans.js --dry-run
```

### Queue Management Commands

```powershell
# Check active queue status (Pending, Processing, Completed, Failed)
node queue_manager.js status

# Enqueue a new product
node queue_manager.js enqueue 12345 "singapore-flyer-tickets" "Singapore Flyer Tickets"

# Retry failed items
node queue_manager.js retry

# Reset processing tasks back to pending
node queue_manager.js reset

# Clean / delete queue state files
node queue_manager.js clean
```

### Dataset Preparation Commands

```powershell
# Rebuild minified, lite, and chunked server datasets
npm run build-data
```
