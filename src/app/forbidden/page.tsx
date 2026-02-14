export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center p-6 text-center">
      <h1 className="mb-3 text-3xl font-bold">Access Denied</h1>
      <p className="text-gray-600">
        Your account does not have permission to view this page.
      </p>
    </main>
  );
}
