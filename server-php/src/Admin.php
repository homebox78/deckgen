<?php
/** §14 관리자 콘솔 API — Node routes/admin.ts와 동일 계약 (MySQL) */
final class Admin
{
    // ── 공용 ──
    private static function body(): array
    {
        $j = json_decode(file_get_contents('php://input'), true);
        return is_array($j) ? $j : [];
    }

    private static function json($data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
    }

    private static function ensureTables(): void
    {
        static $done = false;
        if ($done) return;
        $done = true;
        $pdo = Db::pdo();
        $pdo->exec('CREATE TABLE IF NOT EXISTS app_settings (k VARCHAR(64) PRIMARY KEY, v TEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
        $pdo->exec('CREATE TABLE IF NOT EXISTS banners (id VARCHAR(16) PRIMARY KEY, type VARCHAR(8) NOT NULL, text TEXT NOT NULL, `on` TINYINT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
        $pdo->exec('CREATE TABLE IF NOT EXISTS templates (id VARCHAR(40) PRIMARY KEY, name VARCHAR(80) NOT NULL, `on` TINYINT NOT NULL DEFAULT 1, pro TINYINT NOT NULL DEFAULT 0, uses INT NOT NULL DEFAULT 0, ord INT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
        $pdo->exec('CREATE TABLE IF NOT EXISTS events (id INT AUTO_INCREMENT PRIMARY KEY, ts BIGINT NOT NULL, kind VARCHAR(12) NOT NULL, ok TINYINT NOT NULL, ms INT NOT NULL, meta VARCHAR(120), err VARCHAR(80), KEY idx_ts (ts)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
        $pdo->exec('CREATE TABLE IF NOT EXISTS error_groups (id VARCHAR(16) PRIMARY KEY, type VARCHAR(80) NOT NULL, msg TEXT, count INT NOT NULL DEFAULT 1, last_at BIGINT NOT NULL, resolved TINYINT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
        $pdo->exec('CREATE TABLE IF NOT EXISTS audit_log (id INT AUTO_INCREMENT PRIMARY KEY, ts BIGINT NOT NULL, actor VARCHAR(40) NOT NULL, cat VARCHAR(16) NOT NULL, action VARCHAR(48) NOT NULL, detail TEXT, ip VARCHAR(48)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
        $pdo->exec('CREATE TABLE IF NOT EXISTS admin_sessions (token VARCHAR(64) PRIMARY KEY, expires_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
        $pdo->exec('CREATE TABLE IF NOT EXISTS blocked_users (name VARCHAR(60) PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    }

    // ── 설정 ──
    public static function settingsGetAll(): array
    {
        self::ensureTables();
        $defaults = ['signupAllowed' => true, 'freeDailyLimit' => 20, 'maintenance' => false, 'genModel' => ''];
        $rows = Db::pdo()->query('SELECT k, v FROM app_settings')->fetchAll();
        foreach ($rows as $r) {
            if (array_key_exists($r['k'], $defaults)) $defaults[$r['k']] = json_decode($r['v'], true);
        }
        return $defaults;
    }

    public static function isMaintenance(): bool
    {
        try { return (bool) (self::settingsGetAll()['maintenance'] ?? false); } catch (Throwable $e) { return false; }
    }

    public static function dailyLimit(): int
    {
        try { return (int) (self::settingsGetAll()['freeDailyLimit'] ?? 20); } catch (Throwable $e) { return 20; }
    }

    public static function genModelOverride(): string
    {
        try { return trim((string) (self::settingsGetAll()['genModel'] ?? '')); } catch (Throwable $e) { return ''; }
    }

    // ── 이벤트/오류 (Ai.php에서 호출) ──
    public static function logEvent(string $kind, bool $ok, int $ms, string $meta = '', string $err = ''): void
    {
        try {
            self::ensureTables();
            $st = Db::pdo()->prepare('INSERT INTO events (ts, kind, ok, ms, meta, err) VALUES (:t, :k, :o, :m, :me, :e)');
            $st->execute([':t' => (int) (microtime(true) * 1000), ':k' => $kind, ':o' => $ok ? 1 : 0, ':m' => $ms, ':me' => mb_substr($meta, 0, 120), ':e' => mb_substr($err, 0, 80)]);
            if (!$ok && $err !== '') self::logError($err, $meta);
        } catch (Throwable $e) { /* 로깅 실패 무시 */ }
    }

    public static function logError(string $type, string $msg): void
    {
        try {
            self::ensureTables();
            $pdo = Db::pdo();
            $st = $pdo->prepare('SELECT id FROM error_groups WHERE type = :t AND resolved = 0 LIMIT 1');
            $st->execute([':t' => $type]);
            $row = $st->fetch();
            $now = (int) (microtime(true) * 1000);
            if ($row) {
                $pdo->prepare('UPDATE error_groups SET count = count + 1, last_at = :n, msg = :m WHERE id = :i')
                    ->execute([':n' => $now, ':m' => mb_substr($msg, 0, 500), ':i' => $row['id']]);
            } else {
                $pdo->prepare('INSERT INTO error_groups (id, type, msg, count, last_at, resolved) VALUES (:i, :t, :m, 1, :n, 0)')
                    ->execute([':i' => substr(bin2hex(random_bytes(8)), 0, 8), ':t' => $type, ':m' => mb_substr($msg, 0, 500), ':n' => $now]);
            }
        } catch (Throwable $e) { /* 무시 */ }
    }

    /** IP당 일일 생성 한도 검사(카운트 증가 포함) — 초과 시 false */
    public static function checkDailyLimit(): bool
    {
        try {
            self::ensureTables();
            $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
            $day = gmdate('Y-m-d');
            $k = "gen:{$day}:{$ip}";
            $pdo = Db::pdo();
            $st = $pdo->prepare('SELECT v FROM app_settings WHERE k = :k');
            $st->execute([':k' => $k]);
            $count = (int) ($st->fetch()['v'] ?? 0);
            if ($count >= self::dailyLimit()) return false;
            $pdo->prepare('INSERT INTO app_settings (k, v) VALUES (:k, :v) ON DUPLICATE KEY UPDATE v = :v2')
                ->execute([':k' => $k, ':v' => (string) ($count + 1), ':v2' => (string) ($count + 1)]);
            return true;
        } catch (Throwable $e) { return true; }
    }

    public static function isBlocked(string $name): bool
    {
        try {
            self::ensureTables();
            $st = Db::pdo()->prepare('SELECT 1 FROM blocked_users WHERE name = :n');
            $st->execute([':n' => $name]);
            return (bool) $st->fetch();
        } catch (Throwable $e) { return false; }
    }

    private static function audit(string $cat, string $action, string $detail): void
    {
        try {
            self::ensureTables();
            Db::pdo()->prepare('INSERT INTO audit_log (ts, actor, cat, action, detail, ip) VALUES (:t, :a, :c, :ac, :d, :i)')
                ->execute([':t' => (int) (microtime(true) * 1000), ':a' => '관리자', ':c' => $cat, ':ac' => $action, ':d' => $detail, ':i' => $_SERVER['REMOTE_ADDR'] ?? '?']);
        } catch (Throwable $e) { /* 무시 */ }
    }

    // ── 인증 ──
    public static function login(): void
    {
        self::ensureTables();
        $b = self::body();
        $email = strtolower(trim((string) ($b['email'] ?? '')));
        $pw = (string) ($b['password'] ?? '');
        $admEmail = strtolower(trim((string) Db::cfg('admin_email', '')));
        $admPw = (string) Db::cfg('admin_password', '');
        if ($admEmail === '' || $admPw === '') { self::json(['error' => '관리자 계정이 설정되지 않았습니다.'], 503); return; }
        if ($email !== $admEmail || !hash_equals($admPw, $pw)) { self::json(['error' => '이메일 또는 비밀번호가 올바르지 않습니다.'], 401); return; }

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $exp = (int) (microtime(true) * 1000) + 10 * 60_000;
        Db::pdo()->prepare('INSERT INTO app_settings (k, v) VALUES (:k, :v) ON DUPLICATE KEY UPDATE v = :v2')
            ->execute([':k' => 'admin_otp', ':v' => json_encode(['h' => hash('sha256', $code), 'x' => $exp]), ':v2' => json_encode(['h' => hash('sha256', $code), 'x' => $exp])]);
        try {
            Mail::send($admEmail, '[DeckGen Admin] 2단계 인증 코드', Mail::verificationHtml($code));
            $res = ['otpRequired' => true, 'message' => '관리자 이메일로 인증 코드를 발송했습니다.'];
            if ((bool) Db::cfg('auth_debug', false)) $res['debugCode'] = $code;
            self::json($res);
        } catch (Throwable $e) {
            self::json(['error' => '인증 메일 발송에 실패했습니다.'], 502);
        }
    }

    public static function verify(): void
    {
        self::ensureTables();
        $b = self::body();
        $code = trim((string) ($b['code'] ?? ''));
        $st = Db::pdo()->prepare('SELECT v FROM app_settings WHERE k = :k');
        $st->execute([':k' => 'admin_otp']);
        $otp = json_decode((string) ($st->fetch()['v'] ?? ''), true);
        $now = (int) (microtime(true) * 1000);
        if (!is_array($otp) || $now > (int) $otp['x'] || !hash_equals($otp['h'], hash('sha256', $code))) {
            self::json(['error' => '코드가 올바르지 않거나 만료되었습니다.'], 401);
            return;
        }
        Db::pdo()->prepare('DELETE FROM app_settings WHERE k = :k')->execute([':k' => 'admin_otp']);
        $token = bin2hex(random_bytes(24));
        Db::pdo()->prepare('INSERT INTO admin_sessions (token, expires_at) VALUES (:t, :x)')
            ->execute([':t' => $token, ':x' => $now + 12 * 3600_000]);
        self::audit('auth', 'admin.login', '2FA 통과 · 세션 발급');
        self::json(['token' => $token]);
    }

    /** Bearer 토큰 검증 — 실패 시 401 응답 후 exit */
    public static function requireAuth(): void
    {
        self::ensureTables();
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        $token = str_starts_with($auth, 'Bearer ') ? substr($auth, 7) : '';
        $st = Db::pdo()->prepare('SELECT expires_at FROM admin_sessions WHERE token = :t');
        $st->execute([':t' => $token]);
        $row = $st->fetch();
        if (!$row || (int) (microtime(true) * 1000) > (int) $row['expires_at']) {
            self::json(['error' => '관리자 인증이 필요합니다.'], 401);
            exit;
        }
    }

    // ── 페이지 데이터 ──
    public static function metrics(): void
    {
        self::ensureTables();
        $pdo = Db::pdo();
        $now = (int) (microtime(true) * 1000);
        $dayStart = strtotime(gmdate('Y-m-d')) * 1000;

        $q = fn (string $sql, array $p = []) => (function () use ($pdo, $sql, $p) { $st = $pdo->prepare($sql); $st->execute($p); return $st; })();
        $todayGens = (int) $q('SELECT COUNT(*) c FROM events WHERE kind = "slides" AND ts >= :d', [':d' => $dayStart])->fetch()['c'];
        $failed = (int) $q('SELECT COUNT(*) c FROM events WHERE ok = 0 AND ts >= :d', [':d' => $dayStart])->fetch()['c'];
        $exportsToday = (int) $q('SELECT COUNT(*) c FROM events WHERE kind = "export" AND ts >= :d', [':d' => $dayStart])->fetch()['c'];
        $avgMs = (int) ($q('SELECT AVG(ms) a FROM events WHERE kind = "slides" AND ts >= :d', [':d' => $dayStart])->fetch()['a'] ?? 0);
        $decks = (int) $pdo->query('SELECT COUNT(*) c FROM decks')->fetch()['c'];

        $daily = [];
        for ($i = 13; $i >= 0; $i--) {
            $d0 = strtotime(gmdate('Y-m-d')) * 1000 - $i * 86400_000;
            $d1 = $d0 + 86400_000;
            $c = (int) $q('SELECT COUNT(*) c FROM events WHERE kind = "slides" AND ts >= :a AND ts < :b', [':a' => $d0, ':b' => $d1])->fetch()['c'];
            $daily[] = ['day' => gmdate('m-d', (int) ($d0 / 1000)), 'count' => $c];
        }
        $avgBy = fn (string $k) => (int) ($q('SELECT AVG(ms) a FROM events WHERE kind = :k AND ok = 1', [':k' => $k])->fetch()['a'] ?? 0);
        // 테마 사용 비율 (덱 json 파싱)
        $themeCounts = [];
        foreach ($pdo->query('SELECT json FROM decks')->fetchAll() as $row) {
            $d = json_decode((string) $row['json'], true);
            $t = is_array($d) ? (string) ($d['themeId'] ?? '') : '';
            if ($t !== '') $themeCounts[$t] = ($themeCounts[$t] ?? 0) + 1;
        }
        arsort($themeCounts);
        $themeDist = array_map(fn ($k, $v) => ['themeId' => $k, 'count' => $v], array_keys($themeCounts), array_values($themeCounts));
        self::json([
            'kpis' => ['todayGens' => $todayGens, 'failRate' => $todayGens ? (int) round($failed / max(1, $todayGens) * 100) : 0, 'sharedDecks' => $decks, 'exportsToday' => $exportsToday, 'avgGenMs' => $avgMs],
            'themeDist' => $themeDist,
            'daily' => $daily,
            'pipeline' => [
                ['name' => '아웃라인 생성', 'ms' => $avgBy('outline')],
                ['name' => '슬라이드 생성', 'ms' => $avgBy('slides')],
                ['name' => 'AI 수정/재생성', 'ms' => $avgBy('edit')],
                ['name' => '내보내기', 'ms' => $avgBy('export')],
            ],
        ]);
    }

    public static function users(): void
    {
        self::ensureTables();
        // 최근 24시간 프레즌스 기록 기준
        $rows = Db::pdo()->query('SELECT name, COUNT(DISTINCT deck_id) decks, MAX(ts) last FROM presence GROUP BY name ORDER BY last DESC LIMIT 100')->fetchAll();
        $blocked = array_column(Db::pdo()->query('SELECT name FROM blocked_users')->fetchAll(), 'name');
        self::json(['users' => array_map(fn ($r) => ['name' => $r['name'], 'decks' => (int) $r['decks'], 'last' => (int) $r['last'], 'blocked' => in_array($r['name'], $blocked, true)], $rows), 'blocked' => $blocked]);
    }

    /** 공유 덱 요약 목록 (덱·공유 관리 페이지). title 컬럼은 utf8mb4 clean */
    public static function decks(): void
    {
        self::ensureTables();
        $rows = Db::pdo()->query('SELECT id, title, json, updated_at FROM decks ORDER BY updated_at DESC LIMIT 300')->fetchAll();
        $out = [];
        foreach ($rows as $r) {
            $d = json_decode((string) $r['json'], true);
            $slides = (is_array($d) && is_array($d['slides'] ?? null)) ? count($d['slides']) : 0;
            $title = ($r['title'] !== null && $r['title'] !== '') ? (string) $r['title'] : (string) (is_array($d) ? ($d['title'] ?? '(제목 없음)') : '(제목 없음)');
            $out[] = ['id' => (string) $r['id'], 'title' => $title, 'slides' => $slides, 'updatedAt' => (int) $r['updated_at']];
        }
        self::json(['decks' => $out]);
    }

    public static function blockUser(): void
    {
        self::ensureTables();
        $b = self::body();
        $name = trim((string) ($b['name'] ?? ''));
        if ($name === '') { self::json(['error' => 'name이 필요합니다.'], 400); return; }
        if (!empty($b['blocked'])) {
            Db::pdo()->prepare('INSERT IGNORE INTO blocked_users (name) VALUES (:n)')->execute([':n' => $name]);
            self::audit('user', 'user.block', $name);
        } else {
            Db::pdo()->prepare('DELETE FROM blocked_users WHERE name = :n')->execute([':n' => $name]);
            self::audit('user', 'user.unblock', $name);
        }
        self::json(['ok' => true]);
    }

    public static function jobs(): void
    {
        self::ensureTables();
        $rows = Db::pdo()->query('SELECT id, ts, kind, ok, ms, meta, err FROM events ORDER BY id DESC LIMIT 60')->fetchAll();
        self::json(['jobs' => array_map(fn ($r) => ['id' => 'E-' . str_pad((string) $r['id'], 4, '0', STR_PAD_LEFT), 'kind' => $r['kind'], 'meta' => (string) $r['meta'], 'ms' => (int) $r['ms'], 'ok' => (bool) $r['ok'], 'err' => (string) $r['err'], 'ts' => (int) $r['ts']], $rows)]);
    }

    public static function errors(): void
    {
        self::ensureTables();
        $rows = Db::pdo()->query('SELECT id, type, msg, count, last_at FROM error_groups WHERE resolved = 0 ORDER BY last_at DESC LIMIT 100')->fetchAll();
        self::json(['errors' => array_map(fn ($r) => ['id' => $r['id'], 'type' => $r['type'], 'msg' => (string) $r['msg'], 'count' => (int) $r['count'], 'lastAt' => (int) $r['last_at']], $rows)]);
    }

    public static function resolveError(string $id): void
    {
        self::ensureTables();
        Db::pdo()->prepare('UPDATE error_groups SET resolved = 1 WHERE id = :i')->execute([':i' => $id]);
        self::audit('data', 'error.resolve', $id);
        self::json(['ok' => true]);
    }

    public static function auditLogs(): void
    {
        self::ensureTables();
        $rows = Db::pdo()->query('SELECT ts, actor, cat, action, detail, ip FROM audit_log ORDER BY id DESC LIMIT 500')->fetchAll();
        self::json(['logs' => array_map(fn ($r) => ['ts' => (int) $r['ts'], 'actor' => $r['actor'], 'cat' => $r['cat'], 'action' => $r['action'], 'detail' => (string) $r['detail'], 'ip' => (string) $r['ip']], $rows)]);
    }

    // ── 배너 ──
    public static function bannersAll(bool $activeOnly = false): array
    {
        self::ensureTables();
        $sql = 'SELECT id, type, text, `on`, created_at FROM banners' . ($activeOnly ? ' WHERE `on` = 1' : '') . ' ORDER BY created_at DESC';
        return array_map(fn ($r) => ['id' => $r['id'], 'type' => $r['type'], 'text' => $r['text'], 'on' => (bool) $r['on'], 'createdAt' => (int) $r['created_at']], Db::pdo()->query($sql)->fetchAll());
    }

    public static function bannersGet(): void { self::json(['banners' => self::bannersAll()]); }
    public static function bannersPublic(): void { self::json(['banners' => self::bannersAll(true)]); }

    public static function bannersAdd(): void
    {
        self::ensureTables();
        $b = self::body();
        $text = trim((string) ($b['text'] ?? ''));
        if ($text === '') { self::json(['error' => '공지 문구가 필요합니다.'], 400); return; }
        $type = in_array($b['type'] ?? '', ['warn', 'maint'], true) ? $b['type'] : 'info';
        $id = substr(bin2hex(random_bytes(4)), 0, 8);
        Db::pdo()->prepare('INSERT INTO banners (id, type, text, `on`, created_at) VALUES (:i, :t, :x, 1, :c)')
            ->execute([':i' => $id, ':t' => $type, ':x' => $text, ':c' => (int) (microtime(true) * 1000)]);
        self::audit('banner', 'banner.publish', mb_substr($text, 0, 60));
        self::json(['banner' => ['id' => $id, 'type' => $type, 'text' => $text, 'on' => true, 'createdAt' => (int) (microtime(true) * 1000)]]);
    }

    public static function bannersPatch(string $id): void
    {
        self::ensureTables();
        $on = !empty(self::body()['on']) ? 1 : 0;
        Db::pdo()->prepare('UPDATE banners SET `on` = :o WHERE id = :i')->execute([':o' => $on, ':i' => $id]);
        self::audit('banner', $on ? 'banner.on' : 'banner.off', $id);
        self::json(['ok' => true]);
    }

    public static function bannersDelete(string $id): void
    {
        self::ensureTables();
        Db::pdo()->prepare('DELETE FROM banners WHERE id = :i')->execute([':i' => $id]);
        self::audit('banner', 'banner.delete', $id);
        self::json(['ok' => true]);
    }

    // ── 템플릿 ──
    public static function templatesRows(): array
    {
        self::ensureTables();
        return array_map(fn ($r) => ['id' => $r['id'], 'name' => $r['name'], 'on' => (bool) $r['on'], 'pro' => (bool) $r['pro'], 'uses' => (int) $r['uses']], Db::pdo()->query('SELECT id, name, `on`, pro, uses FROM templates ORDER BY ord')->fetchAll());
    }

    public static function templatesGet(): void { self::json(['templates' => self::templatesRows()]); }
    public static function templatesPublic(): void { self::json(['templates' => self::templatesRows()]); }

    public static function templatesPut(): void
    {
        self::ensureTables();
        $list = self::body()['templates'] ?? null;
        if (!is_array($list)) { self::json(['error' => 'templates 배열이 필요합니다.'], 400); return; }
        $pdo = Db::pdo();
        $pdo->exec('DELETE FROM templates');
        $st = $pdo->prepare('INSERT INTO templates (id, name, `on`, pro, uses, ord) VALUES (:i, :n, :o, :p, :u, :r)');
        foreach (array_values($list) as $i => $t) {
            $st->execute([':i' => mb_substr((string) ($t['id'] ?? ''), 0, 40), ':n' => mb_substr((string) ($t['name'] ?? ''), 0, 80), ':o' => !empty($t['on']) ? 1 : 0, ':p' => !empty($t['pro']) ? 1 : 0, ':u' => (int) ($t['uses'] ?? 0), ':r' => $i]);
        }
        self::audit('template', 'templates.update', count($list) . '개 항목');
        self::json(['ok' => true]);
    }

    public static function templateUse(string $id): void
    {
        self::ensureTables();
        Db::pdo()->prepare('UPDATE templates SET uses = uses + 1 WHERE id = :i')->execute([':i' => $id]);
        self::json(['ok' => true]);
    }

    // ── 설정 ──
    public static function settingsGet(): void { self::json(['settings' => self::settingsGetAll()]); }

    public static function settingsPatch(): void
    {
        self::ensureTables();
        $b = self::body();
        $allowed = [];
        if (isset($b['signupAllowed']) && is_bool($b['signupAllowed'])) $allowed['signupAllowed'] = $b['signupAllowed'];
        if (isset($b['freeDailyLimit']) && is_numeric($b['freeDailyLimit'])) $allowed['freeDailyLimit'] = max(1, min(500, (int) $b['freeDailyLimit']));
        if (isset($b['maintenance']) && is_bool($b['maintenance'])) $allowed['maintenance'] = $b['maintenance'];
        if (isset($b['genModel']) && is_string($b['genModel'])) $allowed['genModel'] = trim($b['genModel']);
        $st = Db::pdo()->prepare('INSERT INTO app_settings (k, v) VALUES (:k, :v) ON DUPLICATE KEY UPDATE v = :v2');
        foreach ($allowed as $k => $v) $st->execute([':k' => $k, ':v' => json_encode($v), ':v2' => json_encode($v)]);
        self::audit('settings', 'settings.update', json_encode($allowed, JSON_UNESCAPED_UNICODE));
        self::json(['settings' => self::settingsGetAll()]);
    }

    // ── 클라이언트 track ──
    public static function track(): void
    {
        $b = self::body();
        $kind = (string) ($b['kind'] ?? '');
        if (in_array($kind, ['export', 'import'], true)) {
            self::logEvent($kind, ($b['ok'] ?? true) !== false, max(0, (int) ($b['ms'] ?? 0)), (string) ($b['meta'] ?? ''));
        }
        self::json(['ok' => true]);
    }
}
