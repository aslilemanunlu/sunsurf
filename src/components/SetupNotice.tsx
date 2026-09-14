/** Shown in place of the app when .env has no Neon credentials yet. */
export default function SetupNotice() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ≈
          </span>
          <div>
            <h1>Windfoil</h1>
            <p>Windsurf &amp; wingfoil classes with local instructors</p>
          </div>
        </div>
      </header>

      <main className="setup">
        <h2>Connect this app to Neon</h2>
        <p>
          The schedule and your bookings live in a Neon Postgres database, so the app needs two URLs
          from your Neon project before it can start.
        </p>

        <ol>
          <li>
            Create a project at <code>pg.new</code>.
          </li>
          <li>
            Open <strong>Auth</strong> and enable Neon Auth. Copy the <em>Auth Base URL</em>.
          </li>
          <li>
            Open <strong>Postgres database → Data API</strong>, point JWT auth at Managed Better
            Auth, enable it, and copy the <em>Data API URL</em>.
          </li>
          <li>
            Copy <code>.env.example</code> to <code>.env</code> and paste both in, along with your
            Postgres connection string for the seed script.
          </li>
          <li>
            Run <code>db/001_init.sql</code> in the Neon SQL Editor, then <code>npm run seed</code>.
          </li>
          <li>
            Restart <code>npm run dev</code> — Vite only reads <code>.env</code> at startup.
          </li>
        </ol>

        <p className="setup-foot">
          The full walkthrough is in <code>README.md</code>.
        </p>
      </main>
    </div>
  );
}
