import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mocks — all vi.mock() factory closures must reference hoisted refs.
// ---------------------------------------------------------------------------
const {
  requireMobileAuthMock,
  findFirstMock,
  updateMock,
  deleteManyMock,
  transactionMock,
} = vi.hoisted(() => ({
  requireMobileAuthMock: vi.fn(),
  findFirstMock: vi.fn(),
  updateMock: vi.fn(),
  deleteManyMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/mobile-bearer", () => ({
  requireMobileAuth: requireMobileAuthMock,
  options: () => new Response(null, { status: 204 }),
  CORS_HEADERS: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    parentChild: {
      findFirst: findFirstMock,
      update: updateMock,
    },
    weeklyLunchPlan: {
      deleteMany: deleteManyMock,
    },
    $transaction: transactionMock,
  },
}));

import {
  PATCH,
  DELETE,
} from "@/app/api/mobile/native/account/children/[id]/route";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const DEFAULT_AUTH = { parentUserId: "parent-1", restaurantId: "rest-1" };

/** A fully-populated child record returned by findFirst (PATCH path). */
const DEFAULT_CHILD_PATCH = {
  id: "child-abc",
  parentUserId: "parent-1",
  schoolId: "school-1",
  studentName: "Original Name",
  grade: "3rd",
  allergyNotes: "none",
  archivedAt: null,
  school: {
    restaurantId: "rest-1",
    id: "school-1",
    name: "Sunny Elementary",
    locationType: "SCHOOL",
  },
};

/** A fully-populated child record returned by findFirst (DELETE path). */
const DEFAULT_CHILD_DELETE = {
  id: "child-abc",
  parentUserId: "parent-1",
  archivedAt: null,
  school: { restaurantId: "rest-1" },
};

/** The record returned by prisma.parentChild.update after a PATCH. */
const DEFAULT_UPDATED_CHILD = {
  id: "child-abc",
  schoolId: "school-1",
  studentName: "Updated Name",
  grade: "4th",
  allergyNotes: "peanuts",
  school: { id: "school-1", name: "Sunny Elementary", locationType: "SCHOOL" },
};

// ---------------------------------------------------------------------------
// Request factories
// ---------------------------------------------------------------------------

function makePatchRequest(body: Record<string, unknown>) {
  return new Request(
    "http://localhost/api/mobile/native/account/children/child-abc",
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer fake-token",
      },
      body: JSON.stringify(body),
    }
  );
}

function makeDeleteRequest() {
  return new Request(
    "http://localhost/api/mobile/native/account/children/child-abc",
    {
      method: "DELETE",
      headers: { Authorization: "Bearer fake-token" },
    }
  );
}

const params = Promise.resolve({ id: "child-abc" });

// ---------------------------------------------------------------------------
// PATCH suite
// ---------------------------------------------------------------------------

