import { DesignInputs } from "../cvDesigner";

export function DesignInputsStrip({ inputs }: { inputs: DesignInputs }) {
  const items: { label: string; ok: boolean }[] = [
    { label: "Your CV layout", ok: inputs.hadCvLayout },
    { label: "Employer screenshot", ok: inputs.hadEmployerScreenshot },
    { label: "Employer logo", ok: inputs.hadLogo },
  ];
  return (
    <div className="design-inputs-strip" aria-label="Inputs sent to the designer">
      <span className="design-inputs-strip-label">Inputs sent to designer</span>
      <ul>
        {items.map((item) => (
          <li key={item.label} className={item.ok ? "ok" : "missing"}>
            <span className="dot" aria-hidden="true" />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
