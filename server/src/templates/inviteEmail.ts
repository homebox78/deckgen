// DeckGen 공유 초대 메일 — DeckGenPackage/DeckGen Invite Email.html 이식
// 메일 클라이언트 호환: table 레이아웃 + 인라인 스타일만 사용
export interface InviteVars {
  inviterName: string;
  inviterEmail: string;
  deckTitle: string;
  roleLabel: string; // "편집 가능" | "보기 전용"
  roleDesc: string;
  inviteUrl: string;
  deckMeta: string;
  recipientEmail: string;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function inviteEmailHtml(v: InviteVars): string {
  const F = `'Pretendard','Apple SD Gothic Neo','Malgun Gothic','Segoe UI',sans-serif`;
  const name = esc(v.inviterName);
  const url = esc(v.inviteUrl);
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>DeckGen 덱 공유 초대</title></head>
<body style="margin:0;padding:0;background-color:#F0F0EE;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${name}님이 '${esc(v.deckTitle)}' 덱에 초대했어요 — 권한: ${esc(v.roleLabel)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F0F0EE;"><tr><td align="center" style="padding:36px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:100%;">
<tr><td style="padding:0 4px 18px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="width:26px;height:26px;background-color:#1A1A1A;border-radius:7px;font-size:0;line-height:0;">&nbsp;</td>
<td style="padding-left:9px;font-family:${F};font-size:17px;font-weight:700;color:#1A1A1A;">DeckGen</td>
</tr></table></td></tr>
<tr><td style="background-color:#FFFFFF;border:1px solid #E4E4E0;border-radius:16px;padding:36px 36px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding-bottom:6px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" style="width:52px;height:52px;background-color:#1A1A1A;border-radius:26px;font-family:${F};font-size:20px;font-weight:700;color:#FFFFFF;text-align:center;vertical-align:middle;">${esc(v.inviterName.slice(0, 2))}</td>
</tr></table></td></tr>
<tr><td align="center" style="font-family:${F};font-size:20px;line-height:1.45;font-weight:700;color:#1A1A1A;padding:12px 0 6px;">${name}님이 덱에 초대했어요</td></tr>
<tr><td align="center" style="font-family:${F};font-size:13.5px;line-height:1.65;color:#6B6B66;padding-bottom:24px;">${esc(v.inviterEmail)} 계정에서 아래 덱을 함께 작업하도록 요청했습니다.</td></tr>
<tr><td style="border:1px solid #E4E4E0;border-radius:12px;padding:16px 18px;background-color:#FBFBFA;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="width:44px;vertical-align:top;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="width:40px;height:26px;background-color:#FFFFFF;border:1px solid #E4E4E0;border-radius:5px;border-bottom:3px solid #1A1A1A;font-size:0;">&nbsp;</td></tr></table></td>
<td style="padding-left:12px;vertical-align:top;">
<div style="font-family:${F};font-size:15px;font-weight:700;color:#1A1A1A;line-height:1.4;">${esc(v.deckTitle)}</div>
<div style="font-family:${F};font-size:12px;color:#8A8A84;padding-top:3px;">${esc(v.deckMeta)}</div></td>
<td align="right" style="vertical-align:top;white-space:nowrap;"><span style="display:inline-block;font-family:${F};font-size:11px;font-weight:700;color:#1A1A1A;background-color:#F0F0EE;border:1px solid #D4D4CE;border-radius:99px;padding:5px 12px;">${esc(v.roleLabel)}</span></td>
</tr></table></td></tr>
<tr><td align="center" style="font-family:${F};font-size:12.5px;line-height:1.65;color:#6B6B66;padding:16px 8px 22px;">부여된 권한: <b style="color:#1A1A1A;">${esc(v.roleLabel)}</b> — ${esc(v.roleDesc)}</td></tr>
<tr><td align="center" style="padding-bottom:14px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" style="background-color:#1A1A1A;border-radius:10px;"><a href="${url}" target="_blank" style="display:inline-block;font-family:${F};font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;padding:13px 40px;border-radius:10px;">덱 열기</a></td>
</tr></table></td></tr>
<tr><td align="center" style="font-family:${F};font-size:11.5px;line-height:1.7;color:#8A8A84;padding-bottom:4px;">버튼이 열리지 않으면 아래 주소를 브라우저에 붙여넣으세요.<br><a href="${url}" target="_blank" style="color:#55554F;text-decoration:underline;word-break:break-all;">${url}</a></td></tr>
</table></td></tr>
<tr><td style="padding:14px 4px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;border:1px solid #E4E4E0;border-radius:12px;"><tr>
<td style="padding:14px 18px;font-family:${F};font-size:11.5px;line-height:1.75;color:#6B6B66;"><b style="color:#1A1A1A;">권한 안내</b><br>· <b style="color:#1A1A1A;">편집 가능</b> — 아웃라인·슬라이드 수정, 실시간 공동 편집<br>· <b style="color:#1A1A1A;">보기 전용</b> — 열람과 PPTX 다운로드만 가능, 편집 불가<br>권한은 덱 소유자가 공유 설정에서 언제든 변경하거나 해제할 수 있습니다.</td>
</tr></table></td></tr>
<tr><td align="center" style="padding:22px 8px 0;font-family:${F};font-size:11px;line-height:1.8;color:#9C9C96;">이 메일은 ${esc(v.recipientEmail)} 주소로 발송된 DeckGen 공유 초대 메일입니다.<br>본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.</td></tr>
</table></td></tr></table>
</body></html>`;
}
