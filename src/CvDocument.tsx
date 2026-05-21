import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  AnalysisResult,
  Bullet,
  CaseStyle,
  DesignSpec,
  Divider,
  FontKind,
  FontWeight,
  FullCv,
  FullCvExperience,
  FullCvSection,
  SectionLabelStyle,
  Tracking,
} from "./types";

interface DocumentProps {
  analysis: AnalysisResult;
  designSpec: DesignSpec;
  logoDataUrl?: string;
  companyDisplayName: string;
}

export function TailoredCvDocument({
  analysis,
  designSpec,
  logoDataUrl,
  companyDisplayName,
}: DocumentProps) {
  const cv = analysis.tailoredCv.fullCv;
  const props = {
    cv,
    spec: designSpec,
    logoDataUrl,
    employerName: analysis.employerName || companyDisplayName,
  };

  switch (designSpec.archetype) {
    case "editorial":
      return <EditorialCv {...props} />;
    case "feature-band":
      return <FeatureBandCv {...props} />;
    case "monolith":
      return <MonolithCv {...props} />;
    case "sidebar-classic":
    default:
      return <SidebarClassicCv {...props} />;
  }
}

interface ArchetypeProps {
  cv: FullCv;
  spec: DesignSpec;
  logoDataUrl?: string;
  employerName: string;
}

