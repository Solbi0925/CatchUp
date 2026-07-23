export function RoutePlaceholder({ title }: { title: string }) {
  return (
    <section className="placeholder-page">
      <h1>{title}</h1>
      <p>이 화면은 다른 팀원이 연결할 수 있도록 route만 준비했어요.</p>
    </section>
  );
}
