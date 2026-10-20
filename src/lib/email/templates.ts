import type { EmailAttachment, EmailMessage } from "./index";
import { EMAIL_LOGO_CID, EMAIL_LOGO_PNG_BASE64 } from "./logo";

// E-mails do Workboard com a cara das telas públicas (login, redefinir senha):
// fundo preto, painel grafite com borda fina, o logo branco no topo e o botão
// claro. HTML de e-mail: tabelas e estilos inline (Gmail e Outlook ignoram
// <style> e flex), cores fixas (o e-mail é escuro em qualquer tema) e sempre
// uma versão em texto puro junto.

const COLORS = {
  page: "#000000",
  panel: "#111111",
  border: "#262626",
  highlight: "#333333",
  box: "#1a1a1a",
  title: "#f2f2f2",
  text: "#a0a0a0",
  faint: "#6b6b6b",
  button: "#e5e5e5",
  buttonText: "#171717",
};

const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

const logoAttachment = (): EmailAttachment => ({
  filename: "double-one.png",
  content: Buffer.from(EMAIL_LOGO_PNG_BASE64, "base64"),
  contentType: "image/png",
  cid: EMAIL_LOGO_CID,
});

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] || name;

function paragraph(html: string, { size = 14, color = COLORS.text, align = "center" } = {}) {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:${size}px;line-height:${Math.round(size * 1.6)}px;color:${color};text-align:${align};">${html}</p>`;
}

