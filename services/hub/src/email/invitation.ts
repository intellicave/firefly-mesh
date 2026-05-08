import { Resend } from "resend"

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
  const acceptUrl = `${opts.appUrl}/invite?token=${opts.token}`

  const { error } = await resend.emails.send({
    from: `Firefly Mesh <${opts.fromEmail}>`,
    to: opts.to,
    subject: `You're invited to ${opts.tenantName} on Firefly Mesh`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1a1a1a;">You have a new invitation</h2>
  <p style="color: #444;">
    <strong>${opts.inviterName}</strong> has invited you to join
    <strong>${opts.tenantName}</strong> on Firefly Mesh.
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