function EditorialCv({ cv, spec, logoDataUrl, employerName }: ArchetypeProps) {
  const T = typographySizes(spec);
  const body = bodyFont(spec);
  const headFamily = headingFont(spec);
  const styles = StyleSheet.create({
    page: {
      backgroundColor: spec.color.pageBackground,
      color: spec.color.text,
      paddingTop: spec.hero.accentBar === "top-thick" ? 60 : 56,
      paddingBottom: 56,
      paddingHorizontal: 72,
      fontFamily: body,
      fontSize: T.body,
      lineHeight: 1.55,
    },
    topBar: accentBarStyle(spec),
    eyebrow: {
      fontSize: T.eyebrow,
      letterSpacing: 1.8,
      color: spec.color.accent,
      fontFamily: headFamily,
      marginBottom: 12,
      textTransform: "uppercase",
    },
    name: {
      fontSize: T.displayName,
      fontFamily: headFamily,
      color: spec.color.text,
      letterSpacing: letterSpacing(spec.typography.headingTracking, T.displayName),
      lineHeight: 1.05,
      marginBottom: 12,
    },
    headline: {
      fontSize: T.headline,
      color: spec.color.primary,
      fontFamily: body,
      marginBottom: 18,
      lineHeight: 1.4,
    },
    contact: {
      fontSize: T.tiny,
      color: spec.color.muted,
      letterSpacing: 0.4,
      marginBottom: 28,
    },
    rule: dividerStyle(spec, "horizontal"),
    section: { marginBottom: T.sectionGap },
    sectionTitle: sectionLabelStyle(spec, T),
    paragraph: { fontSize: T.body, lineHeight: 1.65 },
    experienceItem: { marginBottom: 16 },
    experienceHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
    role: { fontSize: T.role, fontFamily: headFamily, color: spec.color.text },
    dates: { fontSize: T.meta, color: spec.color.muted },
    organisation: { fontSize: T.meta, color: spec.color.primary, marginBottom: 6 },
    bulletRow: { flexDirection: "row", marginBottom: 4 },
    bulletMark: { width: 14, color: spec.color.primary, fontSize: T.body },
    bulletText: { flexGrow: 1, fontSize: T.body, lineHeight: 1.55 },
    minorTitle: {
      fontSize: T.minor,
      fontFamily: headFamily,
      color: spec.color.text,
      marginTop: 12,
      marginBottom: 4,
    },
  });

  return (
    <Document title={`${cv.name} — Tailored CV`}>
      <Page size="A4" style={styles.page}>
        {spec.hero.accentBar !== "none" ? <View style={styles.topBar} fixed /> : null}
        <View>
          <Text style={styles.eyebrow}>{caseTransform(employerName, spec.typography.headingCase, "upper")}</Text>
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.name}>
                {caseTransform(cv.name || "—", spec.typography.headingCase)}
              </Text>
              <Text style={styles.headline}>{cv.headline}</Text>
            </View>
            {logoDataUrl && spec.hero.showLogo ? (
              <Image src={logoDataUrl} style={{ maxWidth: 90, maxHeight: 44, objectFit: "contain" }} />
            ) : null}
          </View>
          {cv.contactLines.length ? (
            <Text style={styles.contact}>{cv.contactLines.join("   ·   ")}</Text>
          ) : null}
          <View style={styles.rule} />
        </View>

        {cv.profile ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {sectionLabelText("Profile", spec.sectionLabel, 1)}
            </Text>
            <Text style={styles.paragraph}>{cv.profile}</Text>
          </View>
        ) : null}

        {cv.experience.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {sectionLabelText("Experience", spec.sectionLabel, 2)}
            </Text>
            {cv.experience.map((role, index) => (
              <Experience key={index} role={role} spec={spec} T={T} styles={styles} />
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          {cv.skills.length ? (
            <>
              <Text style={styles.sectionTitle}>
                {sectionLabelText("Skills", spec.sectionLabel, 3)}
              </Text>
              <Text style={styles.paragraph}>{cv.skills.join(" · ")}</Text>
            </>
          ) : null}
          {cv.education.length ? (
            <>
              <Text style={styles.minorTitle}>Education</Text>
              {cv.education.map((item, index) => (
                <Text key={index} style={styles.paragraph}>
                  {item}
                </Text>
              ))}
            </>
          ) : null}
          {cv.certifications.length ? (
            <>
              <Text style={styles.minorTitle}>Certifications</Text>
              {cv.certifications.map((item, index) => (
                <Text key={index} style={styles.paragraph}>
                  {item}
                </Text>
              ))}
            </>
          ) : null}
        </View>

        {cv.additionalSections.map((section, sectionIndex) => (
          <AdditionalSection
            key={sectionIndex}
            section={section}
            spec={spec}
            index={4 + sectionIndex}
            styles={styles}
            T={T}
          />
        ))}

        <Footer cv={cv} spec={spec} />
      </Page>
    </Document>
  );
}

function SidebarClassicCv({ cv, spec, logoDataUrl, employerName }: ArchetypeProps) {
  const T = typographySizes(spec);
  const body = bodyFont(spec);
  const headFamily = headingFont(spec);
  const sidebarLeft = spec.sidebar !== "right";
  const sidebarVisible = spec.sidebar !== "none";
  const styles = StyleSheet.create({
    page: {
      backgroundColor: spec.color.pageBackground,
      color: spec.color.text,
      paddingTop: 48,
      paddingBottom: 56,
      paddingHorizontal: 48,
      fontFamily: body,
      fontSize: T.body,
      lineHeight: 1.5,
    },
    topBar: accentBarStyle(spec),
    header: {
      paddingBottom: 18,
      marginBottom: 24,
      ...dividerStyle(spec, "horizontal"),
    },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    headerText: { flexGrow: 1, paddingRight: 12 },
    employer: {
      fontSize: T.eyebrow,
      color: spec.color.accent,
      letterSpacing: letterSpacing(spec.typography.headingTracking, T.eyebrow) + 1,
      fontFamily: headFamily,
      marginBottom: 8,
    },
    name: {
      fontSize: T.displayName * 0.85,
      color: spec.color.text,
      fontFamily: headFamily,
      letterSpacing: letterSpacing(spec.typography.headingTracking, T.displayName * 0.85),
      marginBottom: 4,
    },
    headline: {
      fontSize: T.headline,
      color: spec.color.primary,
      fontFamily: body,
    },
    contact: { marginTop: 12, fontSize: T.meta, color: spec.color.muted },
    body: { flexDirection: sidebarVisible ? "row" : "column", gap: 24 },
    sidebar: {
      width: sidebarVisible ? 150 : 0,
      paddingRight: sidebarVisible && sidebarLeft ? 16 : 0,
      paddingLeft: sidebarVisible && !sidebarLeft ? 16 : 0,
      ...(sidebarVisible
        ? sidebarLeft
          ? { borderRightWidth: 1, borderRightColor: spec.color.primary }
          : { borderLeftWidth: 1, borderLeftColor: spec.color.primary }
        : {}),
    },
    main: { flexGrow: 1 },
    section: { marginBottom: T.sectionGap },
    sectionTitle: sectionLabelStyle(spec, T),
    sidebarTitle: { ...sectionLabelStyle(spec, T), marginBottom: 6 },
    sidebarItem: { fontSize: T.minor, color: spec.color.text, marginBottom: 4 },
    paragraph: { fontSize: T.body, color: spec.color.text },
    experienceHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    role: { fontSize: T.role, color: spec.color.text, fontFamily: headFamily },
    dates: { fontSize: T.meta, color: spec.color.muted },
    organisation: { fontSize: T.meta, color: spec.color.primary, marginBottom: 6 },
    bulletRow: { flexDirection: "row", marginBottom: 3 },
    bulletMark: { width: 10, color: spec.color.primary },
    bulletText: { flexGrow: 1, fontSize: T.body, color: spec.color.text },
  });

  const sidebar = sidebarVisible ? (
    <View style={styles.sidebar}>
      {cv.skills.length ? (
        <SidebarSection title="Skills" items={cv.skills} styles={styles} spec={spec} />
      ) : null}
      {cv.education.length ? (
        <SidebarSection title="Education" items={cv.education} styles={styles} spec={spec} />
      ) : null}
      {cv.certifications.length ? (
        <SidebarSection title="Certifications" items={cv.certifications} styles={styles} spec={spec} />
      ) : null}
    </View>
  ) : null;

  return (
    <Document title={`${cv.name} — Tailored CV`}>
      <Page size="A4" style={styles.page}>
        {spec.hero.accentBar !== "none" ? <View style={styles.topBar} fixed /> : null}

        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.employer}>
                {caseTransform(employerName || "Tailored CV", spec.typography.headingCase, "upper")}
              </Text>
              <Text style={styles.name}>{cv.name || "—"}</Text>
              <Text style={styles.headline}>{cv.headline}</Text>
            </View>
            {logoDataUrl && spec.hero.showLogo ? (
              <Image src={logoDataUrl} style={{ maxWidth: 96, maxHeight: 48, objectFit: "contain" }} />
            ) : null}
          </View>
          {cv.contactLines.length ? (
            <Text style={styles.contact}>{cv.contactLines.join("   /   ")}</Text>
          ) : null}
        </View>

        <View style={styles.body}>
          {sidebarLeft ? sidebar : null}
          <View style={styles.main}>
            {cv.profile ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {sectionLabelText("Profile", spec.sectionLabel, 1)}
                </Text>
                <Text style={styles.paragraph}>{cv.profile}</Text>
              </View>
            ) : null}

            {cv.experience.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {sectionLabelText("Experience", spec.sectionLabel, 2)}
                </Text>
                {cv.experience.map((role, index) => (
                  <Experience key={index} role={role} spec={spec} T={T} styles={styles} />
                ))}
              </View>
            ) : null}

            {cv.additionalSections.map((section, sectionIndex) => (
              <AdditionalSection
                key={sectionIndex}
                section={section}
                spec={spec}
                index={3 + sectionIndex}
                styles={styles}
                T={T}
              />
            ))}
          </View>
          {!sidebarLeft ? sidebar : null}
        </View>

        <Footer cv={cv} spec={spec} />
      </Page>
    </Document>
  );
}

