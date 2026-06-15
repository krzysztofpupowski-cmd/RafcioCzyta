import { resolve } from "node:path";

import { loadEnvFile } from "./helpers/load-env-file";

loadEnvFile(resolve(import.meta.dirname, "../.env.test"));
