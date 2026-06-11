import { ReadDiagnostic } from "../jobReader";

export function ReadDiagnostics({ diagnostics }: { diagnostics: ReadDiagnostic[] }) {
  if (!diagnostics.length) {
    return null;
  }

  return (
    <section className="diagnostics-box">
      <strong>Read diagnostics</strong>
      <ul>
        {diagnostics.map((item, index) => (
          <li key={`${item.stage}-${index}`} className={item.ok ? "diagnostic-ok" : "diagnostic-fail"}>
            <span>{item.stage}</span>
            <p>{item.message}</p>
            {item.detail ? <small>{item.detail}</small> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
