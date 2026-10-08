import type { CheckoutState, StepStatus } from "@sharepay/core/dto";
import { useState } from "react";
import { fmtTime } from "../format";

const GLYPH: Record<StepStatus, string> = {
  pending: "○",
  running: "●",
  done: "✓",
  skipped: "–",
  failed: "✕",
};

function etaLine(etaSec: number | null): string {
  if (etaSec == null) return "Report generating";
  return `Report generating — about ${Math.ceil(etaSec / 60)} min left`;
}

function pollLine(jobStartedAt: string | null, lastPolledAt: string | null): string | null {
  if (jobStartedAt && lastPolledAt) {
    return `Started ${fmtTime(jobStartedAt)} · last checked ${fmtTime(lastPolledAt)}`;
  }
  if (jobStartedAt) return `Started ${fmtTime(jobStartedAt)}`;
  if (lastPolledAt) return `last checked ${fmtTime(lastPolledAt)}`;
  return null;
}

export function Progress({ state }: { state: CheckoutState }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const poll = state.status === "awaiting_delivery" ? pollLine(state.jobStartedAt, state.lastPolledAt) : null;

  return (
    <section className="progress">
      <ol className="steps">
        {state.steps.map((step) => {
          const open = expanded[step.id] === true;
          return (
            <li key={step.id} className={`step step-${step.status}`}>
              <span className={`step-icon step-${step.status}`} role="img" aria-label={step.status}>
                {GLYPH[step.status]}
              </span>
              <p className="step-title">{step.title}</p>
              <p className="step-summary">{step.summary}</p>
              <button
                type="button"
                className="step-toggle"
                aria-expanded={open}
                onClick={() => setExpanded((current) => ({ ...current, [step.id]: !current[step.id] }))}
              >
                {open ? "Hide details" : "Details"}
              </button>
              {open && (
                <div className="step-detail">
                  <p>{step.technicalTitle}</p>
                  <dl>
                    {Object.entries(step.detail).map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {step.links.map((link) => (
                    <a key={`${link.href}-${link.label}`} href={link.href} target="_blank" rel="noopener noreferrer">
                      {link.label}
                    </a>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {state.status === "awaiting_delivery" && <p>{etaLine(state.etaSec)}</p>}
      {poll && <p>{poll}</p>}
      {state.status === "failed" && state.error && (
        <div role="alert" className="alert">
          <p>{state.error.message}</p>
          <code>{state.error.code}</code>
        </div>
      )}
    </section>
  );
}
