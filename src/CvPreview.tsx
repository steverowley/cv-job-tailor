import { CSSProperties } from "react";
import {
  AnalysisResult,
  Bullet,
  CaseStyle,
  DesignSpec,
  FontKind,
  FullCv,
  FullCvExperience,
  FullCvSection,
  SectionLabelStyle,
  Tracking,
} from "./types";

interface PreviewProps {
  analysis: AnalysisResult | null;
  designSpec: DesignSpec;
  logoUrl?: string;
  companyDisplayName: string;
}

export function CvPreview({ analysis, designSpec, logoUrl, companyDisplayName }: PreviewProps) {
  if (!analysis?.tailoredCv.fullCv) {
    return (
      <section
        className="preview-shell"
        style={previewShellStyle(designSpec)}
      >
        <div className="cv-page preview-empty" style={previewPageStyle(designSpec)}>
          <p className="preview-placeholder">Your branded CV output will be rendered here after analysis.</p>
        </div>
      </section>
    );
  }

  const cv = analysis.tailoredCv.fullCv;
  const employerName = analysis.employerName || companyDisplayName;
  const shared = { cv, spec: designSpec, employerName, logoUrl };

  let archetype: React.ReactNode;
  switch (designSpec.archetype) {
    case "editorial":
      archetype = <EditorialPreview {...shared} />;
      break;
    case "feature-band":
      archetype = <FeatureBandPreview {...shared} />;
      break;
    case "monolith":
      archetype = <MonolithPreview {...shared} />;
      break;
    case "sidebar-classic":
    default:
      archetype = <SidebarClassicPreview {...shared} />;
      break;
  }

  return (
    <section className="preview-shell" style={previewShellStyle(designSpec)}>
      <div className="cv-page" style={previewPageStyle(designSpec)}>
        {archetype}
      </div>
    </section>
  );
}

interface ArchetypeProps {
  cv: FullCv;
  spec: DesignSpec;
  employerName: string;
  logoUrl?: string;
}

function EditorialPreview({ cv, spec, employerName, logoUrl }: ArchetypeProps) {
  return (
    <div style={{ padding: "56px 72px" }}>
      {spec.hero.accentBar !== "none" ? <AccentBar spec={spec} /> : null}
      <div
        style={{
          fontFamily: headingCssFont(spec),
          fontSize: 11,
          letterSpacing: "0.18em",
          color: spec.color.accent,
          textTransform: "uppercase",
          marginBottom: 14,
        }}
      >
        {applyCase(employerName, spec.typography.headingCase, "upper")}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            style={{
              fontFamily: headingCssFont(spec),
              fontSize: displayNameSize(spec),
              color: spec.color.text,
              letterSpacing: cssTracking(spec.typography.headingTracking),
              fontWeight: cssWeight(spec.typography.headingWeight),
              lineHeight: 1.05,
              margin: 0,
            }}
          >
            {applyCase(cv.name || "—", spec.typography.headingCase)}
          </h2>
          <p
            style={{
              fontFamily: bodyCssFont(spec),
              color: spec.color.primary,
              fontSize: 15,
              margin: "8px 0 0",
              lineHeight: 1.45,
            }}
          >
            {cv.headline}
          </p>
        </div>
        {logoUrl && spec.hero.showLogo ? <Logo url={logoUrl} /> : null}
      </div>
      {cv.contactLines.length ? (
        <p style={previewContactStyle(spec)}>{cv.contactLines.join("   ·   ")}</p>
      ) : null}
      <div style={previewRuleStyle(spec)} />
      <ProfileBlock cv={cv} spec={spec} />
      <ExperienceBlock cv={cv} spec={spec} />
      <SkillsParagraph cv={cv} spec={spec} />
      <EducationCertsBlock cv={cv} spec={spec} />
      <AdditionalBlocks cv={cv} spec={spec} startIndex={5} />
    </div>
  );
}

