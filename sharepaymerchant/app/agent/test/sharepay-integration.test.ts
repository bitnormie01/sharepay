import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sharePayRunWork } from "@sharepay/merchant/runWork";
import { describe, expect, it } from "vitest";
import { buildAgentCard } from "../src/agentCard.js";

const agentDir = join(process.cwd(), "sharepaymerchant", "app", "agent");

describe("SharePay inside the Studio runtime", () => {
  it("replaces the LLM work hook and mounts the merchant routes on the Studio app", () => {
    const main = readFileSync(join(agentDir, "src", "unifiedMain.ts"), "utf8");
    expect(main).toContain('import { createMerchantRuntime } from "@sharepay/merchant/runtime";');
    expect(main).toContain('import { mountSharePayMerchant } from "@sharepay/merchant/routes";');
    expect(main).toContain('import { sharePayRunWork } from "@sharepay/merchant/runWork";');
    expect(main).toContain('import { studioTxSigner } from "@sharepay/merchant/studioSigner";');
    expect(main).not.toContain("  const runWork = buildRunWork();");
    expect(main).toContain('  const runWork = sharePayRunWork(process.env.MERCHANT_PUBLIC_URL ?? "http://localhost:9000");');
    const mount = main.indexOf("mountSharePayMerchant(app, sharepay);");
    expect(mount).toBeGreaterThan(main.indexOf("app.use(requestLimitContext);"));
    expect(mount).toBeLessThan(main.indexOf('app.use(express.json({ limit: "8mb" }));'));
  });

  it("advertises the paid report skill on the A2A card", () => {
    const card = buildAgentCard({ commerceSkills: false });
    expect(card.skills.map((s) => s.id)).toEqual(["sharepay_report"]);
    expect(card.description).toContain("SharePay merchant agent");
    expect(buildAgentCard().skills.map((s) => s.id)).toEqual(["sharepay_report", "negotiate", "notify_funded"]);
  });

  it("keeps the work hook deterministic", async () => {
    const text = await sharePayRunWork("https://merchant.example")("hi", { sessionId: "s" });
    expect(text).toContain("does not run an LLM");
  });

  it("is an npm workspace with start scripts that depend on @sharepay/merchant", () => {
    const pkg = JSON.parse(readFileSync(join(agentDir, "package.json"), "utf8")) as { scripts: Record<string, string>; dependencies: Record<string, string> };
    expect(pkg.dependencies["@sharepay/merchant"]).toBe("*");
    expect(pkg.scripts.start).toBe("tsx src/unifiedMain.ts");
    expect(pkg.scripts["start:local"]).toBe("tsx --env-file-if-exists=../../.studio/.env.local --env-file-if-exists=../../../.env src/unifiedMain.ts");
    const root = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { workspaces: string[] };
    expect(root.workspaces).toEqual(["packages/*", "sharepaymerchant/app/agent"]);
  });
});
