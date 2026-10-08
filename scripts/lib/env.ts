import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function repoRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      try {
        const pkg = JSON.parse(readFileSync(candidate, "utf8")) as { name?: string };
        if (pkg.name === "sharepay") return dir;
      } catch {
        // unreadable package.json: keep walking up
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

export function loadDotEnv(root: string): boolean {
  const path = join(root, ".env");
  if (!existsSync(path)) return false;
  process.loadEnvFile(path);
  return true;
}

export interface ParsedArgs {
  command: string | null;
  positionals: string[];
  flags: Record<string, string | true>;
}

export function parseArgs(argv: string[], booleanFlags: ReadonlySet<string> = new Set()): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
    } else if (booleanFlags.has(body) || i + 1 >= argv.length || (argv[i + 1] ?? "").startsWith("--")) {
      flags[body] = true;
    } else {
      flags[body] = argv[i + 1] ?? "";
      i += 1;
    }
  }
  return { command: positionals[0] ?? null, positionals: positionals.slice(1), flags };
}

export function envValue(text: string, key: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (match && match[1] === key) return (match[2] ?? "").trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return null;
}

export function upsertEnvLine(text: string, key: string, value: string): string {
  const lines = text.split("\n");
  const index = lines.findIndex((line) => new RegExp(`^\\s*${key}\\s*=`).test(line));
  if (index >= 0) {
    lines[index] = `${key}=${value}`;
  } else if (lines.length > 1 && lines[lines.length - 1] === "") {
    lines.splice(lines.length - 1, 0, `${key}=${value}`);
  } else if (lines.length === 1 && lines[0] === "") {
    lines[0] = `${key}=${value}`;
  } else {
    lines.push(`${key}=${value}`);
  }
  return lines.join("\n");
}
