import { promises as fs } from "fs";
import path from "path";
import { listFirestoreCollection, writeFirestoreDocument } from "./storage/firestore";
import { isFirestoreStorageEnabled } from "./storage/mode";

const dataDir = path.join(process.cwd(), "data");
const feedbackPath = path.join(dataDir, "okr-feedback.json");

export type UserFeedback = {
  id: string;
  message: string;
  page: string;
  userEmail: string;
  userName: string;
  createdAt: string;
};

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
    createdAt: new Date().toISOString()
  };

  if (isFirestoreStorageEnabled()) {
    await writeFirestoreDocument(`okrFeedback/${feedback.id}`, feedback);
    return feedback;
  }

  const file = await readFeedbackFile();
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(feedbackPath, JSON.stringify({ version: 1, feedback: [feedback, ...file.feedback].slice(0, 500) }, null, 2), "utf8");
  return feedback;
}

export async function readUserFeedback() {
  if (isFirestoreStorageEnabled()) {
    return listFirestoreCollection<UserFeedback>("okrFeedback", 200, "createdAt desc");
  }

  return (await readFeedbackFile()).feedback;
}

async function readFeedbackFile(): Promise<FeedbackFile> {
  try {
    const parsed = JSON.parse(await fs.readFile(feedbackPath, "utf8")) as FeedbackFile;
    return Array.isArray(parsed.feedback) ? parsed : { version: 1, feedback: [] };
  } catch {
    return { version: 1, feedback: [] };
  }
}