function SidebarClassicPreview({ cv, spec, employerName, logoUrl }: ArchetypeProps) {
  const sidebarRight = spec.sidebar === "right";
  const sidebarHidden = spec.sidebar === "none";
  return (
    <div style={{ position: "relative" }}>
      {spec.hero.accentBar !== "none" ? <AccentBar spec={spec} /> : null}
      <div style={{ padding: "44px 52px 28px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            fontFamily: headingCssFont(spec),
            color: spec.color.primary,
          }}
        >
          <span>{applyCase(employerName, spec.typography.headingCase, "upper")}</span>
          <span style={{ color: spec.color.muted }}>Tailored CV</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 22, gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              style={{
                fontFamily: headingCssFont(spec),
                fontSize: 32,
                color: spec.color.text,
                fontWeight: cssWeight(spec.typography.headingWeight),
                letterSpacing: cssTracking(spec.typography.headingTracking),
                lineHeight: 1.1,
                margin: 0,
              }}
            >
              {cv.name || "—"}
            </h2>
            <p
              style={{
                margin: "8px 0 0",
                color: spec.color.primary,
                fontFamily: bodyCssFont(spec),
                fontSize: 14,
              }}
            >
              {cv.headline}
            </p>
          </div>
          {logoUrl && spec.hero.showLogo ? <Logo url={logoUrl} /> : null}
        </div>
        {cv.contactLines.length ? (
          <p style={{ ...previewContactStyle(spec), marginTop: 22 }}>{cv.contactLines.join(" / ")}</p>
        ) : null}
        <div style={previewRuleStyle(spec)} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: sidebarHidden
            ? "minmax(0, 1fr)"
            : sidebarRight
            ? "minmax(0, 1fr) 200px"
            : "200px minmax(0, 1fr)",
          gap: 36,
          padding: "12px 52px 48px",
        }}
      >
        {!sidebarHidden && !sidebarRight ? <SidebarColumn cv={cv} spec={spec} side="left" /> : null}
        <div>
          <ProfileBlock cv={cv} spec={spec} />
          <ExperienceBlock cv={cv} spec={spec} />
          <AdditionalBlocks cv={cv} spec={spec} startIndex={3} />
        </div>
        {!sidebarHidden && sidebarRight ? <SidebarColumn cv={cv} spec={spec} side="right" /> : null}
      </div>
    </div>
  );
}

function FeatureBandPreview({ cv, spec, employerName, logoUrl }: ArchetypeProps) {
  const onPrimary = readableOn(spec.color.primary);
  return (
    <div>
      <div
        style={{
          backgroundColor: spec.color.primary,
          color: onPrimary,
          padding: "56px 56px 40px",
        }}
      >
        <div
          style={{
            fontFamily: headingCssFont(spec),
            fontSize: 11,
            letterSpacing: "0.2em",
            color: hexWithAlpha(onPrimary, 0.78),
            marginBottom: 14,
          }}
        >
          {applyCase(employerName, spec.typography.headingCase, "upper")}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              style={{
                fontFamily: headingCssFont(spec),
                fontSize: displayNameSize(spec),
                color: onPrimary,
                letterSpacing: cssTracking(spec.typography.headingTracking),
                fontWeight: cssWeight(spec.typography.headingWeight),
                lineHeight: 1.05,
                margin: 0,
              }}
            >
              {applyCase(cv.name || "—", spec.typography.headingCase)}
            </h2>
            <p
              style={{
                fontFamily: bodyCssFont(spec),
                color: hexWithAlpha(onPrimary, 0.88),
                fontSize: 15,
                margin: "10px 0 0",
                maxWidth: "85%",
                lineHeight: 1.5,
              }}
            >
              {cv.headline}
            </p>
          </div>
          {logoUrl && spec.hero.showLogo ? <Logo url={logoUrl} onDark /> : null}
        </div>
        {cv.contactLines.length ? (
          <p
            style={{
              marginTop: 22,
              paddingTop: 16,
              borderTop: `1px solid ${hexWithAlpha(onPrimary, 0.25)}`,
              fontSize: 11.5,
              color: hexWithAlpha(onPrimary, 0.7),
              letterSpacing: "0.02em",
            }}
          >
            {cv.contactLines.join(" / ")}
          </p>
        ) : null}
      </div>
      <div style={{ padding: "32px 56px 56px" }}>
        <ProfileBlock cv={cv} spec={spec} />
        <ExperienceBlock cv={cv} spec={spec} />
        <SkillsParagraph cv={cv} spec={spec} />
        <EducationCertsBlock cv={cv} spec={spec} />
        <AdditionalBlocks cv={cv} spec={spec} startIndex={5} />
      </div>
    </div>
  );
}

