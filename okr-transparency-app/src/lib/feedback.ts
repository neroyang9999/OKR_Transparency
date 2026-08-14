import { promises as fs } from "fs";
import path from "path";
import { deleteFirestoreDocument, listFirestoreCollection, readFirestoreDocument, writeFirestoreDocument } from "./storage/firestore";
import { isFirestoreStorageEnabled } from "./storage/mode";

const dataDir = path.join(process.cwd(), "data");
const feedbackPath = path.join(dataDir, "okr-feedback.json");
const feedbackRetentionLimit = 500;

export type FeedbackStatus = "open" | "completed";

export type UserFeedback = {
  id: string;
  message: string;
  page: string;
  userEmail: string;
  userName: string;
  createdAt: string;
  status: FeedbackStatus;
  completedAt?: string;
  completedBy?: string;
};

type StoredUserFeedback = Omit<UserFeedback, "status"> & { status?: FeedbackStatus };

export type FeedbackInput = {
  message?: unknown;
  page?: unknown;
};

type FeedbackFile = {
  version: 1;
  feedback: UserFeedback[];
};

export function validateFeedbackInput(input: FeedbackInput) {
  const message = String(input.message ?? "").trim();
  const page = String(input.page ?? "/").trim().slice(0, 500) || "/";

  if (!message) return { ok: false as const, error: "Feedback is required" };
  if (message.length > 2000) return { ok: false as const, error: "Feedback must be 2000 characters or fewer" };

  return { ok: true as const, value: { message, page } };
}

export async function appendUserFeedback(
  input: { message: string; page: string },
  user: { email: string; displayName: string }
) {
  const feedback: UserFeedback = {
    id: `feedback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    message: input.message,
    page: input.page,
    userEmail: user.email,
    userName: user.displayName,
    createdAt: new Date().toISOString(),
    status: "open"
  };

  if (isFirestoreStorageEnabled()) {
    await writeFirestoreDocument(`okrFeedback/${feedback.id}`, feedback);
    return feedback;
  }

  const file = await readFeedbackFile();
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(feedbackPath, JSON.stringify({ version: 1, feedback: [feedback, ...file.feedback].slice(0, feedbackRetentionLimit) }, null, 2), "utf8");
  return feedback;
}

export async function readUserFeedback() {
  if (isFirestoreStorageEnabled()) {
    const feedback = await listFirestoreCollection<StoredUserFeedback>("okrFeedback", feedbackRetentionLimit, "createdAt desc");
    return feedback.map(normalizeUserFeedback);
  }

  return (await readFeedbackFile()).feedback.map(normalizeUserFeedback);
}

export async function updateUserFeedbackStatus(id: string, status: FeedbackStatus, actor: string) {
  const feedbackId = id.trim();
  if (!feedbackId || feedbackId.includes("/")) return null;

  if (isFirestoreStorageEnabled()) {
    const current = await readFirestoreDocument<StoredUserFeedback>(`okrFeedback/${feedbackId}`);
    if (!current) return null;
    const feedback = withFeedbackStatus(normalizeUserFeedback(current), status, actor);
    await writeFirestoreDocument(`okrFeedback/${feedbackId}`, feedback);
    return feedback;
  }

  const file = await readFeedbackFile();
  const index = file.feedback.findIndex((item) => item.id === feedbackId);
  if (index < 0) return null;
  const feedback = withFeedbackStatus(normalizeUserFeedback(file.feedback[index]), status, actor);
  file.feedback[index] = feedback;
  await writeFeedbackFile(file.feedback);
  return feedback;
}

export async function deleteUserFeedback(id: string) {
  const feedbackId = id.trim();
  if (!feedbackId || feedbackId.includes("/")) return false;

  if (isFirestoreStorageEnabled()) {
    return deleteFirestoreDocument(`okrFeedback/${feedbackId}`);
  }

  const file = await readFeedbackFile();
  const feedback = file.feedback.filter((item) => item.id !== feedbackId);
  if (feedback.length === file.feedback.length) return false;
  await writeFeedbackFile(feedback);
  return true;
}

async function readFeedbackFile(): Promise<FeedbackFile> {
  try {
    const parsed = JSON.parse(await fs.readFile(feedbackPath, "utf8")) as FeedbackFile;
    return Array.isArray(parsed.feedback) ? parsed : { version: 1, feedback: [] };
  } catch {
    return { version: 1, feedback: [] };
  }
}

function normalizeUserFeedback(feedback: StoredUserFeedback): UserFeedback {
  const { status, completedAt, completedBy, ...base } = feedback;
  if (status === "completed") {
    return { ...base, status, completedAt, completedBy };
  }
  return { ...base, status: "open" };
}

function withFeedbackStatus(feedback: UserFeedback, status: FeedbackStatus, actor: string): UserFeedback {
  if (status === "completed") {
    return {
      ...feedback,
      status,
      completedAt: new Date().toISOString(),
      completedBy: actor
    };
  }

  const openFeedback = { ...feedback };
  delete openFeedback.completedAt;
  delete openFeedback.completedBy;
  return { ...openFeedback, status: "open" };
}

async function writeFeedbackFile(feedback: StoredUserFeedback[]) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(feedbackPath, JSON.stringify({ version: 1, feedback: feedback.slice(0, 500) }, null, 2), "utf8");
}
