/** Shown in place of the app when .env has no Neon credentials yet. */
export default function SetupNotice() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="brand-mark" src="/logo.jpg" alt="Sun Surf Alaçatı" />
          <div>
            <h1>Sun Surf Alaçatı</h1>
            <p>Yerel eğitmenlerle windsurf &amp; wingfoil dersleri</p>
          </div>
        </div>
      </header>

      <main className="setup">
        <h2>Uygulamayı Neon'a bağlayın</h2>
        <p>
          Takvim ve rezervasyonlar bir Neon Postgres veritabanında duruyor; uygulamanın açılabilmesi
          için projenizden iki adrese ihtiyacı var.
        </p>

        <ol>
          <li>
            <code>pg.new</code> adresinde bir proje oluşturun.
          </li>
          <li>
            <strong>Auth</strong> bölümünü açıp Neon Auth'u etkinleştirin ve <em>Auth Base URL</em>'i
            kopyalayın.
          </li>
          <li>
            <strong>Postgres database → Data API</strong> bölümünde JWT doğrulamasını Managed Better
            Auth'a yönlendirip etkinleştirin, <em>Data API URL</em>'i kopyalayın.
          </li>
          <li>
            <code>.env.example</code> dosyasını <code>.env</code> olarak kopyalayıp ikisini de
            yapıştırın; seed betiği için Postgres bağlantı dizesini de ekleyin.
          </li>
          <li>
            <code>npm run migrate</code> ve ardından <code>npm run seed</code> çalıştırın.
          </li>
          <li>
            <code>npm run dev</code>'i yeniden başlatın — Vite <code>.env</code> dosyasını yalnızca
            açılışta okur.
          </li>
        </ol>

        <p className="setup-foot">
          Ayrıntılı anlatım <code>README.md</code> içinde.
        </p>
      </main>
    </div>
  );
}
