import type { Deliverable, ResearchReportDto } from "@sharepay/core/dto";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function DefinitionTable({ caption, rows }: { caption: string; rows: Array<{ label: string; value: string }> }) {
  return (
    <table>
      <caption>{caption}</caption>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function cell(value: string | null): string {
  return value == null ? "…" : value;
}

function ReportView({ report }: { report: ResearchReportDto }) {
  return (
    <article className="card deliverable">
      <h2>{`${report.symbol} research report — ${report.companyName}`}</h2>
      <ul>
        {report.summary.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="table-wrap">
        <DefinitionTable caption="Company" rows={report.company} />
      </div>
      <div className="table-wrap">
        <DefinitionTable caption="Market" rows={report.market} />
      </div>
      <p>{report.status.label}</p>
      <div className="table-wrap">
        <table>
          <caption>Issuers</caption>
          <thead>
            <tr>
              <th>Platform</th>
              <th>Token</th>
              <th>Token price</th>
              <th>Shares per token</th>
              <th>Implied per-share price</th>
              <th>Status</th>
              <th>Attestations</th>
            </tr>
          </thead>
          <tbody>
            {report.issuers.map((issuer) => (
              <tr key={issuer.tokenAddress}>
                <td>{issuer.platform}</td>
                <td>{issuer.tokenSymbol}</td>
                <td>{cell(issuer.tokenPriceUsd)}</td>
                <td>{cell(issuer.sharesPerToken)}</td>
                <td>{cell(issuer.impliedSharePriceUsd)}</td>
                <td>{issuer.status}</td>
                <td>
                  {issuer.attestations.map((attestation) => (
                    <a key={attestation.url} href={attestation.url} target="_blank" rel="noopener noreferrer">
                      {attestation.name}
                    </a>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {report.crossIssuerSpreadBps != null && <p>{`Cross-issuer spread: ${report.crossIssuerSpreadBps} bps`}</p>}
      <p>{report.disclaimer}</p>
      <h3>Sources</h3>
      <ul>
        {report.sources.map((source) => (
          <li key={source}>
            {/^https?:\/\//.test(source) ? (
              <a href={source} target="_blank" rel="noopener noreferrer">
                {source}
              </a>
            ) : (
              source
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}

export function DeliverableView({ deliverable }: { deliverable: Deliverable }) {
  if (deliverable.kind === "report") return <ReportView report={deliverable.report} />;

  if (deliverable.kind === "markdown") {
    return (
      <article className="card deliverable">
        <h2>{deliverable.title}</h2>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}
        >
          {deliverable.markdown}
        </ReactMarkdown>
      </article>
    );
  }

  return (
    <article className="card deliverable">
      <h2>{deliverable.title}</h2>
      <details>
        <summary>Show the full dossier</summary>
        <pre>{JSON.stringify(deliverable.data, null, 2)}</pre>
      </details>
    </article>
  );
}
