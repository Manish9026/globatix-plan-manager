# GlobalTix Plan Manager & Node.js Server Tools

Production-ready, memory-efficient **Node.js** utilities for managing, updating, upserting, deduplicating, and batch-importing GlobalTix product plans for **Traviia / Staybook**.

---

## 📁 Modular Directory Structure

```text
globaltix_plan/
│
├── ⚙️ config/                                    # Configuration Layer
│   ├── config.json                             # Master configuration file (Modes, Flags, API Settings)
│   └── config.js                               # Configuration manager & path resolver
│
├── 📜 src/                                       # Core Execution Engine
│   ├── import_plans.js                         # GlobalTix Plan Manager (Live Fetch, Upsert, PATCH, DELETE)
│   ├── queue_manager.js                        # Queue Manager (Enqueue, Retry, Reset, Status)
│   ├── prepare_server_data.js                  # Dataset Builder (Minified, Lite, & Chunks)
│   └── index.js                                # Core Library Exports & Search APIs
│
├── 💾 data/                                      # Datasets & State Files
│   ├── queue.json                              # Active Queue State File (2,355 products)
│   ├── stats.json                              # Dataset build metrics
│   ├── test.json                               # Payload validation & inspection export
│   ├── duplicate_products_export.json          # Duplicate products catalog export
│   ├── globaltix_matched_ready_products.min.json # Minified JSON dataset (~15.9 MB)
│   ├── globaltix_matched_ready_products_lite.json# Lite JSON dataset (~1.5 MB)
│   └── chunks/                                 # 500-item JSON chunk files
│
├── 🚀 Root CLI Wrappers
│   ├── import_plans.js                         # Root entry wrapper for importer
│   ├── queue_manager.js                        # Root entry wrapper for queue manager
│   └── index.js                                # Root library wrapper
│
├── package.json                                # Project dependencies & npm scripts
├── README.md                                   # Quickstart guide
└── IMPORTER_MANUAL.md                          # Full operational manual
```

---

## ⚙️ Configuration Reference (`config/config.json`)

All operational behaviors are controlled via **[config/config.json](file:///f:/manish-work/traviia/globaltix_plan/config/config.json)**:

```json
{
  "server": {
    "baseUrl": "https://traviia-backend-167648433424.europe-north1.run.app",
    "prod_write_allow": true
  },
  "importer": {
    "concurrency": 3,
    "useQueue": true,
    "mode": "upsert",
    "defaultAvailability": true,
    "deleteDuplicates": true,
    "deleteOnlyGlobaltix": true,
    "dryRun": false,
    "timeoutMs": 60000
  }
}
```

### Config Flags Summary

| Parameter | Options | Description |
| :--- | :--- | :--- |
| `mode` | `"upsert"` \| `"update"` \| `"add"` | **`"upsert"`**: Updates existing plans & creates missing plans for new live options.<br>**`"update"`**: Directly `PATCH`es existing GlobalTix plans only (skips `POST`).<br>**`"add"`**: Creates new plan records (`POST`). |
| `defaultAvailability` | `true` \| `false` | Default `availability` boolean sent in payloads (`true` = active on site, `false` = hidden). |
| `deleteDuplicates` | `true` \| `false` | **`true`**: Auto-deletes duplicate GlobalTix plan IDs for the same option.<br>**`false`**: Disables `DELETE` HTTP calls. |
| `deleteOnlyGlobaltix` | `true` | Enforces 100% strict isolation: `DELETE` operations ONLY touch plans where `source === 'globaltix'`. |

---

## 🚀 Quick CLI Commands

### 1. Run GlobalTix Plan Manager
```powershell
node import_plans.js --use-queue
```

### 2. Enqueue a New Product
```powershell
node queue_manager.js enqueue 12345 "singapore-flyer-tickets" "Singapore Flyer Tickets"
```

### 3. Check Queue Status
```powershell
node queue_manager.js status
```

### 4. Retry Failed Items
```powershell
node queue_manager.js retry
```

### 5. Clean Queue Files
node queue_manager.js clean
```

---

## 🔒 Safety & Isolation

- **4 Independent Safety Layers** enforce strict `source === 'globaltix'` checks.
- Non-GlobalTix provider plans (**KKday, Headout, Klook, Viator**) are **100% protected and untouched**.
