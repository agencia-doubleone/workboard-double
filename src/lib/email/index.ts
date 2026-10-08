// Envio de e-mails. Hoje só existe o transporte de desenvolvimento (imprime
// no terminal). TODO(roadmap): transporte SMTP com nodemailer; ao configurá-lo,
// isEmailConfigured() passa a refletir as variáveis SMTP_*.

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export function isEmailConfigured() {
  return process.env.NODE_ENV !== "production";
}

export async function sendEmail(message: EmailMessage) {
  if (!isEmailConfigured()) {
    throw new Error("Envio de e-mails não configurado (SMTP).");
  }

  console.info(
    [
      "",
      "┌─ [email:dev] ─────────────────────────────",
      `│ Para:    ${message.to}`,
      `│ Assunto: ${message.subject}`,
      "└───────────────────────────────────────────",
      message.text,
      "",
    ].join("\n"),
  );
}
