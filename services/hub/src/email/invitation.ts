import { Resend } from "resend"

/**
 * Round-27 H fix: HTML-escape ALL user/tenant-controlled strings before
 * interpolating into the email body. An admin who sets their tenant
 * displayName to `</strong><a href="https://evil.com">click here</a>`
 * would otherwise inject phishing links into the invitation email sent
 * to a third party — the invitee's email client renders raw HTML and
 * has no way to know which links the hub legitimately put there.
 *
 * The subject header is sent as a plain-text MIME header (Resend handles
 * the encoding), so HTML chars there are safe — but we still escape for
 * defense-in-depth in case a downstream change moves the subject into
 * an HTML preview line.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export async function sendInvitationEmail(opts: {
  apiKey: string
  fromEmail: string
  to: string
  inviterName: string
  tenantName: string
  tenantSlug: string
  token: string
  appUrl: string
}): Promise<void> {
  const resend = new Resend(opts.apiKey)
  // Token is server-generated nanoid (URL-safe alphabet); appUrl is env-controlled.
  // No escape needed on either, but inviterName + tenantName are user/admin
  // controlled and MUST be escaped.
  const acceptUrl = `${opts.appUrl}/invite?token=${opts.token}`
  const safeInviter = escapeHtml(opts.inviterName)
  const safeTenant = escapeHtml(opts.tenantName)

  const { error } = await resend.emails.send({
    from: `Firefly Mesh <${opts.fromEmail}>`,
    to: opts.to,
    // Plain-text MIME header — Resend handles encoding. No HTML rendered here.
    subject: `You're invited to ${opts.tenantName} on Firefly Mesh`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1a1a1a;">You have a new invitation</h2>
  <p style="color: #444;">
    <strong>${safeInviter}</strong> has invited you to join
    <strong>${safeTenant}</strong> on Firefly Mesh.
  </p>
  <p>
    <a href="${acceptUrl}"
       style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
      Accept invitation
    </a>
  </p>
  <p style="color: #888; font-size: 13px;">
    This invitation expires in 7 days. If you didn't expect this, you can safely ignore it.
  </p>
</body>
</html>`,
  })

  if (error) {
    throw new Error(`Resend error: ${error.message}`)
  }
}
