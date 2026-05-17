function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function buildParentPinResetEmail(data: {
  resetCode: string;
  expiresInMinutes?: number;
}) {
  const appUrl = getAppUrl();
  const mins = data.expiresInMinutes ?? 30;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:sans-serif;color:#1e293b;max-width:520px;margin:0 auto;padding:24px;">
  <h2 style="font-size:22px;font-weight:800;margin-bottom:8px;">Reset your Parent PIN</h2>
  <p>You requested to reset your Parent PIN on <strong>StarLiz Academy</strong>.</p>
  <p>Use the code below to continue:</p>
  <div style="margin:24px 0;text-align:center;">
    <span style="display:inline-block;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:12px;padding:16px 32px;font-size:32px;font-weight:900;letter-spacing:0.4em;color:#0f172a;">${data.resetCode}</span>
  </div>
  <p style="color:#64748b;font-size:14px;">This code expires in <strong>${mins} minutes</strong>.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
  <p style="color:#dc2626;font-size:13px;font-weight:600;">&#9888; Do not share this code with your child or anyone else.</p>
  <p style="color:#64748b;font-size:13px;">If you did not request a PIN reset, you can safely ignore this email. Your PIN has not been changed.</p>
  <p style="color:#64748b;font-size:13px;margin-top:24px;">StarLiz Academy &mdash; <a href="${appUrl}" style="color:#6366f1;">${appUrl}</a></p>
</body>
</html>
`;

  const text = `Reset your Parent PIN

You requested to reset your Parent PIN on StarLiz Academy.

Your reset code: ${data.resetCode}

This code expires in ${mins} minutes.

WARNING: Do not share this code with your child or anyone else.

If you did not request a PIN reset, you can safely ignore this email.

StarLiz Academy — ${appUrl}
`;

  return {
    subject: "Reset your StarLiz Academy Parent PIN",
    html,
    text,
  };
}
