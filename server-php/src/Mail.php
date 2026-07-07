<?php
/**
 * 메일 발송 — config.php smtp_* 사용. 의존성 0 raw SMTP (STARTTLS 587, AUTH LOGIN).
 * GCP VM은 25번 포트 차단 → Gmail SMTP 릴레이가 표준 경로 (powerPlus와 동일).
 */
final class Mail
{
    public static function configured(): bool
    {
        return trim((string) Db::cfg('smtp_host', '')) !== ''
            && trim((string) Db::cfg('smtp_user', '')) !== ''
            && trim((string) Db::cfg('smtp_pass', '')) !== '';
    }

    public static function send(string $to, string $subject, string $html): void
    {
        $host = trim((string) Db::cfg('smtp_host'));
        $port = (int) Db::cfg('smtp_port', 587);
        $user = trim((string) Db::cfg('smtp_user'));
        $pass = (string) Db::cfg('smtp_pass');
        $from = trim((string) Db::cfg('mail_from', $user));
        $fromName = trim((string) Db::cfg('mail_from_name', 'DeckGen'));

        $fp = @stream_socket_client("tcp://{$host}:{$port}", $errno, $errstr, 15);
        if (!$fp) throw new RuntimeException("SMTP 연결 실패: {$errstr}");
        stream_set_timeout($fp, 15);

        $read = function () use ($fp): string {
            $line = '';
            while (($l = fgets($fp, 515)) !== false) {
                $line = $l;
                if (strlen($l) < 4 || $l[3] !== '-') break; // 멀티라인 응답 끝
            }
            return $line;
        };
        $cmd = function (string $c, array $okCodes) use ($fp, $read): string {
            fwrite($fp, $c . "\r\n");
            $r = $read();
            if (!in_array((int) substr($r, 0, 3), $okCodes, true)) {
                throw new RuntimeException("SMTP 오류 ({$c}): " . trim($r));
            }
            return $r;
        };

        $read(); // 220 배너
        $cmd('EHLO deckgen', [250]);
        $cmd('STARTTLS', [220]);
        if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new RuntimeException('SMTP TLS 협상 실패');
        }
        $cmd('EHLO deckgen', [250]);
        $cmd('AUTH LOGIN', [334]);
        $cmd(base64_encode($user), [334]);
        $cmd(base64_encode($pass), [235]);
        $cmd("MAIL FROM:<{$from}>", [250]);
        $cmd("RCPT TO:<{$to}>", [250, 251]);
        $cmd('DATA', [354]);

        $encSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $encName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
        $headers = implode("\r\n", [
            "From: {$encName} <{$from}>",
            "To: <{$to}>",
            "Subject: {$encSubject}",
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
        ]);
        $body = chunk_split(base64_encode($html));
        $cmd($headers . "\r\n\r\n" . $body . "\r\n.", [250]);
        $cmd('QUIT', [221]);
        fclose($fp);
    }

    /** 공유 초대 메일 — DeckGen Invite Email 템플릿 이식 (table+인라인 스타일) */
    public static function inviteHtml(array $v): string
    {
        $e = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
        $f = "'Pretendard','Apple SD Gothic Neo','Malgun Gothic','Segoe UI',sans-serif";
        $name = $e($v['inviterName']);
        $url = $e($v['inviteUrl']);
        $role = $e($v['roleLabel']);
        return '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>DeckGen 덱 공유 초대</title></head>'
            . '<body style="margin:0;padding:0;background-color:#F0F0EE;">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0F0EE;"><tr><td align="center" style="padding:36px 16px;">'
            . '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;">'
            . '<tr><td style="padding:0 4px 18px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>'
            . '<td style="width:26px;height:26px;background-color:#1A1A1A;border-radius:7px;font-size:0;">&nbsp;</td>'
            . "<td style=\"padding-left:9px;font-family:{$f};font-size:17px;font-weight:700;color:#1A1A1A;\">DeckGen</td></tr></table></td></tr>"
            . '<tr><td style="background-color:#FFFFFF;border:1px solid #E4E4E0;border-radius:16px;padding:36px 36px 32px;">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
            . "<tr><td align=\"center\" style=\"font-family:{$f};font-size:20px;line-height:1.45;font-weight:700;color:#1A1A1A;padding:4px 0 6px;\">{$name}님이 덱에 초대했어요</td></tr>"
            . "<tr><td align=\"center\" style=\"font-family:{$f};font-size:13.5px;line-height:1.65;color:#6B6B66;padding-bottom:24px;\">아래 덱을 함께 작업하도록 요청했습니다.</td></tr>"
            . '<tr><td style="border:1px solid #E4E4E0;border-radius:12px;padding:16px 18px;background-color:#FBFBFA;">'
            . "<div style=\"font-family:{$f};font-size:15px;font-weight:700;color:#1A1A1A;\">" . $e($v['deckTitle']) . '</div>'
            . "<div style=\"font-family:{$f};font-size:12px;color:#8A8A84;padding-top:3px;\">" . $e($v['deckMeta']) . " · 권한: {$role}</div></td></tr>"
            . "<tr><td align=\"center\" style=\"font-family:{$f};font-size:12.5px;line-height:1.65;color:#6B6B66;padding:16px 8px 22px;\">부여된 권한: <b style=\"color:#1A1A1A;\">{$role}</b> — " . $e($v['roleDesc']) . '</td></tr>'
            . '<tr><td align="center" style="padding-bottom:14px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>'
            . "<td align=\"center\" style=\"background-color:#1A1A1A;border-radius:10px;\"><a href=\"{$url}\" target=\"_blank\" style=\"display:inline-block;font-family:{$f};font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;padding:13px 40px;border-radius:10px;\">덱 열기</a></td></tr></table></td></tr>"
            . "<tr><td align=\"center\" style=\"font-family:{$f};font-size:11.5px;line-height:1.7;color:#8A8A84;\">버튼이 열리지 않으면: <a href=\"{$url}\" style=\"color:#55554F;\">{$url}</a></td></tr>"
            . '</table></td></tr>'
            . "<tr><td align=\"center\" style=\"padding:22px 8px 0;font-family:{$f};font-size:11px;line-height:1.8;color:#9C9C96;\">이 메일은 " . $e($v['recipientEmail']) . ' 주소로 발송된 DeckGen 공유 초대 메일입니다.<br>본인이 요청하지 않았다면 무시하셔도 됩니다.</td></tr>'
            . '</table></td></tr></table></body></html>';
    }

    public static function verificationHtml(string $code): string
    {
        return '<div style="font-family:Pretendard,Apple SD Gothic Neo,sans-serif;max-width:420px;margin:0 auto;padding:32px 24px;border:1px solid #E4E4E0;border-radius:16px">'
            . '<p style="font-size:15px;font-weight:700;margin:0 0 4px">DeckGen 이메일 인증</p>'
            . '<p style="font-size:13px;color:#6B6B66;margin:0 0 20px">아래 6자리 인증 코드를 입력해 주세요. 유효시간은 10분입니다.</p>'
            . '<p style="font-size:32px;font-weight:800;letter-spacing:8px;text-align:center;margin:0;padding:16px;background:#F7F7F5;border-radius:12px">' . $code . '</p>'
            . '<p style="font-size:11.5px;color:#9B9B96;margin:20px 0 0">본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.</p></div>';
    }
}