function FeatureBandCv({ cv, spec, logoDataUrl, employerName }: ArchetypeProps) {
  const T = typographySizes(spec);
  const body = bodyFont(spec);
  const headFamily = headingFont(spec);
  const onPrimary = readableOn(spec.color.primary);
  const styles = StyleSheet.create({
    page: {
      backgroundColor: spec.color.pageBackground,
      color: spec.color.text,
      paddingTop: 0,
      paddingBottom: 56,
      paddingHorizontal: 0,
      fontFamily: body,
      fontSize: T.body,
      lineHeight: 1.55,
    },
    hero: {
      backgroundColor: spec.color.primary,
      paddingTop: 56,
      paddingBottom: 40,
      paddingHorizontal: 56,
      color: onPrimary,
    },
    heroRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    employer: {
      fontSize: T.eyebrow,
      color: tintOn(onPrimary, 0.75),
      letterSpacing: 2,
      fontFamily: headFamily,
      marginBottom: 14,
    },
    name: {
      fontSize: T.displayName,
      fontFamily: headFamily,
      color: onPrimary,
      letterSpacing: letterSpacing(spec.typography.headingTracking, T.displayName),
      lineHeight: 1.05,
    },
    headline: {
      fontSize: T.headline,
      color: tintOn(onPrimary, 0.85),
      fontFamily: body,
      marginTop: 10,
      maxWidth: "85%",
    },
    contact: {
      marginTop: 22,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: tintOn(onPrimary, 0.25),
      fontSize: T.meta,
      color: tintOn(onPrimary, 0.7),
    },
    body: { paddingTop: 32, paddingHorizontal: 56 },
    section: { marginBottom: T.sectionGap },
    sectionTitle: sectionLabelStyle(spec, T),
    paragraph: { fontSize: T.body, lineHeight: 1.6 },
    minorTitle: {
      fontSize: T.minor,
      fontFamily: headFamily,
      color: spec.color.text,
      marginTop: 12,
      marginBottom: 4,
    },
  });

  return (
    <Document title={`${cv.name} — Tailored CV`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.hero}>
          <Text style={styles.employer}>
            {caseTransform(employerName || "Tailored CV", spec.typography.headingCase, "upper")}
          </Text>
          <View style={styles.heroRow}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text style={styles.name}>
                {caseTransform(cv.name || "—", spec.typography.headingCase)}
              </Text>
              <Text style={styles.headline}>{cv.headline}</Text>
            </View>
            {logoDataUrl && spec.hero.showLogo ? (
              <Image
                src={logoDataUrl}
                style={{
                  maxWidth: 100,
                  maxHeight: 52,
                  objectFit: "contain",
                  backgroundColor: tintOn(onPrimary, 0.12),
                  padding: 6,
                  borderRadius: cornerRadius(spec, 4),
                }}
              />
            ) : null}
          </View>
          {cv.contactLines.length ? (
            <Text style={styles.contact}>{cv.contactLines.join("   /   ")}</Text>
          ) : null}
        </View>

        <View style={styles.body}>
          {cv.profile ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {sectionLabelText("Profile", spec.sectionLabel, 1)}
              </Text>
              <Text style={styles.paragraph}>{cv.profile}</Text>
            </View>
          ) : null}

          {cv.experience.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {sectionLabelText("Experience", spec.sectionLabel, 2)}
              </Text>
              {cv.experience.map((role, index) => (
                <Experience key={index} role={role} spec={spec} T={T} styles={featureRowStyles(spec, T)} />
              ))}
            </View>
          ) : null}

          {cv.skills.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {sectionLabelText("Skills", spec.sectionLabel, 3)}
              </Text>
              <Text style={styles.paragraph}>{cv.skills.join(" · ")}</Text>
            </View>
          ) : null}

          {cv.education.length || cv.certifications.length ? (
            <View style={styles.section}>
              {cv.education.length ? (
                <>
                  <Text style={styles.sectionTitle}>
                    {sectionLabelText("Education", spec.sectionLabel, 4)}
                  </Text>
                  {cv.education.map((item, index) => (
                    <Text key={index} style={styles.paragraph}>
                      {item}
                    </Text>
                  ))}
                </>
              ) : null}
              {cv.certifications.length ? (
                <>
                  <Text style={styles.minorTitle}>Certifications</Text>
                  {cv.certifications.map((item, index) => (
                    <Text key={index} style={styles.paragraph}>
                      {item}
                    </Text>
                  ))}
                </>
              ) : null}
            </View>
          ) : null}

          {cv.additionalSections.map((section, sectionIndex) => (
            <AdditionalSection
              key={sectionIndex}
              section={section}
              spec={spec}
              index={5 + sectionIndex}
              styles={featureRowStyles(spec, T)}
              T={T}
            />
          ))}
        </View>

        <Footer cv={cv} spec={spec} bottom={24} />
      </Page>
    </Document>
  );
}

