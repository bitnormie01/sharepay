import type { HealthResponse } from "@sharepay/core/dto";
import { useEffect } from "react";
import type { Api } from "../api";

export function BootScreen({
  api,
  onReady,
  pollMs = 2000,
}: {
  api: Pick<Api, "health">;
  onReady: (health: HealthResponse) => void;
  pollMs?: number;
}) {
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const health = await api.health();
        if (stopped) return;
        if (health.ok) {
          onReady(health);
          return;
        }
      } catch {
        if (stopped) return;
      }
      if (stopped) return;
      timer = setTimeout(() => {
        void tick();
      }, pollMs);
    };

    void tick();

    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [api, onReady, pollMs]);

  return (
    <section className="boot">
      <p>Starting SharePay…</p>
      <p>The free host wakes up in about a minute.</p>
    </section>
  );
}
