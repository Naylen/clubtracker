import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const getCurrentPublicApplicationState = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    member: {
      findUnique: vi.fn(),
    },
    membershipEnrollment: {
      count: vi.fn(),
    },
    membershipApplication: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser,
  requireCurrentUser: vi.fn(),
  createSessionToken: vi.fn(),
  setSessionCookie: vi.fn(),
}));

vi.mock("@/lib/password", () => ({
  hashPassword: vi.fn(() => "hashed"),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

vi.mock("@/services/operations-state", () => ({
  getCurrentYearOperationalState: vi.fn().mockResolvedValue({
    dbReady: true,
    setupRequired: false,
    setupMessage: null,
    currentYear: 2026,
    applicationsOpen: false,
    renewalOpen: false,
    membershipCap: 350,
    year: 2026,
    membershipYear: null,
    applicationWindow: { opensAt: null, closesAt: null },
    applicationPublicOpen: false,
    activeEnrollments: 0,
    activeMembers: 0,
    pendingApplications: 0,
    unpaidRenewals: 0,
    capacityRemaining: 350,
    lateRenewalsEnabled: false,
    alerts: [],
  }),
}));

vi.mock("@/services/application-flow", () => ({
  ApplicationFlowError: class extends Error {
    code:
      | "APPLICATIONS_CLOSED"
      | "ACTIVE_MEMBER_EXISTS"
      | "ACCOUNT_EXISTS"
      | "ACCOUNT_NOT_FOUND";

    constructor(
      code:
        | "APPLICATIONS_CLOSED"
        | "ACTIVE_MEMBER_EXISTS"
        | "ACCOUNT_EXISTS"
        | "ACCOUNT_NOT_FOUND",
      message: string
    ) {
      super(message);
      this.code = code;
    }
  },
  createApplicantAccountAndSubmit: vi.fn(),
  submitApplicationForExistingAccount: vi.fn(),
  getCurrentOpenApplicationYear: vi.fn(),
  getCurrentPublicApplicationState,
}));

function collectText(input: unknown, output: string[] = []): string[] {
  if (input === null || input === undefined || typeof input === "boolean") {
    return output;
  }

  if (typeof input === "string" || typeof input === "number") {
    output.push(String(input));
    return output;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      collectText(item, output);
    }
    return output;
  }

  if (typeof input === "object" && "props" in input) {
    const props = (input as { props?: { children?: unknown } }).props;
    if (props && "children" in props) {
      collectText(props.children, output);
    }
  }

  return output;
}

describe("/apply gating", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(null);
  });

  it("renders a closed-page message when applications are disabled", async () => {
    getCurrentPublicApplicationState.mockResolvedValue({
      membershipYear: {
        id: "year_1",
        year: 2026,
      },
      decision: {
        allowed: false,
        message: "Applications are currently closed by the club.",
        reasons: ["Applications are currently closed by the club."],
        signupDay: new Date("2026-02-07T12:00:00-05:00"),
      },
    });

    const pageModule = await import("@/app/apply/page");
    const jsx = await pageModule.default({ searchParams: {} });
    const pageText = collectText(jsx).join(" ");

    expect(pageText).toContain("Applications are currently closed by the club.");
    expect(pageText).toContain("Existing member renewal");
  });

  it("renders the application flow when applications are open", async () => {
    getCurrentPublicApplicationState.mockResolvedValue({
      membershipYear: {
        id: "year_1",
        year: 2026,
      },
      decision: {
        allowed: true,
        message: "Applications are open.",
        reasons: [],
        signupDay: new Date("2026-02-07T12:00:00-05:00"),
      },
    });

    const pageModule = await import("@/app/apply/page");
    const jsx = await pageModule.default({ searchParams: {} });
    const pageText = collectText(jsx).join(" ");

    expect(pageText).toContain("How This Works");
    expect(pageText).toContain("Step 1: Applicant Account");
    expect(pageText).toContain("Street Address");
    expect(pageText).toContain("ZIP");
  });
});
