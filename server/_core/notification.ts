import { TRPCError } from "@trpc/server";
import { ENV } from "./env";
import { sendEmail, isEmailConfigured } from "../emailService";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Notification title is required." });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Notification content is required." });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

/**
 * Notify the dashboard owner via email.
 * Returns true if the message was sent, false if SMTP is not configured (silent skip).
 * Validation errors bubble up as TRPCErrors.
 */
export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  if (!isEmailConfigured()) {
    console.warn("[Notification] SMTP not configured — skipping owner notification");
    return false;
  }

  const to = ENV.adminEmail ? [ENV.adminEmail] : [];
  if (to.length === 0) {
    console.warn("[Notification] ADMIN_EMAIL not set — skipping owner notification");
    return false;
  }

  const htmlContent = content
    .split("\n")
    .map((line) => `<p style="margin:4px 0;font-size:14px;color:#333">${line}</p>`)
    .join("");

  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9f9f9;padding:24px">
  <div style="background:#1a1a1a;padding:16px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#E85BA8;margin:0;font-size:16px;letter-spacing:1px">SELVA AGENCY</h2>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">
    <h3 style="margin:0 0 16px;color:#1a1a1a;font-size:15px">${title}</h3>
    ${htmlContent}
  </div>
</div>`;

  try {
    const envio = await sendEmail({ to, subject: title, html, text: content, tipo: "owner" });
    return envio.ok;
  } catch (err) {
    console.warn("[Notification] Failed to send owner email:", err);
    return false;
  }
}
