import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const SECRETS = ["BINANCE_API_KEY", "BINANCE_API_SECRET", "WALLET_KEYSTORE_JSON", "WALLET_PASSWORD", "MERCHANT_PUBLIC_URL", "BUYER_PRIVATE_KEY", "LIVE_PASSCODE", "MERCHANT_URL"];

interface Service {
  name: string;
  fields: Record<string, string>;
  env: Array<{ key: string; value: string | null; sync: string | null }>;
}

function parseBlueprint(text: string): Service[] {
  const services: Service[] = [];
  let current: Service | null = null;
  let envEntry: Service["env"][number] | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim().startsWith("#") || raw.trim() === "") continue;
    const service = raw.match(/^ {2}- type: (\S+)$/);
    if (service) {
      current = { name: "", fields: { type: service[1] ?? "" }, env: [] };
      services.push(current);
      envEntry = null;
      continue;
    }
    const field = raw.match(/^ {4}(\w+): ?(.*)$/);
    if (current && field) {
      current.fields[field[1] ?? ""] = (field[2] ?? "").trim();
      if (field[1] === "name") current.name = (field[2] ?? "").trim();
      continue;
    }
    const key = raw.match(/^ {6}- key: (\S+)$/);
    if (current && key) {
      envEntry = { key: key[1] ?? "", value: null, sync: null };
      current.env.push(envEntry);
      continue;
    }
    const attr = raw.match(/^ {8}(value|sync): (.*)$/);
    if (envEntry && attr) envEntry[attr[1] === "value" ? "value" : "sync"] = (attr[2] ?? "").replace(/^"(.*)"$/, "$1");
  }
  return services;
}

describe("render.yaml", () => {
  const services = parseBlueprint(readFileSync(join(root, "render.yaml"), "utf8"));
  const byName = new Map(services.map((s) => [s.name, s]));

  it("defines the two free Singapore web services", () => {
    expect(services.map((s) => s.name)).toEqual(["sharepay-merchant", "sharepay-checkout"]);
    for (const service of services) {
      expect(service.fields).toMatchObject({ type: "web", runtime: "node", plan: "free", region: "singapore" });
    }
    expect(byName.get("sharepay-merchant")?.fields).toMatchObject({ buildCommand: "npm ci", startCommand: "npm run start:merchant", healthCheckPath: "/ping" });
    expect(byName.get("sharepay-checkout")?.fields).toMatchObject({ buildCommand: "npm ci && npm run build:web", startCommand: "npm run start:checkout", healthCheckPath: "/api/health" });
  });

  it("asks for every secret in the dashboard and commits no value for it", () => {
    for (const service of services) {
      for (const entry of service.env) {
        if (SECRETS.includes(entry.key)) expect(entry, `${service.name} ${entry.key}`).toEqual({ key: entry.key, value: null, sync: "false" });
        else expect(entry.value, `${service.name} ${entry.key}`).not.toBeNull();
        expect(entry.value ?? "").not.toMatch(/0x[0-9a-fA-F]{64}/);
      }
    }
    const keys = (name: string) => byName.get(name)?.env.map((e) => e.key) ?? [];
    expect(keys("sharepay-merchant")).toEqual(expect.arrayContaining(["BINANCE_API_KEY", "BINANCE_API_SECRET", "WALLET_KEYSTORE_JSON", "WALLET_PASSWORD", "MERCHANT_PUBLIC_URL", "SWEEP_ENABLED"]));
    expect(keys("sharepay-checkout")).toEqual(expect.arrayContaining(["BINANCE_API_KEY", "BINANCE_API_SECRET", "BUYER_PRIVATE_KEY", "LIVE_PASSCODE", "MERCHANT_URL", "WALLET_MODE", "WEB_DIST"]));
    expect(byName.get("sharepay-checkout")?.env.find((e) => e.key === "WALLET_MODE")?.value).toBe("api-signer");
  });

  it("pins Node through .node-version and builds the production web app", () => {
    expect(readFileSync(join(root, ".node-version"), "utf8").trim()).toBe("22.21.0");
    const dist = join(root, "packages", "web", "dist");
    rmSync(dist, { recursive: true, force: true });
    const output = execSync("npm run build:web", { cwd: root, encoding: "utf8", stdio: "pipe" });
    expect(output).toContain("built in");
    expect(existsSync(join(dist, "index.html"))).toBe(true);
  }, 180_000);
});
