import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteFirestoreDocument, listFirestoreCollection, readFirestoreDocument, writeFirestoreDocument } from "./storage/firestore";
import { isFirestoreStorageEnabled } from "./storage/mode";
import { deleteUserFeedback, readUserFeedback, updateUserFeedbackStatus, validateFeedbackInput } from "./feedback";

vi.mock("./storage/firestore", () => ({
  deleteFirestoreDocument: vi.fn(),
  listFirestoreCollection: vi.fn(),
  readFirestoreDocument: vi.fn(),
  writeFirestoreDocument: vi.fn()
}));
vi.mock("./storage/mode", () => ({ isFirestoreStorageEnabled: vi.fn() }));

const legacyFeedback = {
  id: "feedback-1",
  message: "Please add filters",
  page: "/teams",
  userEmail: "member@company.com",
  userName: "Team Member",
  createdAt: "2026-07-14T08:00:00.000Z"
};

describe("feedback input", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isFirestoreStorageEnabled).mockReturnValue(true);
  });

  it("trims feedback and keeps page context", () => {
    expect(validateFeedbackInput({ message: "  Useful suggestion  ", page: "/teams?lang=en" })).toEqual({
      ok: true,
      value: { message: "Useful suggestion", page: "/teams?lang=en" }
    });
  });

  it("rejects empty or oversized feedback", () => {
    expect(validateFeedbackInput({ message: "   " })).toMatchObject({ ok: false });
    expect(validateFeedbackInput({ message: "x".repeat(2001) })).toMatchObject({ ok: false });
  });

  it("treats legacy feedback without a status as open", async () => {
    vi.mocked(listFirestoreCollection).mockResolvedValueOnce([legacyFeedback]);

    await expect(readUserFeedback()).resolves.toEqual([{ ...legacyFeedback, status: "open" }]);
  });

  it("marks feedback as completed with the acting administrator", async () => {
    vi.mocked(readFirestoreDocument).mockResolvedValueOnce(legacyFeedback);

    const feedback = await updateUserFeedbackStatus("feedback-1", "completed", "Admin");

    expect(feedback).toMatchObject({ status: "completed", completedBy: "Admin" });
    expect(writeFirestoreDocument).toHaveBeenCalledWith(
      "okrFeedback/feedback-1",
      expect.objectContaining({ status: "completed", completedBy: "Admin" })
    );
  });

  it("deletes feedback from Firestore", async () => {
    vi.mocked(deleteFirestoreDocument).mockResolvedValueOnce(true);

    await expect(deleteUserFeedback("feedback-1")).resolves.toBe(true);
    expect(deleteFirestoreDocument).toHaveBeenCalledWith("okrFeedback/feedback-1");
  });

  it("rejects feedback ids containing path separators", async () => {
    await expect(deleteUserFeedback("feedback-1/other")).resolves.toBe(false);
    expect(deleteFirestoreDocument).not.toHaveBeenCalled();
  });
});
