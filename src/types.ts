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

