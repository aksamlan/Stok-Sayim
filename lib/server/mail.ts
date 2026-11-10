// SMTP ayarlıysa e-posta gönderir; değilse sessizce atlar (uygulama e-postasız
// da tam çalışır). Ayar: SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS,
// SMTP_FROM — sunucuda /etc/stok-sayim.env içinden (kurulum scripti menüsü 'SMTP').

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST)
}

export async function sendMail(
  to: string | null | undefined,
  subject: string,
  text: string
): Promise<boolean> {
  if (!mailConfigured() || !to) return false
  try {
    const nodemailer = await import("nodemailer")
    const port = Number(process.env.SMTP_PORT ?? 587)
    const user = process.env.SMTP_USER
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: user ? { user, pass: process.env.SMTP_PASS ?? "" } : undefined,
    })
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? user ?? "stokzen@localhost",
      to,
      subject,
      text,
    })
    return true
  } catch (e) {
    console.error("[mail]", e instanceof Error ? e.message : e)
    return false
  }
}
