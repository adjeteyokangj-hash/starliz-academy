const APP_NAME = "StarLiz Academy";
const APP_TAGLINE = "Learn. Play. Grow.";

function shell(input: {
  title: string;
  intro: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footer?: string;
}) {
  const cta = input.ctaUrl && input.ctaLabel
    ? `<p style="margin:20px 0 0"><a href="${input.ctaUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#0f172a;color:#fff;text-decoration:none;font-weight:700">${input.ctaLabel}</a></p>`
    : "";

  const html = `
<div style="background:#f5f7fb;padding:24px 0;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
  <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden">
    <div style="padding:18px 24px;background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff">
      <div style="font-size:14px;letter-spacing:.08em;text-transform:uppercase;opacity:.8">${APP_NAME}</div>
      <div style="font-size:12px;opacity:.85">${APP_TAGLINE}</div>
      <h1 style="margin:12px 0 0;font-size:22px;line-height:1.2">${input.title}</h1>
    </div>
    <div style="padding:22px 24px">
      <p style="margin:0 0 12px;font-size:14px;color:#334155">${input.intro}</p>
      ${input.bodyHtml}
      ${cta}
      <p style="margin:18px 0 0;font-size:12px;color:#64748b">${input.footer ?? "If you were not expecting this email, you can safely ignore it."}</p>
    </div>
  </div>
</div>`;

  const text = [
    `${APP_NAME} — ${APP_TAGLINE}`,
    input.title,
    "",
    input.intro,
  ].join("\n");

  return { html, text };
}

export function buildSchoolInviteEmail(input: {
  schoolName: string;
  roleLabel: string;
  inviteUrl: string;
  expiresAt: Date;
  invitedByName?: string | null;
}) {
  const expiresText = input.expiresAt.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:14px">You have been invited to join <strong>${input.schoolName}</strong> as <strong>${input.roleLabel}</strong>.</p>
    ${input.invitedByName ? `<p style="margin:0 0 8px;font-size:14px">Invited by: <strong>${input.invitedByName}</strong>.</p>` : ""}
    <p style="margin:0 0 8px;font-size:14px">This secure invite link expires on <strong>${expiresText}</strong>.</p>
  `;

  const shellOut = shell({
    title: "You are invited to a school workspace",
    intro: "Set your password and activate your school account.",
    bodyHtml,
    ctaLabel: "Accept Invitation",
    ctaUrl: input.inviteUrl,
  });

  return {
    subject: `Invitation to ${input.schoolName} on ${APP_NAME}`,
    html: shellOut.html,
    text: `${shellOut.text}\nRole: ${input.roleLabel}\nAccept: ${input.inviteUrl}\nExpires: ${expiresText}`,
  };
}

export function buildSchoolInviteRevokedEmail(input: {
  schoolName: string;
  reason?: string | null;
}) {
  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:14px">Your invitation to <strong>${input.schoolName}</strong> has been revoked.</p>
    ${input.reason ? `<p style="margin:0 0 8px;font-size:14px">Reason: <strong>${input.reason}</strong>.</p>` : ""}
    <p style="margin:0 0 8px;font-size:14px">If this appears to be a mistake, contact your school administrator.</p>
  `;

  const shellOut = shell({
    title: "Invitation Revoked",
    intro: "Your invite link is no longer active.",
    bodyHtml,
  });

  return {
    subject: `${APP_NAME}: invitation revoked`,
    html: shellOut.html,
    text: `${shellOut.text}\nSchool: ${input.schoolName}\nReason: ${input.reason ?? "Not provided"}`,
  };
}

export function buildSchoolInviteExpiryReminderEmail(input: {
  schoolName: string;
  inviteUrl: string;
  expiresAt: Date;
}) {
  const expiresText = input.expiresAt.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:14px">Reminder: your invitation to <strong>${input.schoolName}</strong> is about to expire.</p>
    <p style="margin:0 0 8px;font-size:14px">Expiry: <strong>${expiresText}</strong>.</p>
  `;

  const shellOut = shell({
    title: "Your invitation is expiring soon",
    intro: "Complete account activation before expiry.",
    bodyHtml,
    ctaLabel: "Activate Account",
    ctaUrl: input.inviteUrl,
  });

  return {
    subject: `${APP_NAME}: invite expires soon`,
    html: shellOut.html,
    text: `${shellOut.text}\nActivate: ${input.inviteUrl}\nExpires: ${expiresText}`,
  };
}

export function buildSchoolInviteExpiredEmail(input: {
  schoolName: string;
}) {
  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:14px">Your invitation to <strong>${input.schoolName}</strong> has expired.</p>
    <p style="margin:0 0 8px;font-size:14px">Please request a new invitation from your school administrator.</p>
  `;

  const shellOut = shell({
    title: "Invitation Expired",
    intro: "This link can no longer be used.",
    bodyHtml,
  });

  return {
    subject: `${APP_NAME}: invitation expired`,
    html: shellOut.html,
    text: `${shellOut.text}\nSchool: ${input.schoolName}`,
  };
}
