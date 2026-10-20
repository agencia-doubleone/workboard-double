// Testa o envio de e-mails (npm run email:check -- voce@doubleone.com.br):
// confere a conexão e o login no SMTP e manda os e-mails do Workboard (boas-vindas,
// nova senha, convite e código do portal do cliente) para o endereço informado,
// com dados de exemplo.
// Não usa o banco; só as variáveis SMTP_* do .env.local.

import nodemailer from "nodemailer";

import { env } from "@/env";
import { emailDelivery, sendEmail } from "@/lib/email";
import { passwordResetEmail, portalCodeEmail, portalInviteEmail, welcomeEmail } from "@/lib/email/templates";
import { PORTAL_CODE_EXPIRES_MINUTES, PORTAL_SIGN_IN_PATH } from "@/lib/portal";

async function main() {
  const to = process.argv[2];
  if (!to || !to.includes("@")) {
    console.log("Informe o destinatário: npm run email:check -- voce@doubleone.com.br");
    process.exit(1);
  }
  if (emailDelivery() !== "smtp" || !env.SMTP_HOST) {
    console.log("✖ SMTP_HOST e SMTP_FROM não estão no .env.local: os e-mails só sairiam no terminal.");
    process.exit(1);
  }

  const port = env.SMTP_PORT ?? 587;
  console.log(`SMTP ${env.SMTP_HOST}:${port}, remetente ${env.SMTP_FROM}`);
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? "" } : undefined,
    connectionTimeout: 10_000,
  });
  try {
    await transport.verify();
    console.log("✔ conexão e login no SMTP");
  } catch (error) {
    console.log("✖ conexão ou login no SMTP:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const loginUrl = `${env.BETTER_AUTH_URL}/login`;
  const samples = [
    welcomeEmail({ to, name: "Pessoa de Teste", password: "exemplo-Senha-123", loginUrl, invitedBy: "Administrador" }),
    passwordResetEmail({
      to,
      name: "Pessoa de Teste",
      url: `${env.BETTER_AUTH_URL}/redefinir-senha?error=INVALID_TOKEN`,
      expiresInHours: 1,
      requestedBy: "self",
    }),
    portalInviteEmail({
      to,
      name: "Pessoa do Cliente",
      clientName: "Cliente de Exemplo",
      url: `${env.BETTER_AUTH_URL}${PORTAL_SIGN_IN_PATH}`,
      invitedBy: "Administrador",
    }),
    portalCodeEmail({ to, name: "Pessoa do Cliente", code: "123456", expiresInMinutes: PORTAL_CODE_EXPIRES_MINUTES }),
  ];
  let failures = 0;
  for (const message of samples) {
    try {
      await sendEmail({ ...message, subject: `[teste] ${message.subject}` });
      console.log(`✔ enviado: ${message.subject}`);
    } catch (error) {
      failures++;
      console.log(`✖ ${message.subject}:`, error instanceof Error ? error.message : error);
    }
  }
  console.log(failures ? `\n${failures} envio(s) falharam.` : `\nTudo certo. Confira a caixa de ${to} (e o spam).`);
  process.exit(failures ? 1 : 0);
}

main();