function MonolithPreview({ cv, spec, employerName }: ArchetypeProps) {
  return (
    <div style={{ padding: "80px 96px 72px" }}>
      <div
        style={{
          fontFamily: headingCssFont(spec),
          fontSize: 11,
          letterSpacing: "0.24em",
          color: spec.color.muted,
          textTransform: "uppercase",
          marginBottom: 18,
        }}
      >
        {applyCase(employerName, spec.typography.headingCase, "upper")}
      </div>
      <h2
        style={{
          fontFamily: headingCssFont(spec),
          fontSize: displayNameSize(spec) * 0.95,
          color: spec.color.text,
          fontWeight: cssWeight(spec.typography.headingWeight),
          letterSpacing: cssTracking(spec.typography.headingTracking),
          lineHeight: 1.1,
          margin: 0,
        }}
      >
        {applyCase(cv.name || "—", spec.typography.headingCase)}
      </h2>
      <p
        style={{
          margin: "14px 0 28px",
          fontFamily: bodyCssFont(spec),
          fontSize: 15,
          color: spec.color.muted,
          lineHeight: 1.5,
        }}
      >
        {cv.headline}
      </p>
      {cv.contactLines.length ? (
        <p style={{ ...previewContactStyle(spec), marginBottom: 40 }}>{cv.contactLines.join("   ·   ")}</p>
      ) : null}
      <ProfileBlock cv={cv} spec={spec} />
      <ExperienceBlock cv={cv} spec={spec} />
      <SkillsParagraph cv={cv} spec={spec} />
      <EducationCertsBlock cv={cv} spec={spec} />
      <AdditionalBlocks cv={cv} spec={spec} startIndex={5} />
    </div>
  );
}

function ProfileBlock({ cv, spec }: { cv: FullCv; spec: DesignSpec }) {
  if (!cv.profile) return null;
  return (
    <section style={sectionWrapperStyle(spec)}>
      <SectionLabel title="Profile" index={1} spec={spec} />
      <p style={paragraphStyle(spec)}>{cv.profile}</p>
    </section>
  );
}

function ExperienceBlock({ cv, spec }: { cv: FullCv; spec: DesignSpec }) {
  if (!cv.experience.length) return null;
  return (
    <section style={sectionWrapperStyle(spec)}>
      <SectionLabel title="Experience" index={2} spec={spec} />
      <div style={{ display: "grid", gap: spec.typography.density === "compact" ? 16 : 22 }}>
        {cv.experience.map((role, index) => (
          <ExperienceRow key={index} role={role} spec={spec} />
        ))}
      </div>
    </section>
  );
}

