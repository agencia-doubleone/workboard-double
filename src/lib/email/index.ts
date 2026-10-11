import nodemailer, { type Transporter } from "nodemailer";

// Envio de e-mails por SMTP (nodemailer). Com SMTP_HOST e SMTP_FROM definidos,
// envia de verdade (também em desenvolvimento); sem eles, em desenvolvimento o
// e-mail só é impresso no terminal e, em produção, o envio fica desligado.
// Lê process.env direto (e não @/env): este módulo entra na config do auth, que
// também roda em scripts fora do Next. A validação das variáveis está em src/env.ts.

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
  /** Imagem dentro do HTML (<img src="cid:...">). */
  cid?: string;
};

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
};

const value = (name: string) => process.env[name]?.trim() || undefined;

function readSmtpConfig(): SmtpConfig | null {
  const host = value("SMTP_HOST");
  const from = value("SMTP_FROM");
  if (!host || !from) return null;
  const port = Number(value("SMTP_PORT") ?? 587);
  const secure = value("SMTP_SECURE");
  return {
    host,
    port,
    // 465 é TLS direto; 587 e 25 começam sem TLS e sobem com STARTTLS.
    secure: secure ? secure === "true" : port === 465,
    user: value("SMTP_USER"),
    password: value("SMTP_PASSWORD"),
    from,
  };
}

/** Como os e-mails saem agora: "smtp", "console" (só o terminal, em desenvolvimento) ou null (desligado). */
export function emailDelivery(): "smtp" | "console" | null {
  if (readSmtpConfig()) return "smtp";
  return process.env.NODE_ENV === "production" ? null : "console";
}

export function isEmailConfigured() {
  return emailDelivery() !== null;
}

let transporter: { key: string; instance: Transporter } | null = null;

function getTransporter(config: SmtpConfig) {
  const key = JSON.stringify(config);
  if (transporter?.key !== key) {
    transporter = {
      key,
      instance: nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user ? { user: config.user, pass: config.password ?? "" } : undefined,
        // Quem espera é uma Server Action: melhor falhar logo do que travar a tela.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }),
    };
  }
  return transporter.instance;
}

export async function sendEmail(message: EmailMessage) {
  const config = readSmtpConfig();
  if (config) {
    await getTransporter(config).sendMail({
      from: config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments,
    });
    return;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Envio de e-mails não configurado (SMTP_HOST e SMTP_FROM).");
  }

  console.info(
    [
      "",
      "┌─ [email:dev] ─────────────────────────────",
      `│ Para:    ${message.to}`,
      `│ Assunto: ${message.subject}`,
      "│ (sem SMTP_HOST: só no terminal; o HTML não é mostrado)",
      "└───────────────────────────────────────────",
      message.text,
      "",
    ].join("\n"),
  );
}
