export function Panel(props: { icon: React.ReactNode; title: string; step?: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-title">
        {props.step ? <span className="panel-step">{props.step}</span> : null}
        {props.icon}
        <h2>{props.title}</h2>
      </div>
      {props.children}
    </section>
  );
}
