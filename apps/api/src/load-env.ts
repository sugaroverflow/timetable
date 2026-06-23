import { fileURLToPath } from "node:url";

import { config } from "dotenv";

// Load the monorepo-root .env regardless of the process working directory.
// In production (e.g. DigitalOcean App Platform) env vars are injected directly
// and this no-ops when the file is absent.
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
