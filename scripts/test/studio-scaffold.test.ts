import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const agentDir = join(process.cwd(), "sharepaymerchant", "app", "agent");

describe("BNB Agent Studio scaffold", () => {
  it("targets BSC mainnet with an evm-local wallet, no LLM and a disabled B402 seller rail", () => {
    const toml = readFileSync(join(agentDir, "studio.toml"), "utf8");
    expect(toml).toContain('default = "bsc-mainnet"');
    expect(toml).toContain('kind = "evm-local"');
    expect(toml).toContain('provider = "none"');
    expect(toml).toMatch(/\[payments\.b402_seller\]\s*\n(?:#.*\n)*enabled = false/);
    expect(toml).toContain('price_usd = "0"');
  });

  it("generated the unified Express entrypoint with the anchors the integration task patches", () => {
    // Task 8 patches two of these anchors, so each must hold in its generated or its patched form.
    const main = readFileSync(join(agentDir, "src", "unifiedMain.ts"), "utf8");
    expect(main).toContain('import express from "express";');
    expect(main).toMatch(/^ {2}const runWork = (?:buildRunWork\(\)|sharePayRunWork\([^\n]+\));/m);
    expect(main).toContain("  const app = express();\n  app.use(requestLimitContext);");
    const card = readFileSync(join(agentDir, "src", "agentCard.ts"), "utf8");
    expect(card).toMatch(/opts\.commerceSkills === false \? \[(?:SHAREPAY_REPORT)?\] : \[(?:SHAREPAY_REPORT, )?NEGOTIATE, NOTIFY_FUNDED\],/);
  });

  it("keeps Studio secrets out of git and drops the generated READMEs", () => {
    expect(() => execSync("git check-ignore -q sharepaymerchant/.studio/.env.local", { stdio: "pipe" })).not.toThrow();
    // The ops plan later writes the package's own R8 README where the generated one was.
    const packageReadme = join(process.cwd(), "sharepaymerchant", "README.md");
    const replaced = existsSync(packageReadme) && readFileSync(packageReadme, "utf8").trimStart().startsWith("<!-- readme-schema: R8-minimal v1 -->");
    expect(!existsSync(packageReadme) || replaced).toBe(true);
    expect(existsSync(join(agentDir, "README.md"))).toBe(false);
  });
});
