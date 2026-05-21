import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { AnalysisResult, BrandSettings } from "./types";

const SAFE_TEXT_COLOR = "#24211d";
const MUTED_TEXT_COLOR = "#5c5a55";

interface DocumentProps {
  analysis: AnalysisResult;
  brand: BrandSettings;
  logoDataUrl?: string;
}

export function TailoredCvDocument({ analysis, brand, logoDataUrl }: DocumentProps) {
  const cv = analysis.tailoredCv.fullCv;
  const primary = brand.primaryColor || "#1b4d3e";
  const accent = brand.accentColor || "#d3a84f";
  const bg = brand.backgroundColor || "#fffdf8";
  const text = brand.textColor || SAFE_TEXT_COLOR;
  const styles = buildStyles(primary, accent, bg, text);

  return (
    <Document title={`${cv.name} — Tailored CV`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBar} fixed />

        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.brandLine}>
                {(analysis.employerName || brand.companyName || "Tailored CV").toUpperCase()}
              </Text>
              <Text style={styles.name}>{cv.name || "—"}</Text>
              <Text style={styles.headline}>{cv.headline || analysis.tailoredCv.headline}</Text>
            </View>
            {logoDataUrl ? <Image src={logoDataUrl} style={styles.logo} /> : null}
          </View>
          {cv.contactLines.length ? (
            <Text style={styles.contact}>{cv.contactLines.join("   /   ")}</Text>
          ) : null}
        </View>

        <View style={styles.body}>
          <View style={styles.sidebar}>
            {cv.skills.length ? (
              <SidebarSection title="Skills" items={cv.skills} styles={styles} />
            ) : null}
            {cv.education.length ? (
              <SidebarSection title="Education" items={cv.education} styles={styles} />
            ) : null}
            {cv.certifications.length ? (
              <SidebarSection title="Certifications" items={cv.certifications} styles={styles} />
            ) : null}
          </View>

          <View style={styles.main}>
            {cv.profile ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Profile</Text>
                <Text style={styles.paragraph}>{cv.profile}</Text>
              </View>
            ) : null}

            {cv.experience.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Experience</Text>
                {cv.experience.map((role, index) => (
                  <View key={index} style={styles.experience} wrap={false}>
                    <View style={styles.experienceHead}>
                      <Text style={styles.role}>{role.role}</Text>
                      <Text style={styles.dates}>{role.dates}</Text>
                    </View>
                    <Text style={styles.organisation}>
                      {[role.organisation, role.location].filter(Boolean).join(" / ")}
                    </Text>
                    {role.bullets.map((bullet, bulletIndex) => (
                      <View key={bulletIndex} style={styles.bulletRow}>
                        <Text style={styles.bulletMark}>•</Text>
                        <Text style={styles.bulletText}>{bullet}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            ) : null}

            {cv.additionalSections.map((section, sectionIndex) => (
              <View key={sectionIndex} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.items.map((item, itemIndex) => (
                  <View key={itemIndex} style={styles.bulletRow}>
                    <Text style={styles.bulletMark}>•</Text>
                    <Text style={styles.bulletText}>{item}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${cv.name || "Tailored CV"} — ${pageNumber} / ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}

function SidebarSection({
  title,
  items,
  styles,
}: {
  title: string;
  items: string[];
  styles: ReturnType<typeof buildStyles>;
}) {
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sidebarTitle}>{title}</Text>
      {items.map((item, index) => (
        <Text key={index} style={styles.sidebarItem}>
          {item}
        </Text>
      ))}
    </View>
  );
}

function buildStyles(primary: string, accent: string, bg: string, text: string) {
  return StyleSheet.create({
    page: {
      backgroundColor: bg,
      color: text,
      fontSize: 10.5,
      lineHeight: 1.5,
      paddingTop: 48,
      paddingBottom: 56,
      paddingHorizontal: 48,
      fontFamily: "Helvetica",
    },
    headerBar: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 6,
      backgroundColor: primary,
    },
    header: {
      borderBottomWidth: 1,
      borderBottomColor: primary,
      paddingBottom: 18,
      marginBottom: 24,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    headerText: {
      flexGrow: 1,
      paddingRight: 12,
    },
    brandLine: {
      fontSize: 8,
      color: accent,
      letterSpacing: 2,
      marginBottom: 8,
      fontFamily: "Helvetica-Bold",
    },
    name: {
      fontSize: 24,
      color: text,
      fontFamily: "Helvetica-Bold",
      marginBottom: 4,
    },
    headline: {
      fontSize: 11,
      color: primary,
      fontFamily: "Helvetica-Oblique",
    },
    logo: {
      maxWidth: 96,
      maxHeight: 48,
      objectFit: "contain",
    },
    contact: {
      marginTop: 12,
      fontSize: 9.5,
      color: MUTED_TEXT_COLOR,
    },
    body: {
      flexDirection: "row",
      gap: 24,
    },
    sidebar: {
      width: 150,
      borderRightWidth: 1,
      borderRightColor: primary,
      paddingRight: 16,
    },
    main: {
      flexGrow: 1,
    },
    section: {
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 9,
      color: primary,
      letterSpacing: 1.4,
      marginBottom: 8,
      fontFamily: "Helvetica-Bold",
    },
    sidebarTitle: {
      fontSize: 9,
      color: primary,
      letterSpacing: 1.4,
      marginBottom: 6,
      fontFamily: "Helvetica-Bold",
    },
    sidebarItem: {
      fontSize: 9.5,
      color: text,
      marginBottom: 4,
    },
    paragraph: {
      fontSize: 10.5,
      color: text,
    },
    experience: {
      marginBottom: 12,
    },
    experienceHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
    },
    role: {
      fontSize: 11,
      color: text,
      fontFamily: "Helvetica-Bold",
    },
    dates: {
      fontSize: 9.5,
      color: MUTED_TEXT_COLOR,
    },
    organisation: {
      fontSize: 10,
      color: primary,
      marginBottom: 6,
    },
    bulletRow: {
      flexDirection: "row",
      marginBottom: 3,
    },
    bulletMark: {
      width: 10,
      color: primary,
    },
    bulletText: {
      flexGrow: 1,
      fontSize: 10.5,
      color: text,
    },
    footer: {
      position: "absolute",
      bottom: 24,
      left: 48,
      right: 48,
      fontSize: 8,
      color: MUTED_TEXT_COLOR,
      textAlign: "center",
    },
  });
}
