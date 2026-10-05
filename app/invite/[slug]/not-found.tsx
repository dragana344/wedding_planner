// A guest with a mistyped or withdrawn invitation link. They have no business
// on the marketing site, so this page only tells them what to do next.
export default function InvitationNotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#F5EFE4", color: "#3d3528", textAlign: "center" }}>
      <div style={{ maxWidth: 420 }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>Поканата не е пронајдена</h1>
        <p style={{ marginTop: 12, fontSize: 16, lineHeight: 1.6 }}>
          Линкот можеби е погрешно препишан или поканата е повлечена. Побарајте го линкот повторно од домаќините.
        </p>
      </div>
    </main>
  );
}
