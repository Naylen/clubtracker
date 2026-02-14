import { redirect } from "next/navigation";
import { authenticate, createSessionToken, setSessionCookie } from "@/lib/auth";

type SearchParams = {
  next?: string;
  error?: string;
};

function getSafeNextPath(nextPath: string | undefined): string {
  if (!nextPath) {
    return "/portal";
  }

  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/portal";
  }

  return nextPath;
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  async function loginAction(formData: FormData) {
    "use server";

    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const nextPath = getSafeNextPath(String(formData.get("next") ?? ""));

    if (!email || !password) {
      redirect(
        `/login?error=${encodeURIComponent("Email and password are required")}&next=${encodeURIComponent(nextPath)}`
      );
    }

    const user = await authenticate(email, password);

    if (!user) {
      redirect(
        `/login?error=${encodeURIComponent("Invalid credentials")}&next=${encodeURIComponent(nextPath)}`
      );
    }

    const token = createSessionToken(user);
    setSessionCookie(token);

    const destination =
      nextPath === "/portal" && user.role === "ADMIN" ? "/admin" : nextPath;

    redirect(destination);
  }

  const nextPath = getSafeNextPath(searchParams.next);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <h1 className="mb-6 text-3xl font-bold">Sign In</h1>

      {searchParams.error ? (
        <p className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {searchParams.error}
        </p>
      ) : null}

      <form action={loginAction} className="space-y-4 rounded border bg-white p-6">
        <input type="hidden" name="next" value={nextPath} />

        <label className="block text-sm font-medium">
          Email
          <input
            className="mt-1 w-full rounded border p-2"
            name="email"
            type="email"
            required
          />
        </label>

        <label className="block text-sm font-medium">
          Password
          <input
            className="mt-1 w-full rounded border p-2"
            name="password"
            type="password"
            required
          />
        </label>

        <button
          className="w-full rounded bg-gray-900 px-4 py-2 font-medium text-white"
          type="submit"
        >
          Sign In
        </button>
      </form>
    </main>
  );
}