/** Botão "à prova de Outlook": célula com fundo e o link ocupando tudo. */
function button(label: string, url: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr>
    <td align="center" bgcolor="${COLORS.button}" style="border-radius:6px;">
      <a href="${escapeHtml(url)}" target="_blank" style="display:block;padding:11px 20px;font-family:${FONT};font-size:14px;font-weight:600;line-height:18px;color:${COLORS.buttonText};text-decoration:none;border-radius:6px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

/** Quadro com pares rótulo/valor (ex.: e-mail e senha de acesso). */
function detailsBox(rows: { label: string; value: string; mono?: boolean }[]) {
  const cells = rows
    .map(
      (row, index) => `<tr>
    <td style="padding:${index === 0 ? "16px" : "4px"} 20px ${index === rows.length - 1 ? "16px" : "12px"};">
      <div style="font-family:${FONT};font-size:12px;line-height:16px;color:${COLORS.text};">${escapeHtml(row.label)}</div>
      <div style="padding-top:4px;font-family:${row.mono ? MONO : FONT};font-size:15px;line-height:22px;color:${COLORS.title};word-break:break-all;${row.mono ? "letter-spacing:0.5px;" : ""}">${escapeHtml(row.value)}</div>
    </td>
  </tr>`,
    )
    .join("\n");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.box}" style="margin:8px 0 20px;background-color:${COLORS.box};border:1px solid ${COLORS.border};border-radius:8px;">
${cells}
</table>`;
}

function layout({ preheader, title, body }: { preheader: string; title: string; body: string }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLORS.page};">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.page}" style="background-color:${COLORS.page};">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.panel}" style="max-width:440px;background-color:${COLORS.panel};border:1px solid ${COLORS.border};border-top-color:${COLORS.highlight};border-radius:16px;">
        <tr>
          <td style="padding:40px 36px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="padding-bottom:28px;">
                  <img src="cid:${EMAIL_LOGO_CID}" width="39" height="40" alt="Double One" style="display:block;width:39px;height:40px;border:0;">
                </td>
              </tr>
              <tr>
                <td align="center" style="padding-bottom:12px;font-family:${FONT};font-size:22px;line-height:30px;font-weight:600;letter-spacing:-0.3px;color:${COLORS.title};">${escapeHtml(title)}</td>
              </tr>
              <tr>
                <td>
${body}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;">
        <tr>
          <td align="center" style="padding:20px 16px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.faint};">
            Workboard · Double One<br>E-mail automático, não precisa responder.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function welcomeEmail({
  to,
  name,
  password,
  loginUrl,
  invitedBy,
}: {
  to: string;
  name: string;
  password: string;
  loginUrl: string;
  /** Nome de quem criou a conta. */
  invitedBy: string;
}): EmailMessage {
  const firstName = firstNameOf(name);
  const title = `Boas-vindas, ${firstName}!`;
  const intro = `${invitedBy} criou sua conta no Workboard, o sistema de trabalhos da Double One. Entre com os dados abaixo.`;
  const tip = "Depois de entrar, troque a senha em Meu perfil (clique na sua foto, no canto de cima da tela).";
  const warning = "Não compartilhe esta senha. Se você não esperava este e-mail, fale com um administrador.";

  return {
    to,
    subject: "Sua conta no Workboard",
    text: [
      `Olá, ${firstName}.`,
      "",
      intro,
      "",
      `E-mail: ${to}`,
      `Senha: ${password}`,
      "",
      `Entrar: ${loginUrl}`,
      "",
      tip,
      warning,
    ].join("\n"),
    html: layout({
      preheader: "Seu acesso ao Workboard está pronto.",
      title,
      body: [
        paragraph(escapeHtml(intro)),
        detailsBox([
          { label: "E-mail", value: to },
          { label: "Senha", value: password, mono: true },
        ]),
        button("Entrar no Workboard", loginUrl),
        paragraph(escapeHtml(tip), { size: 13 }),
        paragraph(escapeHtml(warning), { size: 12, color: COLORS.faint }),
      ].join("\n"),
    }),
    attachments: [logoAttachment()],
  };
}

export function passwordResetEmail({
  to,
  name,
  url,
  expiresInHours,
  requestedBy,
}: {
  to: string;
  name: string;
  url: string;
  expiresInHours: number;
  /** "self": a pessoa pediu no "Esqueceu a senha?"; "admin": um admin mandou pela tela de usuários. */
  requestedBy: "self" | "admin";
}): EmailMessage {
  const firstName = firstNameOf(name);
  const intro =
    requestedBy === "self"
      ? `Olá, ${firstName}. Recebemos um pedido para redefinir a senha da sua conta no Workboard.`
      : `Olá, ${firstName}. Um administrador pediu a redefinição da sua senha no Workboard.`;
  const validity = `O link vale por ${expiresInHours} ${expiresInHours === 1 ? "hora" : "horas"} e só funciona uma vez. Ao trocar a senha, as sessões abertas são encerradas.`;
  const ignore =
    requestedBy === "self"
      ? "Se não foi você, ignore este e-mail: sua senha continua a mesma."
      : "Se você não esperava este e-mail, fale com um administrador.";

  return {
    to,
    subject: "Redefinição de senha · Workboard",
    text: [intro, "", "Para criar uma nova senha, acesse:", url, "", validity, ignore].join("\n"),
    html: layout({
      preheader: "Use o link para criar uma nova senha.",
      title: "Criar uma nova senha",
      body: [
        paragraph(escapeHtml(intro)),
        button("Criar nova senha", url),
        paragraph(escapeHtml(validity), { size: 13 }),
        paragraph(escapeHtml(ignore), { size: 13 }),
        paragraph(
          `Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${escapeHtml(url)}" target="_blank" style="color:${COLORS.text};word-break:break-all;">${escapeHtml(url)}</a>`,
          { size: 12, color: COLORS.faint },
        ),
      ].join("\n"),
    }),
    attachments: [logoAttachment()],
  };
}

