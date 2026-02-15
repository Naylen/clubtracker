export default function SetupPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">System Setup</h1>
        <p className="mt-2 text-sm text-gray-700">
          The application could not complete startup checks. Apply migrations, seed data, and
          verify environment values.
        </p>
      </section>

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Docker Compose</h2>
        <pre className="mt-3 overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
{`docker compose up --build -d
docker compose exec app npx prisma migrate deploy
docker compose exec app npx prisma db seed
docker compose exec app npm run admin:bootstrap`}
        </pre>
      </section>

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Critical Environment Notes</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li>
            In containers, set <code>DATABASE_URL</code> host to <code>db</code>, not{" "}
            <code>localhost</code>.
          </li>
          <li>
            Set <code>ADMIN_EMAIL</code> and <code>ADMIN_PASSWORD</code> for deterministic admin
            bootstrap.
          </li>
          <li>
            Use <code>ADMIN_ROTATE_PASSWORD=true</code> (or <code>ADMIN_BOOTSTRAP=true</code>) only
            when intentionally rotating admin credentials.
          </li>
        </ul>
      </section>
    </main>
  );
}

