/** Deterministic A2A work hook for the Studio runtime: this agent never calls an LLM. */
export function sharePayRunWork(
  publicUrl: string,
): (prompt: string, opts: { sessionId: string; abortSignal?: AbortSignal }) => Promise<string> {
  const base = publicUrl.replace(/\/+$/, "");
  return async () =>
    `SharePay merchant agent. This agent does not run an LLM. Buy the deterministic research report at GET ${base}/x402/report?symbol=NVDA (x402 v2, scheme exact, 0.05 U or USD1 via EIP-3009 on eip155:56, settled on-chain by this agent; revenue is reinvested into SPYB).`;
}
