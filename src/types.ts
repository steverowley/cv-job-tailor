export type SkillPriority = "required" | "preferred" | "tool" | "responsibility" | "tone";

export interface JobSkill {
  name: string;
  priority: SkillPriority;
  evidenceNeeded: string;
}

export interface EvidenceMatch {
  skill: string;
  cvEvidence: string;
  confidence: "strong" | "partial" | "gap";
}

export interface TailoredCv {
  headline: string;
  summary: string;
  coreSkills: string[];
  experienceBullets: string[];
  fullCv: FullCv;
  evidenceMatches: EvidenceMatch[];
  gaps: string[];
  cautions: string[];
}

export interface FullCvExperience {
  role: string;
  organisation: string;
  dates: string;
  location: string;
  bullets: string[];
}

export interface FullCvSection {
  title: string;
  items: string[];
}

export interface FullCv {
  name: string;
  contactLines: string[];
  headline: string;
  profile: string;
  skills: string[];
  experience: FullCvExperience[];
  education: string[];
  certifications: string[];
  additionalSections: FullCvSection[];
}

export interface AnalysisResult {
  jobTitle: string;
  employerName: string;
  skills: JobSkill[];
  tailoredCv: TailoredCv;
}

export interface BrandSettings {
  companyName: string;
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
  palette?: string[];
}

export type DesignArchetype =
  | "editorial"
  | "sidebar-classic"
  | "feature-band"
  | "monolith";

export type FontKind = "serif" | "sans" | "mono" | "display-serif";
export type FontWeight = "regular" | "medium" | "semibold" | "bold" | "black";
export type CaseStyle = "default" | "upper" | "title";
export type Tracking = "tight" | "normal" | "wide" | "ultra";
export type Density = "compact" | "comfortable" | "expansive";
export type HeadlineSize = "modest" | "large" | "display";
export type Corner = "sharp" | "soft" | "round" | "pill";
export type Divider = "rule" | "double-rule" | "block" | "none";
export type Bullet = "dot" | "dash" | "square" | "arrow" | "number";
export type AccentBar = "top-thick" | "side-thick" | "underline" | "none";
export type SectionLabelStyle =
  | "uppercase-tracked"
  | "title-case"
  | "underlined"
  | "numbered"
  | "block-tag";
export type SidebarPosition = "left" | "right" | "none";

export interface DesignSpec {
  archetype: DesignArchetype;
  mood: string;
  typography: {
    headingFont: string;
    headingKind: FontKind;
    headingWeight: FontWeight;
    headingCase: CaseStyle;
    headingTracking: Tracking;
    bodyFont: string;
    bodyKind: FontKind;
    density: Density;
    headlineSize: HeadlineSize;
  };
  geometry: {
    corner: Corner;
    divider: Divider;
    bullet: Bullet;
  };
  color: {
    pageBackground: string;
    surface: string;
    primary: string;
    accent: string;
    text: string;
    muted: string;
  };
  hero: {
    accentBar: AccentBar;
    showLogo: boolean;
  };
  sectionLabel: SectionLabelStyle;
  sidebar: SidebarPosition;
}