function ExperienceRow({ role, spec }: { role: FullCvExperience; spec: DesignSpec }) {
  return (
    <article>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
        <strong
          style={{
            fontFamily: headingCssFont(spec),
            fontSize: 14,
            fontWeight: cssWeight(spec.typography.headingWeight),
            color: spec.color.text,
          }}
        >
          {role.role}
        </strong>
        <span style={{ color: spec.color.muted, fontSize: 12 }}>{role.dates}</span>
      </div>
      <p style={{ margin: "2px 0 8px", color: spec.color.primary, fontSize: 12.5 }}>
        {[role.organisation, role.location].filter(Boolean).join(" / ")}
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {role.bullets.map((bullet, bulletIndex) => (
          <li
            key={bulletIndex}
            style={{ display: "flex", gap: 8, marginBottom: 4, fontSize: 13, lineHeight: 1.55 }}
          >
            <span style={{ color: spec.color.primary, minWidth: 14, fontFamily: bodyCssFont(spec) }}>
              {bulletGlyph(spec.geometry.bullet, bulletIndex)}
            </span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function SkillsParagraph({ cv, spec }: { cv: FullCv; spec: DesignSpec }) {
  if (!cv.skills.length) return null;
  return (
    <section style={sectionWrapperStyle(spec)}>
      <SectionLabel title="Skills" index={3} spec={spec} />
      <p style={paragraphStyle(spec)}>{cv.skills.join(" · ")}</p>
    </section>
  );
}

function EducationCertsBlock({ cv, spec }: { cv: FullCv; spec: DesignSpec }) {
  if (!cv.education.length && !cv.certifications.length) return null;
  return (
    <section style={sectionWrapperStyle(spec)}>
      {cv.education.length ? (
        <>
          <SectionLabel title="Education" index={4} spec={spec} />
          {cv.education.map((item, index) => (
            <p key={index} style={paragraphStyle(spec)}>
              {item}
            </p>
          ))}
        </>
      ) : null}
      {cv.certifications.length ? (
        <>
          <h4
            style={{
              fontFamily: headingCssFont(spec),
              fontSize: 12,
              color: spec.color.text,
              margin: "12px 0 4px",
            }}
          >
            Certifications
          </h4>
          {cv.certifications.map((item, index) => (
            <p key={index} style={paragraphStyle(spec)}>
              {item}
            </p>
          ))}
        </>
      ) : null}
    </section>
  );
}

function AdditionalBlocks({
  cv,
  spec,
  startIndex,
}: {
  cv: FullCv;
  spec: DesignSpec;
  startIndex: number;
}) {
  return (
    <>
      {cv.additionalSections.map((section, index) => (
        <AdditionalSectionView
          key={index}
          section={section}
          spec={spec}
          index={startIndex + index}
        />
      ))}
    </>
  );
}

function AdditionalSectionView({
  section,
  spec,
  index,
}: {
  section: FullCvSection;
  spec: DesignSpec;
  index: number;
}) {
  return (
    <section style={sectionWrapperStyle(spec)}>
      <SectionLabel title={section.title} index={index} spec={spec} />
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {section.items.map((item, itemIndex) => (
          <li
            key={itemIndex}
            style={{ display: "flex", gap: 8, marginBottom: 4, fontSize: 13, lineHeight: 1.55 }}
          >
            <span style={{ color: spec.color.primary, minWidth: 14, fontFamily: bodyCssFont(spec) }}>
              {bulletGlyph(spec.geometry.bullet, itemIndex)}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SidebarColumn({ cv, spec, side }: { cv: FullCv; spec: DesignSpec; side: "left" | "right" }) {
  const borderProperty = side === "left" ? "borderRight" : "borderLeft";
  const padding = side === "left" ? { paddingRight: 24 } : { paddingLeft: 24 };
  return (
    <aside
      style={{
        [borderProperty]: `1px solid ${withAlpha(spec.color.primary, 0.14)}`,
        ...padding,
      }}
    >
      {cv.skills.length ? <SidebarSection title="Skills" items={cv.skills} spec={spec} pill /> : null}
      {cv.education.length ? <SidebarSection title="Education" items={cv.education} spec={spec} /> : null}
      {cv.certifications.length ? (
        <SidebarSection title="Certifications" items={cv.certifications} spec={spec} />
      ) : null}
    </aside>
  );
}

function SidebarSection({
  title,
  items,
  spec,
  pill,
}: {
  title: string;
  items: string[];
  spec: DesignSpec;
  pill?: boolean;
}) {
  return (
    <section style={{ marginBottom: 24 }}>
      <SectionLabel title={title} index={0} spec={spec} />
      {pill ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {items.map((item, index) => (
            <span
              key={index}
              style={{
                display: "inline-block",
                padding: "4px 8px",
                background: withAlpha(spec.color.primary, 0.08),
                border: `1px solid ${withAlpha(spec.color.primary, 0.18)}`,
                borderRadius: cssCorner(spec, 4),
                fontSize: 11,
                color: spec.color.text,
              }}
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {items.map((item, index) => (
            <li key={index} style={{ fontSize: 12, marginBottom: 4, color: spec.color.text }}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SectionLabel({
  title,
  index,
  spec,
}: {
  title: string;
  index: number;
  spec: DesignSpec;
}) {
  const text = labelText(title, spec.sectionLabel, index);
  const baseStyle: CSSProperties = {
    fontFamily: headingCssFont(spec),
    fontSize: 11.5,
    color: spec.color.primary,
    fontWeight: cssWeight(spec.typography.headingWeight),
    marginBottom: 10,
    display: "block",
  };
  switch (spec.sectionLabel) {
    case "uppercase-tracked":
      Object.assign(baseStyle, { letterSpacing: "0.18em" });
      break;
    case "title-case":
      Object.assign(baseStyle, { fontSize: 14, letterSpacing: 0 });
      break;
    case "underlined":
      Object.assign(baseStyle, {
        letterSpacing: "0.04em",
        borderBottom: `1px solid ${spec.color.primary}`,
        paddingBottom: 4,
      });
      break;
    case "numbered":
      Object.assign(baseStyle, { letterSpacing: "0.12em" });
      break;
    case "block-tag":
      Object.assign(baseStyle, {
        background: spec.color.primary,
        color: readableOn(spec.color.primary),
        alignSelf: "flex-start",
        display: "inline-block",
        padding: "3px 8px",
        borderRadius: cssCorner(spec, 3),
        letterSpacing: "0.12em",
      });
      break;
  }
  return <span style={baseStyle}>{text}</span>;
}

function Logo({ url, onDark }: { url: string; onDark?: boolean }) {
  return (
    <img
      src={url}
      alt="Employer logo"
      style={{
        maxHeight: 52,
        maxWidth: 130,
        objectFit: "contain",
        padding: 6,
        background: onDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.03)",
        borderRadius: 4,
      }}
    />
  );
}

function AccentBar({ spec }: { spec: DesignSpec }) {
  if (spec.hero.accentBar === "top-thick") {
    return (
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 6,
          background: spec.color.primary,
        }}
      />
    );
  }
  if (spec.hero.accentBar === "side-thick") {
    return (
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: 8,
          background: spec.color.primary,
        }}
      />
    );
  }
  if (spec.hero.accentBar === "underline") {
    return (
      <div
        style={{
          width: 64,
          height: 2,
          background: spec.color.accent,
          marginTop: 4,
          marginBottom: 18,
        }}
      />
    );
  }
  return null;
}

function previewShellStyle(_: DesignSpec): CSSProperties {
  return { padding: 24 };
}

function previewPageStyle(spec: DesignSpec): CSSProperties {
  return {
    background: spec.color.pageBackground,
    color: spec.color.text,
    fontFamily: bodyCssFont(spec),
    position: "relative",
    overflow: "hidden",
    borderRadius: 8,
  };
}

function previewContactStyle(spec: DesignSpec): CSSProperties {
  return {
    fontSize: 11.5,
    color: spec.color.muted,
    letterSpacing: "0.02em",
    margin: 0,
  };
}

function previewRuleStyle(spec: DesignSpec): CSSProperties {
  if (spec.geometry.divider === "double-rule") {
    return {
      borderTop: `3px double ${spec.color.primary}`,
      marginTop: 18,
    };
  }
  if (spec.geometry.divider === "none") {
    return { marginTop: 8 };
  }
  if (spec.geometry.divider === "block") {
    return {
      borderTop: "none",
      marginTop: 14,
      padding: 12,
      background: withAlpha(spec.color.primary, 0.06),
      borderRadius: cssCorner(spec, 4),
    };
  }
  return {
    borderTop: `1px solid ${withAlpha(spec.color.primary, 0.18)}`,
    marginTop: 18,
  };
}

function sectionWrapperStyle(spec: DesignSpec): CSSProperties {
  return {
    marginBottom: spec.typography.density === "compact" ? 18 : spec.typography.density === "expansive" ? 28 : 22,
  };
}

function paragraphStyle(spec: DesignSpec): CSSProperties {
  return {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
    color: spec.color.text,
    fontFamily: bodyCssFont(spec),
  };
}

function displayNameSize(spec: DesignSpec): number {
  const base = 38;
  switch (spec.typography.headlineSize) {
    case "modest":
      return Math.round(base * 0.8);
    case "display":
      return Math.round(base * 1.25);
    case "large":
    default:
      return base;
  }
}

function headingCssFont(spec: DesignSpec): string {
  const name = spec.typography.headingFont || "";
  return cssFontStack(spec.typography.headingKind, name);
}

function bodyCssFont(spec: DesignSpec): string {
  const name = spec.typography.bodyFont || "";
  return cssFontStack(spec.typography.bodyKind, name);
}

function cssFontStack(kind: FontKind, named: string): string {
  const safeNamed = named && !/^(var\(|inherit|initial)/i.test(named) ? `"${named}", ` : "";
  switch (kind) {
    case "serif":
      return `${safeNamed}Georgia, "Times New Roman", serif`;
    case "display-serif":
      return `${safeNamed}"Playfair Display", Georgia, serif`;
    case "mono":
      return `${safeNamed}"JetBrains Mono", "IBM Plex Mono", "Courier New", monospace`;
    case "sans":
    default:
      return `${safeNamed}Inter, "Segoe UI", system-ui, -apple-system, sans-serif`;
  }
}

function cssWeight(weight: DesignSpec["typography"]["headingWeight"]): number {
  switch (weight) {
    case "black":
      return 900;
    case "bold":
      return 700;
    case "semibold":
      return 600;
    case "medium":
      return 500;
    case "regular":
    default:
      return 400;
  }
}

function cssTracking(tracking: Tracking): string {
  switch (tracking) {
    case "tight":
      return "-0.02em";
    case "wide":
      return "0.04em";
    case "ultra":
      return "0.1em";
    case "normal":
    default:
      return "0";
  }
}

function cssCorner(spec: DesignSpec, soft: number): number | string {
  switch (spec.geometry.corner) {
    case "sharp":
      return 0;
    case "round":
      return soft * 2;
    case "pill":
      return 999;
    case "soft":
    default:
      return soft;
  }
}

function labelText(title: string, style: SectionLabelStyle, index: number): string {
  switch (style) {
    case "uppercase-tracked":
    case "block-tag":
    case "underlined":
      return title.toUpperCase();
    case "title-case":
      return toTitleCase(title);
    case "numbered":
      return `${String(index).padStart(2, "0")} — ${title.toUpperCase()}`;
    default:
      return title;
  }
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function applyCase(value: string, headingCase: CaseStyle, override?: CaseStyle): string {
  const effective = override || headingCase;
  if (effective === "upper") return value.toUpperCase();
  if (effective === "title") return toTitleCase(value);
  return value;
}

function bulletGlyph(bullet: Bullet, index: number): string {
  switch (bullet) {
    case "dash":
      return "—";
    case "square":
      return "▪";
    case "arrow":
      return "›";
    case "number":
      return `${index + 1}.`;
    case "dot":
    default:
      return "•";
  }
}

function readableOn(background: string): string {
  return brightness(background) > 150 ? "#1b1b1b" : "#fbfaf6";
}

function brightness(color: string): number {
  const normalized = color.replace("#", "").padEnd(6, "0").slice(0, 6);
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function withAlpha(color: string, alpha: number): string {
  return hexWithAlpha(color, alpha);
}

function hexWithAlpha(color: string, alpha: number): string {
  const normalized = color.replace("#", "").padEnd(6, "0").slice(0, 6);
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