describe("PATCH /api/mobile/native/account/children/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMobileAuthMock.mockResolvedValue(DEFAULT_AUTH);
    findFirstMock.mockResolvedValue(DEFAULT_CHILD_PATCH);
    updateMock.mockResolvedValue(DEFAULT_UPDATED_CHILD);
  });

  // 1. Full update — all optional fields supplied
  it("updates all supplied fields → 200 with updated child shape", async () => {
    const res = await PATCH(
      makePatchRequest({
        studentName: "Updated Name",
        schoolId: "school-2",
        grade: "4th",
        allergyNotes: "peanuts",
      }) as never,
      { params }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    // Response shape must include all expected fields.
    expect(body).toMatchObject({
      id: "child-abc",
      schoolId: "school-1",
      schoolName: "Sunny Elementary",
      locationType: "SCHOOL",
      studentName: "Updated Name",
      grade: "4th",
      allergyNotes: "peanuts",
    });
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  // 2. Partial update — only studentName supplied
  it("partial update — only studentName supplied → schoolId / grade / allergyNotes absent from update data", async () => {
    await PATCH(
      makePatchRequest({ studentName: "Just the Name" }) as never,
      { params }
    );

    expect(updateMock).toHaveBeenCalledTimes(1);
    const updateData = updateMock.mock.calls[0][0].data as Record<
      string,
      unknown
    >;

    // studentName must be set.
    expect(updateData.studentName).toBe("Just the Name");
    // Optional fields must NOT appear when absent from body.
    expect(updateData).not.toHaveProperty("schoolId");
    expect(updateData).not.toHaveProperty("grade");
    expect(updateData).not.toHaveProperty("allergyNotes");
  });

  // 3. Missing studentName → 400
  it("missing studentName → 400 'studentName is required', no DB write", async () => {
    const res = await PATCH(
      makePatchRequest({ grade: "5th" }) as never,
      { params }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("studentName is required");
    expect(findFirstMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  // 4. Child not found in DB
  it("child not found (findFirst returns null) → 404 'Child not found.'", async () => {
    findFirstMock.mockResolvedValue(null);

    const res = await PATCH(
      makePatchRequest({ studentName: "Ghost Kid" }) as never,
      { params }
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Child not found.");
    expect(updateMock).not.toHaveBeenCalled();
  });

  // 5. Wrong tenant — child belongs to a different restaurant
  it("wrong tenant: child.school.restaurantId ≠ auth.restaurantId → 404 (no info leak)", async () => {
    findFirstMock.mockResolvedValue({
      ...DEFAULT_CHILD_PATCH,
      school: { ...DEFAULT_CHILD_PATCH.school, restaurantId: "rest-OTHER" },
    });

    const res = await PATCH(
      makePatchRequest({ studentName: "Sneaky" }) as never,
      { params }
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Child not found.");
    expect(updateMock).not.toHaveBeenCalled();
  });

  // 6. Unauthenticated — requireMobileAuth throws { status: 401 }
  it("unauthenticated: requireMobileAuth throws { status: 401 } → 401", async () => {
    requireMobileAuthMock.mockRejectedValue(
      Object.assign(
        new Error("Unauthorized — sign in for this restaurant to continue."),
        { status: 401 }
      )
    );

    const res = await PATCH(
      makePatchRequest({ studentName: "No Auth" }) as never,
      { params }
    );

    expect(res.status).toBe(401);
    expect(findFirstMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  // 7. Adversarial — different parent's child: findFirst filters by parentUserId → returns null → 404
  it("adversarial: different parent's child — findFirst returns null because parentUserId is included in where clause → 404", async () => {
    // Simulate another parent owning the child: DB returns null because
    // the where clause pins parentUserId to auth.parentUserId ("parent-1")
    // but the child record belongs to "parent-OTHER".
    findFirstMock.mockResolvedValue(null);

    const res = await PATCH(
      makePatchRequest({ studentName: "XSRF attempt" }) as never,
      { params }
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Child not found.");

    // Verify the query included the parentUserId filter (ownership pin).
    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ parentUserId: "parent-1" }),
      })
    );
    expect(updateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DELETE suite
// ---------------------------------------------------------------------------

describe("DELETE /api/mobile/native/account/children/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMobileAuthMock.mockResolvedValue(DEFAULT_AUTH);
    findFirstMock.mockResolvedValue(DEFAULT_CHILD_DELETE);
    // $transaction receives an array of Prisma operation promises.
    // We simulate execution by resolving the individual mock operations
    // and having $transaction resolve successfully.
    deleteManyMock.mockResolvedValue({ count: 2 });
    updateMock.mockResolvedValue({ id: "child-abc", archivedAt: new Date() });
    transactionMock.mockResolvedValue([{ count: 2 }, { id: "child-abc" }]);
  });

  // 8. Successful delete
  it("successful delete — $transaction called, returns 200 { ok: true }", async () => {
    const res = await DELETE(makeDeleteRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  // 9. Child not found
  it("child not found (findFirst returns null) → 404 'Child not found.'", async () => {
    findFirstMock.mockResolvedValue(null);

    const res = await DELETE(makeDeleteRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Child not found.");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  // 10. Wrong tenant
  it("wrong tenant: child.school.restaurantId ≠ auth.restaurantId → 404 (no info leak)", async () => {
    findFirstMock.mockResolvedValue({
      ...DEFAULT_CHILD_DELETE,
      school: { restaurantId: "rest-OTHER" },
    });

    const res = await DELETE(makeDeleteRequest() as never, { params });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Child not found.");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  // 11. Unauthenticated
  it("unauthenticated: requireMobileAuth throws { status: 401 } → 401", async () => {
    requireMobileAuthMock.mockRejectedValue(
      Object.assign(
        new Error("Unauthorized — sign in for this restaurant to continue."),
        { status: 401 }
      )
    );

    const res = await DELETE(makeDeleteRequest() as never, { params });

    expect(res.status).toBe(401);
    expect(findFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  // 12. Adversarial — verify weeklyLunchPlan.deleteMany is called with correct args
  it("adversarial: delete cascades weekly plans — weeklyLunchPlan.deleteMany called with { parentUserId, parentChildId: id }", async () => {
    // Capture the array of operations passed to $transaction.
    let capturedOps: unknown[] = [];
    transactionMock.mockImplementation(async (ops: unknown[]) => {
      capturedOps = ops;
      // Execute each op so deleteMany and update mocks are invoked.
      const results = await Promise.all(ops as Promise<unknown>[]);
      return results;
    });

    const res = await DELETE(makeDeleteRequest() as never, { params });
    expect(res.status).toBe(200);

    // $transaction must have been called with an array of two operations.
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(capturedOps).toHaveLength(2);

    // weeklyLunchPlan.deleteMany must have been called with the correct
    // ownership + child scoping to avoid cross-parent data leaks.
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { parentUserId: "parent-1", parentChildId: "child-abc" },
    });

    // parentChild.update must soft-delete by setting archivedAt.
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "child-abc" },
        data: expect.objectContaining({ archivedAt: expect.any(Date) }),
      })
    );
  });
});
