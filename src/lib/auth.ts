import { createHmac, timingSafeEqual } from "crypto";
import type { MemberStatus, Role } from "@prisma/client";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
export const SESSION_COOKIE = "mcfgc_session";

export type AuthUser = {
  memberId: string;
  email: string;
  role: Role;
  status?: MemberStatus;
};

type SessionPayload = AuthUser & {
  exp: number;
};

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET (or NEXTAUTH_SECRET) is required.");
  }
  return secret;
}

function signValue(value: string): string {
  return createHmac("sha256", getAuthSecret()).update(value).digest("base64url");
}

export function createSessionToken(user: AuthUser): string {
  const payload: SessionPayload = {
    ...user,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signValue(encoded)}`;
}

export function verifySessionToken(token: string | undefined): AuthUser | null {
  if (!token) {
    return null;
  }

  const [encodedPayload, providedSignature] = token.split(".");
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = signValue(encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature);
  const providedBuffer = Buffer.from(providedSignature);

  if (expectedBuffer.length !== providedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
    return null;
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8")
  ) as SessionPayload;

  if (!payload.memberId || !payload.email || !payload.role) {
    return null;
  }

  if (Date.now() > payload.exp) {
    return null;
  }

  return {
    memberId: payload.memberId,
    email: payload.email,
    role: payload.role,
  };
}

export function getUserFromRequest(request: NextRequest): AuthUser | null {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export function setSessionCookie(token: string): void {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(): void {
  cookies().set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function authenticate(email: string, password: string): Promise<AuthUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const member = await prisma.member.findUnique({ where: { email: normalizedEmail } });

  if (!member || !member.isActive || member.status === "INACTIVE") {
    return null;
  }

  if (!verifyPassword(password, member.passwordHash)) {
    return null;
  }

  return {
    memberId: member.id,
    email: member.email,
    role: member.role,
    status: member.status,
  };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export async function requireCurrentUser(nextPath = "/portal"): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return user;
}

export async function requireAdmin(nextPath = "/admin"): Promise<AuthUser> {
  const user = await requireCurrentUser(nextPath);
  if (user.role !== "ADMIN") {
    redirect("/forbidden");
  }
  return user;
}
