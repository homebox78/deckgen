// 메일 발송 — config.php의 smtp_* 설정 사용 (Gmail SMTP 587/TLS)
// GCP VM은 25번 포트가 막혀 있어 SMTP 릴레이가 표준 경로 (powerPlus와 동일 구성)
import nodemailer from "nodemailer";

const env = (k: string, d = ""): string => (process.env[k] ?? d).trim();

export function mailConfigured(): boolean {
  return !!(env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASS"));
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  transporter ??= nodemailer.createTransport({
    host: env("SMTP_HOST"),
    port: Number(env("SMTP_PORT", "587")),
    secure: env("SMTP_SECURE") === "ssl", // tls(587)=STARTTLS → secure:false
    auth: { user: env("SMTP_USER"), pass: env("SMTP_PASS") },
  });
  return transporter;
}

export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  await getTransporter().sendMail({
    from: `"${env("MAIL_FROM_NAME", "DeckGen")}" <${env("MAIL_FROM", env("SMTP_USER"))}>`,
    to,
    subject,
    html,
  });
}

export function verificationEmailHtml(code: string): string {
  return `
  <div style="font-family:'Pretendard',Apple SD Gothic Neo,sans-serif;max-width:420px;margin:0 auto;padding:32px 24px;border:1px solid #E4E4E0;border-radius:16px">
    <p style="font-size:15px;font-weight:700;margin:0 0 4px">DeckGen 이메일 인증</p>
    <p style="font-size:13px;color:#6B6B66;margin:0 0 20px">아래 6자리 인증 코드를 입력해 주세요. 유효시간은 10분입니다.</p>
    <p style="font-size:32px;font-weight:800;letter-spacing:8px;text-align:center;margin:0;padding:16px;background:#F7F7F5;border-radius:12px">${code}</p>
    <p style="font-size:11.5px;color:#9B9B96;margin:20px 0 0">본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.</p>
  </div>`;
}
