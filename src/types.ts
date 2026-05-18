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
  evidenceMatches: EvidenceMatch[];
  gaps: string[];
  cautions: string[];
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
}