function MonolithCv({ cv, spec, logoDataUrl, employerName }: ArchetypeProps) {
  const T = typographySizes(spec);
  const body = bodyFont(spec);
  const headFamily = headingFont(spec);
  const styles = StyleSheet.create({
    page: {
      backgroundColor: spec.color.pageBackground,
      color: spec.color.text,
      paddingTop: 80,
      paddingBottom: 72,
      paddingHorizontal: 96,
      fontFamily: body,
      fontSize: T.body,
      lineHeight: 1.6,
    },
    eyebrow: {
      fontSize: T.eyebrow,
      letterSpacing: 2.4,
      color: spec.color.muted,
      fontFamily: headFamily,
      marginBottom: 18,
    },
    name: {
      fontSize: T.displayName * 0.95,
      fontFamily: headFamily,
      color: spec.color.text,
      letterSpacing: letterSpacing(spec.typography.headingTracking, T.displayName * 0.95),
      lineHeight: 1.1,
      marginBottom: 14,
    },
    headline: {
      fontSize: T.headline,
      color: spec.color.muted,
      fontFamily: body,
      marginBottom: 28,
      lineHeight: 1.5,
    },
    contact: {
      fontSize: T.meta,
      color: spec.color.muted,
      letterSpacing: 0.4,
      marginBottom: 40,
    },
    section: { marginBottom: T.sectionGap * 1.2 },
    sectionTitle: sectionLabelStyle(spec, T),
    paragraph: { fontSize: T.body, lineHeight: 1.7 },
    experienceItem: { marginBottom: 18 },
    experienceHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
    role: { fontSize: T.role, fontFamily: headFamily, color: spec.color.text },
    dates: { fontSize: T.meta, color: spec.color.muted },
    organisation: { fontSize: T.meta, color: spec.color.muted, marginBottom: 6 },
    bulletRow: { flexDirection: "row", marginBottom: 4 },
    bulletMark: { width: 16, color: spec.color.muted, fontSize: T.body },
    bulletText: { flexGrow: 1, fontSize: T.body, lineHeight: 1.6 },
    minorTitle: {
      fontSize: T.minor,
      fontFamily: headFamily,
      color: spec.color.text,
      marginTop: 14,
      marginBottom: 4,
    },
  });

  return (
    <Document title={`${cv.name} — Tailored CV`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.eyebrow}>
          {caseTransform(employerName || "Tailored CV", spec.typography.headingCase, "upper")}
        </Text>
        <Text style={styles.name}>
          {caseTransform(cv.name || "—", spec.typography.headingCase)}
        </Text>
        <Text style={styles.headline}>{cv.headline}</Text>
        {cv.contactLines.length ? (
          <Text style={styles.contact}>{cv.contactLines.join("   ·   ")}</Text>
        ) : null}

        {cv.profile ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {sectionLabelText("Profile", spec.sectionLabel, 1)}
            </Text>
            <Text style={styles.paragraph}>{cv.profile}</Text>
          </View>
        ) : null}

        {cv.experience.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {sectionLabelText("Experience", spec.sectionLabel, 2)}
            </Text>
            {cv.experience.map((role, index) => (
              <Experience key={index} role={role} spec={spec} T={T} styles={styles} />
            ))}
          </View>
        ) : null}

        {cv.skills.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {sectionLabelText("Skills", spec.sectionLabel, 3)}
            </Text>
            <Text style={styles.paragraph}>{cv.skills.join(" · ")}</Text>
          </View>
        ) : null}

        {cv.education.length || cv.certifications.length ? (
          <View style={styles.section}>
            {cv.education.length ? (
              <>
                <Text style={styles.sectionTitle}>
                  {sectionLabelText("Education", spec.sectionLabel, 4)}
                </Text>
                {cv.education.map((item, index) => (
                  <Text key={index} style={styles.paragraph}>
                    {item}
                  </Text>
                ))}
              </>
            ) : null}
            {cv.certifications.length ? (
              <>
                <Text style={styles.minorTitle}>Certifications</Text>
                {cv.certifications.map((item, index) => (
                  <Text key={index} style={styles.paragraph}>
                    {item}
                  </Text>
                ))}
              </>
            ) : null}
          </View>
        ) : null}

        {cv.additionalSections.map((section, sectionIndex) => (
          <AdditionalSection
            key={sectionIndex}
            section={section}
            spec={spec}
            index={5 + sectionIndex}
            styles={styles}
            T={T}
          />
        ))}

        <Footer cv={cv} spec={spec} />
      </Page>
    </Document>
  );
}

