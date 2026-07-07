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

    public static function verificationHtml(string $code): string
    {
        return '<div style="font-family:Pretendard,Apple SD Gothic Neo,sans-serif;max-width:420px;margin:0 auto;padding:32px 24px;border:1px solid #E4E4E0;border-radius:16px">'
            . '<p style="font-size:15px;font-weight:700;margin:0 0 4px">DeckGen 이메일 인증</p>'
            . '<p style="font-size:13px;color:#6B6B66;margin:0 0 20px">아래 6자리 인증 코드를 입력해 주세요. 유효시간은 10분입니다.</p>'
            . '<p style="font-size:32px;font-weight:800;letter-spacing:8px;text-align:center;margin:0;padding:16px;background:#F7F7F5;border-radius:12px">' . $code . '</p>'
            . '<p style="font-size:11.5px;color:#9B9B96;margin:20px 0 0">본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.</p></div>';
    }
}