/** Convite para o portal do cliente: o contato entra com o e-mail e um código, sem senha. */
export function portalInviteEmail({
  to,
  name,
  clientName,
  url,
  invitedBy,
}: {
  to: string;
  name: string;
  clientName: string;
  /** Endereço da tela de entrada do portal. */
  url: string;
  /** Nome de quem da agência liberou o acesso. */
  invitedBy: string;
}): EmailMessage {
  const firstName = firstNameOf(name);
  const intro = `${invitedBy}, da Double One, liberou seu acesso ao portal do cliente da ${clientName}. Por lá você vai acompanhar seus pedidos e aprovar as entregas da agência.`;
  const how = "Para entrar, informe este e-mail na tela do portal: enviamos um código na hora. Não existe senha para lembrar.";
  const warning = "Se você não esperava este e-mail, pode ignorá-lo.";

  return {
    to,
    subject: `Seu acesso ao portal da Double One · ${clientName}`,
    text: [`Olá, ${firstName}.`, "", intro, "", how, "", `E-mail de acesso: ${to}`, `Entrar: ${url}`, "", warning].join("\n"),
    html: layout({
      preheader: "Você recebeu acesso ao portal do cliente da Double One.",
      title: `Boas-vindas, ${firstName}!`,
      body: [
        paragraph(escapeHtml(intro)),
        detailsBox([{ label: "E-mail de acesso", value: to }]),
        button("Entrar no portal", url),
        paragraph(escapeHtml(how), { size: 13 }),
        paragraph(escapeHtml(warning), { size: 12, color: COLORS.faint }),
      ].join("\n"),
    }),
    attachments: [logoAttachment()],
  };
}

/** Código de entrada no portal do cliente. */
export function portalCodeEmail({
  to,
  name,
  code,
  expiresInMinutes,
}: {
  to: string;
  name: string;
  code: string;
  expiresInMinutes: number;
}): EmailMessage {
  const firstName = firstNameOf(name);
  const intro = `Olá, ${firstName}. Use o código abaixo para entrar no portal do cliente da Double One.`;
  const validity = `Ele vale por ${expiresInMinutes} minutos e só funciona uma vez.`;
  const ignore = "Se não foi você que pediu, ignore este e-mail: ninguém entra sem o código.";

  return {
    to,
    subject: `${code} é o seu código de acesso · Double One`,
    text: [intro, "", `Código: ${code}`, "", validity, ignore].join("\n"),
    html: layout({
      preheader: `Seu código: ${code}`,
      title: "Seu código de acesso",
      body: [
        paragraph(escapeHtml(intro)),
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.box}" style="margin:8px 0 20px;background-color:${COLORS.box};border:1px solid ${COLORS.border};border-radius:8px;">
  <tr>
    <td align="center" style="padding:18px 20px;font-family:${MONO};font-size:30px;line-height:36px;font-weight:600;letter-spacing:8px;color:${COLORS.title};">${escapeHtml(code)}</td>
  </tr>
</table>`,
        paragraph(escapeHtml(validity), { size: 13 }),
        paragraph(escapeHtml(ignore), { size: 12, color: COLORS.faint }),
      ].join("\n"),
    }),
    attachments: [logoAttachment()],
  };
}

/** Rodada nova para aprovar no portal (vai para os contatos que podem aprovar). */
export function deliveryForApprovalEmail({
  to,
  name,
  clientName,
  request,
  round,
  files,
  sentBy,
  url,
}: {
  to: string;
  name: string;
  clientName: string;
  /** "S-12 Arte para a promoção". */
  request: string;
  round: number;
  files: number;
  /** Quem da agência mandou. */
  sentBy: string;
  /** Página da solicitação no portal, já na aba das entregas. */
  url: string;
}): EmailMessage {
  const firstName = firstNameOf(name);
  const count = files === 1 ? "1 arquivo" : `${files} arquivos`;
  const intro = `${sentBy}, da Double One, mandou a rodada ${round} da solicitação ${request} para a ${clientName} aprovar: ${count}.`;
  const how = "No portal, aprove cada arquivo ou peça alterações dizendo o que mudar. A equipe recebe a resposta assim que você enviar.";

  return {
    to,
    subject: `Para aprovar: ${request} (rodada ${round}) · Double One`,
    text: [`Olá, ${firstName}.`, "", intro, "", how, "", `Ver e responder: ${url}`].join("\n"),
    html: layout({
      preheader: `${count} esperando a sua aprovação.`,
      title: "Entrega para aprovar",
      body: [
        paragraph(escapeHtml(`Olá, ${firstName}. ${intro}`)),
        detailsBox([
          { label: "Solicitação", value: request },
          { label: "Rodada", value: `${round} · ${count}` },
        ]),
        button("Ver e responder", url),
        paragraph(escapeHtml(how), { size: 13 }),
      ].join("\n"),
    }),
    attachments: [logoAttachment()],
  };
}