function Experience({
  role,
  spec,
  T,
  styles,
}: {
  role: FullCvExperience;
  spec: DesignSpec;
  T: TypographySizes;
  styles: Record<string, any>;
}) {
  return (
    <View style={styles.experienceItem || styles.experience} wrap={false}>
      <View style={styles.experienceHead || styles.experienceHeader}>
        <Text style={styles.role}>{role.role}</Text>
        <Text style={styles.dates}>{role.dates}</Text>
      </View>
      <Text style={styles.organisation}>
        {[role.organisation, role.location].filter(Boolean).join(" / ")}
      </Text>
      {role.bullets.map((bullet, bulletIndex) => (
        <View key={bulletIndex} style={styles.bulletRow}>
          <Text style={styles.bulletMark}>{bulletGlyph(spec.geometry.bullet, bulletIndex)}</Text>
          <Text style={styles.bulletText}>{bullet}</Text>
        </View>
      ))}
    </View>
  );
}

function AdditionalSection({
  section,
  spec,
  index,
  styles,
  T,
}: {
  section: FullCvSection;
  spec: DesignSpec;
  index: number;
  styles: Record<string, any>;
  T: TypographySizes;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {sectionLabelText(section.title, spec.sectionLabel, index)}
      </Text>
      {section.items.map((item, itemIndex) => (
        <View key={itemIndex} style={styles.bulletRow}>
          <Text style={styles.bulletMark}>{bulletGlyph(spec.geometry.bullet, itemIndex)}</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function SidebarSection({
  title,
  items,
  styles,
  spec,
}: {
  title: string;
  items: string[];
  styles: Record<string, any>;
  spec: DesignSpec;
}) {
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sidebarTitle}>
        {sectionLabelText(title, spec.sectionLabel, 0)}
      </Text>
      {items.map((item, index) => (
        <Text key={index} style={styles.sidebarItem}>
          {item}
        </Text>
      ))}
    </View>
  );
}

function Footer({ cv, spec, bottom = 24 }: { cv: FullCv; spec: DesignSpec; bottom?: number }) {
  return (
    <Text
      style={{
        position: "absolute",
        bottom,
        left: 48,
        right: 48,
        fontSize: 8,
        color: spec.color.muted,
        textAlign: "center",
      }}
      render={({ pageNumber, totalPages }) =>
        `${cv.name || "Tailored CV"} — ${pageNumber} / ${totalPages}`
      }
      fixed
    />
  );
}

interface TypographySizes {
  body: number;
  meta: number;
  tiny: number;
  eyebrow: number;
  headline: number;
  displayName: number;
  role: number;
  minor: number;
  sectionTitle: number;
  sectionGap: number;
}

function typographySizes(spec: DesignSpec): TypographySizes {
  const densityScale =
    spec.typography.density === "compact"
      ? 0.94
      : spec.typography.density === "expansive"
      ? 1.08
      : 1;
  const headlineScale =
    spec.typography.headlineSize === "modest"
      ? 0.8
      : spec.typography.headlineSize === "display"
      ? 1.3
      : 1;

  const body = round(10.5 * densityScale);
  return {
    body,
    meta: round(9.5 * densityScale),
    tiny: round(8.5 * densityScale),
    eyebrow: round(8 * densityScale),
    headline: round(11.5 * densityScale),
    displayName: round(26 * headlineScale),
    role: round(11.5 * densityScale),
    minor: round(10 * densityScale),
    sectionTitle: round(9 * densityScale),
    sectionGap:
      spec.typography.density === "compact" ? 14 : spec.typography.density === "expansive" ? 22 : 18,
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function featureRowStyles(spec: DesignSpec, T: TypographySizes) {
  return StyleSheet.create({
    section: { marginBottom: T.sectionGap },
    sectionTitle: sectionLabelStyle(spec, T),
    experienceItem: { marginBottom: 14 },
    experienceHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
    },
    role: { fontSize: T.role, fontFamily: headingFont(spec), color: spec.color.text },
    dates: { fontSize: T.meta, color: spec.color.muted },
    organisation: { fontSize: T.meta, color: spec.color.primary, marginBottom: 6 },
    bulletRow: { flexDirection: "row", marginBottom: 3 },
    bulletMark: { width: 12, color: spec.color.primary },
    bulletText: { flexGrow: 1, fontSize: T.body, color: spec.color.text },
  });
}

function sectionLabelStyle(spec: DesignSpec, T: TypographySizes) {
  const base: Record<string, any> = {
    fontSize: T.sectionTitle,
    color: spec.color.primary,
    fontFamily: headingFont(spec),
    marginBottom: 8,
  };
  switch (spec.sectionLabel) {
    case "uppercase-tracked":
      base.letterSpacing = 1.6;
      break;
    case "title-case":
      base.fontSize = T.sectionTitle + 1.5;
      base.letterSpacing = 0;
      break;
    case "underlined":
      base.letterSpacing = 0.4;
      base.borderBottomWidth = 1;
      base.borderBottomColor = spec.color.primary;
      base.paddingBottom = 4;
      break;
    case "numbered":
      base.letterSpacing = 1.2;
      break;
    case "block-tag":
      base.backgroundColor = spec.color.primary;
      base.color = readableOn(spec.color.primary);
      base.alignSelf = "flex-start";
      base.paddingHorizontal = 8;
      base.paddingVertical = 3;
      base.borderRadius = cornerRadius(spec, 3);
      base.letterSpacing = 1.2;
      break;
  }
  return base;
}

function sectionLabelText(title: string, style: SectionLabelStyle, index: number): string {
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

function accentBarStyle(spec: DesignSpec) {
  if (spec.hero.accentBar === "top-thick") {
    return {
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      height: 6,
      backgroundColor: spec.color.primary,
    };
  }
  if (spec.hero.accentBar === "side-thick") {
    return {
      position: "absolute" as const,
      top: 0,
      bottom: 0,
      left: 0,
      width: 8,
      backgroundColor: spec.color.primary,
    };
  }
  if (spec.hero.accentBar === "underline") {
    return {
      position: "absolute" as const,
      top: 84,
      left: 48,
      width: 60,
      height: 2,
      backgroundColor: spec.color.accent,
    };
  }
  return { height: 0 };
}

function dividerStyle(spec: DesignSpec, _orientation: "horizontal" | "vertical") {
  if (spec.geometry.divider === "double-rule") {
    return {
      borderBottomWidth: 3,
      borderBottomColor: spec.color.primary,
      borderTopWidth: 1,
      borderTopColor: spec.color.primary,
    };
  }
  if (spec.geometry.divider === "block") {
    return {
      borderBottomWidth: 0,
      backgroundColor: tintOn(spec.color.primary, 0.06),
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: cornerRadius(spec, 4),
    };
  }
  if (spec.geometry.divider === "none") {
    return { borderBottomWidth: 0 };
  }
  return {
    borderBottomWidth: 1,
    borderBottomColor: spec.color.primary,
  };
}

function cornerRadius(spec: DesignSpec, soft: number): number {
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

function headingFont(spec: DesignSpec): string {
  return resolveFont(spec.typography.headingKind, spec.typography.headingWeight);
}

function bodyFont(spec: DesignSpec): string {
  return resolveFont(spec.typography.bodyKind, "regular");
}

function resolveFont(kind: FontKind, weight: FontWeight): string {
  const bold = weight === "bold" || weight === "black" || weight === "semibold";
  if (kind === "mono") return bold ? "Courier-Bold" : "Courier";
  if (kind === "serif" || kind === "display-serif") return bold ? "Times-Bold" : "Times-Roman";
  return bold ? "Helvetica-Bold" : "Helvetica";
}

function letterSpacing(tracking: Tracking, fontSize: number): number {
  switch (tracking) {
    case "tight":
      return -0.5;
    case "wide":
      return fontSize * 0.04;
    case "ultra":
      return fontSize * 0.1;
    case "normal":
    default:
      return 0;
  }
}

function caseTransform(value: string, headingCase: CaseStyle, override?: CaseStyle): string {
  const effective = override || headingCase;
  if (effective === "upper") return value.toUpperCase();
  if (effective === "title") return toTitleCase(value);
  return value;
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

function tintOn(color: string, alpha: number): string {
  // Approximate a tinted version by mixing toward white or black using the source.
  const normalized = color.replace("#", "").padEnd(6, "0").slice(0, 6);
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const isLight = brightness(color) > 150;
  const targetR = isLight ? 0 : 255;
  const targetG = isLight ? 0 : 255;
  const targetB = isLight ? 0 : 255;
  const mix = (channel: number, target: number) =>
    Math.round(channel * (1 - alpha) + target * alpha);
  const hex = [
    mix(r, targetR),
    mix(g, targetG),
    mix(b, targetB),
  ]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `#${hex}`;
}

// Variable referenced only by Experience helper; export for typed access.
export type { TypographySizes };
