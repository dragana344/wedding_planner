import "@/components/album/guest-album.css";

export default function AlbumNotFound() {
  return (
    <main className="ga-page">
      <header className="ga-header">
        <p className="ga-kicker">Албум</p>
        <h1 className="ga-title">Албумот не постои</h1>
        <p className="ga-date">Проверете го линкот или скенирајте го QR кодот повторно.</p>
      </header>
    </main>
  );
}
