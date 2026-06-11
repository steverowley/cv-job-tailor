import { Sparkles } from "lucide-react";
import { AnalysisResult } from "../types";

export function ReviewPanel({ analysis }: { analysis: AnalysisResult | null }) {
  if (!analysis) {
    return (
      <section className="panel empty-state">
        <span className="empty-state-eyebrow">Review</span>
        <h2>Skills, evidence, and gaps will appear here.</h2>
        <p>Run the analysis to see how the job's requirements map onto your CV — and what's missing.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <Sparkles aria-hidden="true" />
        <h2>Evidence review</h2>
      </div>
      <div className="skill-list">
        {analysis.skills.map((skill, index) => (
          <span key={index} className={`skill skill-${skill.priority}`}>
            {skill.name}
          </span>
        ))}
      </div>
      <div className="evidence-list">
        {analysis.tailoredCv.evidenceMatches.map((match, index) => (
          <article key={index} className="evidence-item">
            <strong>{match.skill}</strong>
            <p>{match.cvEvidence}</p>
            <span>{match.confidence}</span>
          </article>
        ))}
      </div>
      {analysis.tailoredCv.gaps.length ? (
        <div className="gap-box">
          <strong>Unsupported gaps</strong>
          <ul>
            {analysis.tailoredCv.gaps.map((gap, index) => (
              <li key={index}>{gap}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
