import type { EmailMessage } from "./index";

export function passwordResetEmail({
  to,
  name,
  url,
  expiresInHours,
}: {
  to: string;
  name: string;
  url: string;
  expiresInHours: number;
}): EmailMessage {
  const firstName = name.split(" ")[0];
  return {
    to,
    subject: "Redefinição de senha · Workboard",
    text: [
      `Olá, ${firstName}.`,
      "",
      "Um administrador solicitou a redefinição da sua senha no Workboard.",
      "Para criar uma nova senha, acesse:",
      url,
      "",
      `O link vale por ${expiresInHours} horas. Se você não esperava este e-mail, fale com um administrador.`,
    ].join("\n"),
  };
}
