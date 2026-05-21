interface Props {
  html: string;
}

export function CvHtmlPreview({ html }: Props) {
  if (!html) {
    return (
      <section className="panel empty-state">
        <span className="empty-state-eyebrow">CV</span>
        <h2>The branded CV will appear here.</h2>
        <p>Run the analysis to generate an HTML CV that matches the employer's homepage.</p>
      </section>
    );
  }

  return (
    <div className="cv-html-frame">
      <iframe
        title="Tailored CV preview"
        srcDoc={html}
        sandbox=""
        className="cv-html-iframe"
      />
    </div>
  );
}
