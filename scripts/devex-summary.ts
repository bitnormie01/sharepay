import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { parseJsonl, summarizeEvents } from "@sharepay/core/devex";
import { renderMeasured, replaceMeasured } from "./lib/devex.js";
import { loadDotEnv, repoRoot } from "./lib/env.js";

const root = repoRoot();
loadDotEnv(root);
const raw = process.env.DEVEX_EVENTS_PATH || "devex/events.jsonl";
const eventsPath = isAbsolute(raw) ? raw : join(root, raw);
const events = existsSync(eventsPath) ? parseJsonl(readFileSync(eventsPath, "utf8")) : [];
const logPath = join(root, "DEVEX_LOG.md");
const section = renderMeasured(summarizeEvents(events), new Date().toISOString(), events.length);
writeFileSync(logPath, replaceMeasured(readFileSync(logPath, "utf8"), section), "utf8");
console.log(`DEVEX_LOG.md measured section rewritten from ${events.length} API calls (${eventsPath}).`);
