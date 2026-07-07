<?php
/** 이메일 인증 (OTP 6자리) — auth_codes 테이블 (Node in-memory와 동일 계약) */
final class Auth
{
    private static function ensureTable(): void
    {
        Db::pdo()->exec(
            'CREATE TABLE IF NOT EXISTS auth_codes (
                email VARCHAR(190) PRIMARY KEY,
                code_hash VARCHAR(64) NOT NULL,
                expires_at BIGINT NOT NULL,
                attempts INT NOT NULL DEFAULT 0,
                sent_at BIGINT NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );
    }

    private static function body(): array
    {
        $j = json_decode(file_get_contents('php://input'), true);
        return is_array($j) ? $j : [];
    }

    private static function json(array $data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
    }

    // POST /auth/send-code { email }
    public static function sendCode(): void
    {
        $email = strtolower(trim((string) (self::body()['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            self::json(['error' => '유효한 이메일이 필요합니다.'], 400);
            return;
        }
        if (!Mail::configured()) {
            self::json(['error' => '메일 발송이 설정되지 않았습니다 (config.php smtp_*).'], 503);
            return;
        }
        self::ensureTable();
        $pdo = Db::pdo();
        $now = (int) (microtime(true) * 1000);

        $st = $pdo->prepare('SELECT sent_at FROM auth_codes WHERE email = :e');
        $st->execute([':e' => $email]);
        $row = $st->fetch();
        if ($row && $now - (int) $row['sent_at'] < 60_000) {
            self::json(['error' => '잠시 후 다시 요청해주세요 (1분 간격).'], 429);
            return;
        }

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $up = $pdo->prepare(
            'INSERT INTO auth_codes (email, code_hash, expires_at, attempts, sent_at)
             VALUES (:e, :h, :x, 0, :s)
             ON DUPLICATE KEY UPDATE code_hash = :h2, expires_at = :x2, attempts = 0, sent_at = :s2'
        );
        $hash = hash('sha256', $code);
        $exp = $now + 10 * 60_000;
        $up->execute([':e' => $email, ':h' => $hash, ':x' => $exp, ':s' => $now, ':h2' => $hash, ':x2' => $exp, ':s2' => $now]);

        try {
            Mail::send($email, '[DeckGen] 이메일 인증 코드', Mail::verificationHtml($code));
            self::json(['ok' => true, 'message' => '인증 코드를 발송했습니다. 메일함을 확인해주세요.']);
        } catch (Throwable $e) {
            $pdo->prepare('DELETE FROM auth_codes WHERE email = :e')->execute([':e' => $email]);
            self::json(['error' => '메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.'], 502);
        }
    }

    // POST /auth/verify { email, code }
    public static function verify(): void
    {
        $b = self::body();
        $email = strtolower(trim((string) ($b['email'] ?? '')));
        $code = trim((string) ($b['code'] ?? ''));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^\d{6}$/', $code)) {
            self::json(['error' => '이메일과 6자리 코드가 필요합니다.'], 400);
            return;
        }
        self::ensureTable();
        $pdo = Db::pdo();
        $now = (int) (microtime(true) * 1000);

        $st = $pdo->prepare('SELECT code_hash, expires_at, attempts FROM auth_codes WHERE email = :e');
        $st->execute([':e' => $email]);
        $row = $st->fetch();
        if (!$row || $now > (int) $row['expires_at']) {
            $pdo->prepare('DELETE FROM auth_codes WHERE email = :e')->execute([':e' => $email]);
            self::json(['error' => '코드가 만료되었습니다. 다시 요청해주세요.'], 400);
            return;
        }
        if ((int) $row['attempts'] >= 5) {
            $pdo->prepare('DELETE FROM auth_codes WHERE email = :e')->execute([':e' => $email]);
            self::json(['error' => '시도 횟수를 초과했습니다. 다시 요청해주세요.'], 429);
            return;
        }
        $pdo->prepare('UPDATE auth_codes SET attempts = attempts + 1 WHERE email = :e')->execute([':e' => $email]);
        if (!hash_equals($row['code_hash'], hash('sha256', $code))) {
            self::json(['error' => '코드가 일치하지 않습니다.'], 400);
            return;
        }
        $pdo->prepare('DELETE FROM auth_codes WHERE email = :e')->execute([':e' => $email]);
        self::json(['ok' => true, 'email' => $email, 'verifiedAt' => $now]);
    }
}
