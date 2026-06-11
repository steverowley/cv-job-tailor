import { Palette } from "lucide-react";
import { Panel } from "../components/Panel";
import { BrandSettings } from "../types";

export function BrandPanel(props: {
  employerWebsiteUrl: string;
  setEmployerWebsiteUrl(value: string): void;
  employerBrandSource: string;
  setEmployerBrandSource(value: string): void;
  brand: BrandSettings;
  setBrand(value: BrandSettings): void;
  brandGenerated: boolean;
  brandMessage: string;
  showBrandFallback: boolean;
  setShowBrandFallback(value: boolean): void;
  generateBrand(): void;
  isReading: boolean;
}) {
  const { brand, setBrand } = props;
  return (
    <Panel icon={<Palette />} title="Employer brand" step="04">
      <label>
        Employer website
        <input
          value={props.employerWebsiteUrl}
          onChange={(event) => props.setEmployerWebsiteUrl(event.target.value)}
          type="url"
          placeholder="https://employer.com"
        />
      </label>
      <button
        className="brand-action"
        disabled={
          (!props.employerWebsiteUrl.trim() && !props.employerBrandSource.trim()) ||
          props.isReading
        }
        onClick={props.generateBrand}
      >
        <Palette aria-hidden="true" />
        {props.brandGenerated ? "Re-generate brand" : "Generate brand"}
      </button>
      <p className="hint">{props.brandMessage}</p>
      {props.brandGenerated ? (
        <>
          <div className="brand-preview">
            <div className="brand-swatch-pair">
              <span style={{ background: brand.primaryColor }} title={`Primary ${brand.primaryColor}`} />
              <span style={{ background: brand.accentColor }} title={`Accent ${brand.accentColor}`} />
            </div>
            <div>
              <strong>{brand.companyName}</strong>
              <span>
                {[
                  brand.logoUrl ? "Logo found" : "No logo detected",
                  brand.fontFamily || "Default font",
                ]
                  .filter(Boolean)
                  .join(" / ")}
              </span>
            </div>
          </div>
          {brand.palette?.length ? (
            <div className="palette-strip" aria-label="Extracted brand palette">
              {brand.palette.slice(0, 5).map((color) => (
                <span key={color} style={{ background: color }} title={color} />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
      {props.showBrandFallback ? (
        <section className="fallback-section">
          <div className="fallback-head">
            <h3>Manual brand override</h3>
            <button
              className="text-action"
              type="button"
              onClick={() => {
                props.setShowBrandFallback(false);
                props.setEmployerBrandSource("");
              }}
            >
              Hide
            </button>
          </div>
          <label>
            Paste website text, HTML, or brand notes
            <textarea
              value={props.employerBrandSource}
              onChange={(event) => props.setEmployerBrandSource(event.target.value)}
              placeholder="Paste the employer homepage text, page source, logo URL, or colours such as #123456."
            />
          </label>
          <div className="brand-row">
            <label>
              Employer name
              <input
                value={brand.companyName}
                onChange={(event) => setBrand({ ...brand, companyName: event.target.value })}
              />
            </label>
            <label>
              Logo URL
              <input
                value={brand.logoUrl || ""}
                onChange={(event) => setBrand({ ...brand, logoUrl: event.target.value })}
                placeholder="Optional"
              />
            </label>
          </div>
          <div className="swatches">
            <label>
              Primary
              <input
                type="color"
                value={brand.primaryColor}
                onChange={(event) => setBrand({ ...brand, primaryColor: event.target.value })}
              />
            </label>
            <label>
              Accent
              <input
                type="color"
                value={brand.accentColor}
                onChange={(event) => setBrand({ ...brand, accentColor: event.target.value })}
              />
            </label>
          </div>
        </section>
      ) : (
        <button
          className="text-action panel-foot-action"
          type="button"
          onClick={() => props.setShowBrandFallback(true)}
        >
          Edit details manually
        </button>
      )}
    </Panel>
  );
}
