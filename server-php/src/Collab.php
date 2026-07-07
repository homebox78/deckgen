<?php
/** §12 공유·협업 — 슬라이드 단위 LWW + deck_updates 로그 + SSE(DB 폴링) 프레즌스 */
final class Collab
{
    private static function json(int $code, array $body): void
    {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($body, JSON_UNESCAPED_UNICODE);
        exit;
    }

    private static function body(): array
    {
        $raw = file_get_contents('php://input');
        $j = json_decode($raw, true);
        return is_array($j) ? $j : [];
    }

    private static function validDeck($deck): bool
    {
        return is_array($deck)
            && is_string($deck['id'] ?? null) && $deck['id'] !== '' && strlen($deck['id']) <= 64
            && is_array($deck['slides'] ?? null) && count($deck['slides']) >= 1 && count($deck['slides']) <= 60
            && in_array($deck['aspect'] ?? '', ['16:9', '4:3', '4:5'], true);
    }

    /** @return array{rec: array, role: string}|null */
    private static function byToken(string $token): ?array
    {
        $st = Db::pdo()->prepare('SELECT * FROM decks WHERE edit_token = :a OR view_token = :b LIMIT 1');
        $st->execute([':a' => $token, ':b' => $token]);
        $rec = $st->fetch();
        if (!$rec) return null;
        return ['rec' => $rec, 'role' => $rec['edit_token'] === $token ? 'edit' : 'view'];
    }

    private static function requireRole(string $deckId, string $token, string $need): ?array
    {
        if ($token === '') return null;
        $st = Db::pdo()->prepare('SELECT * FROM decks WHERE id = :id LIMIT 1');
        $st->execute([':id' => $deckId]);
        $rec = $st->fetch();
        if (!$rec) return null;
        if ($rec['edit_token'] === $token) return $rec;
        if ($need === 'view' && $rec['view_token'] === $token) return $rec;
        return null;
    }

    private static function logUpdate(string $deckId, int $rev, string $kind, string $origin, string $payload): void
    {
        $pdo = Db::pdo();
        $st = $pdo->prepare(
            'INSERT INTO deck_updates (deck_id, rev, kind, origin, payload, created_at) VALUES (:d, :r, :k, :o, :p, :t)'
        );
        $st->execute([':d' => $deckId, ':r' => $rev, ':k' => $kind, ':o' => $origin, ':p' => $payload, ':t' => (int) (microtime(true) * 1000)]);
        // 로그 200건 유지
        $pdo->prepare('DELETE FROM deck_updates WHERE deck_id = :d AND id < (
            SELECT mid FROM (SELECT MIN(id) AS mid FROM (
                SELECT id FROM deck_updates WHERE deck_id = :d2 ORDER BY id DESC LIMIT 200
            ) t) t2)')->execute([':d' => $deckId, ':d2' => $deckId]);
    }

    // ── POST /share ──
    public static function share(): void
    {
        $deck = self::body()['deck'] ?? null;
        if (!self::validDeck($deck)) self::json(400, ['error' => '유효한 deck이 필요합니다.']);
        $pdo = Db::pdo();
        $st = $pdo->prepare('SELECT * FROM decks WHERE id = :id');
        $st->execute([':id' => $deck['id']]);
        $prev = $st->fetch();
        $edit = $prev ? $prev['edit_token'] : rtrim(strtr(base64_encode(random_bytes(9)), '+/', '-_'), '=');
        $view = $prev ? $prev['view_token'] : rtrim(strtr(base64_encode(random_bytes(9)), '+/', '-_'), '=');
        $rev = $prev ? ((int) $prev['rev'] + 1) : 1;
        $up = $pdo->prepare(
            'INSERT INTO decks (id, title, json, rev, edit_token, view_token, updated_at)
             VALUES (:id, :title, :json, :rev, :e, :v, :t)
             ON DUPLICATE KEY UPDATE title = VALUES(title), json = VALUES(json), rev = VALUES(rev), updated_at = VALUES(updated_at)'
        );
        $up->execute([
            ':id' => $deck['id'], ':title' => (string) ($deck['title'] ?? ''),
            ':json' => json_encode($deck, JSON_UNESCAPED_UNICODE),
            ':rev' => $rev, ':e' => $edit, ':v' => $view, ':t' => (int) (microtime(true) * 1000),
        ]);
        self::json(200, ['editToken' => $edit, 'viewToken' => $view, 'rev' => $rev]);
    }

    // ── GET /share/{token} ──
    public static function resolve(string $token): void
    {
        $hit = self::byToken($token);
        if (!$hit) self::json(404, ['error' => '존재하지 않거나 만료된 공유 링크입니다.']);
        self::json(200, [
            'deck' => json_decode($hit['rec']['json'], true),
            'rev' => (int) $hit['rec']['rev'],
            'role' => $hit['role'],
            'deckId' => $hit['rec']['id'],
        ]);
    }

    // ── POST /collab/{id}/slide ──
    public static function pushSlide(string $deckId): void
    {
        $b = self::body();
        $slide = $b['slide'] ?? null;
        if (!is_array($slide) || !is_string($slide['id'] ?? null)) self::json(400, ['error' => '유효하지 않은 요청입니다.']);
        $rec = self::requireRole($deckId, (string) ($b['token'] ?? ''), 'edit');
        if (!$rec) self::json(403, ['error' => '편집 권한이 없습니다.']);
        $deck = json_decode($rec['json'], true);
        $found = false;
        foreach ($deck['slides'] as $i => $s) {
            if (($s['id'] ?? '') === $slide['id']) { $deck['slides'][$i] = $slide; $found = true; break; }
        }
        if (!$found) self::json(409, ['error' => '슬라이드를 찾을 수 없습니다 (구조 변경됨).']);
        $rev = (int) $rec['rev'] + 1;
        $deck['updatedAt'] = (int) (microtime(true) * 1000);
        Db::pdo()->prepare('UPDATE decks SET json = :j, rev = :r, updated_at = :t WHERE id = :id')
            ->execute([':j' => json_encode($deck, JSON_UNESCAPED_UNICODE), ':r' => $rev, ':t' => $deck['updatedAt'], ':id' => $deckId]);
        self::logUpdate($deckId, $rev, 'slide', (string) ($b['clientId'] ?? ''), json_encode($slide, JSON_UNESCAPED_UNICODE));
        self::json(200, ['rev' => $rev]);
    }

    // ── POST /collab/{id}/deck ──
    public static function pushDeck(string $deckId): void
    {
        $b = self::body();
        $deck = $b['deck'] ?? null;
        if (!self::validDeck($deck) || $deck['id'] !== $deckId) self::json(400, ['error' => '유효하지 않은 요청입니다.']);
        $rec = self::requireRole($deckId, (string) ($b['token'] ?? ''), 'edit');
        if (!$rec) self::json(403, ['error' => '편집 권한이 없습니다.']);
        $rev = (int) $rec['rev'] + 1;
        Db::pdo()->prepare('UPDATE decks SET title = :ti, json = :j, rev = :r, updated_at = :t WHERE id = :id')
            ->execute([
                ':ti' => (string) ($deck['title'] ?? ''),
                ':j' => json_encode($deck, JSON_UNESCAPED_UNICODE),
                ':r' => $rev, ':t' => (int) (microtime(true) * 1000), ':id' => $deckId,
            ]);
        self::logUpdate($deckId, $rev, 'deck', (string) ($b['clientId'] ?? ''), json_encode($deck, JSON_UNESCAPED_UNICODE));
        self::json(200, ['rev' => $rev]);
    }

    // ── POST /share/invite — 이메일 초대 (Invite Email 템플릿) ──
    public static function invite(): void
    {
        $b = self::body();
        $deckId = (string) ($b['deckId'] ?? '');
        $email = strtolower(trim((string) ($b['email'] ?? '')));
        $role = ($b['role'] ?? '') === 'edit' ? 'edit' : 'view';
        $inviter = mb_substr(trim((string) ($b['inviterName'] ?? '게스트')), 0, 40) ?: '게스트';
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) self::json(400, ['error' => '유효한 이메일이 필요합니다.']);
        $rec = self::requireRole($deckId, (string) ($b['token'] ?? ''), 'edit');
        if (!$rec) self::json(403, ['error' => '초대 권한이 없습니다.']);
        if (!Mail::configured()) self::json(503, ['error' => '메일 발송이 설정되지 않았습니다.']);
        $base = rtrim(trim((string) Db::cfg('public_base_url', '')), '/');
        if ($base === '') self::json(503, ['error' => 'public_base_url이 설정되지 않았습니다.']);
        $deck = json_decode((string) $rec['json'], true);
        $token = $role === 'edit' ? $rec['edit_token'] : $rec['view_token'];
        try {
            Mail::send($email, "[DeckGen] {$inviter}님이 '" . ($deck['title'] ?? '덱') . "' 덱에 초대했어요", Mail::inviteHtml([
                'inviterName' => $inviter,
                'deckTitle' => (string) ($deck['title'] ?? '덱'),
                'roleLabel' => $role === 'edit' ? '편집 가능' : '보기 전용',
                'roleDesc' => $role === 'edit' ? '아웃라인·슬라이드를 수정하고 실시간 공동 편집할 수 있어요.' : '열람과 PPTX 다운로드만 가능해요.',
                'inviteUrl' => $base . '/s/' . $token,
                'deckMeta' => count($deck['slides'] ?? []) . '장 · DeckGen',
                'recipientEmail' => $email,
            ]));
            Admin::logEvent('export', true, 0, "초대 메일 · {$email} · {$role}");
            self::json(200, ['ok' => true, 'message' => "{$email}로 초대 메일을 보냈어요."]);
        } catch (Throwable $e) {
            self::json(502, ['error' => '초대 메일 발송에 실패했습니다.']);
        }
    }

    // ── POST /collab/{id}/presence ──
    public static function presence(string $deckId): void
    {
        $b = self::body();
        if (!self::requireRole($deckId, (string) ($b['token'] ?? ''), 'view')) self::json(403, ['error' => '권한이 없습니다.']);
        if (Admin::isBlocked(mb_substr((string) ($b['name'] ?? ''), 0, 40))) self::json(403, ['error' => '차단된 사용자입니다. 관리자에게 문의하세요.']);
        $cursor = is_array($b['cursor'] ?? null) ? json_encode(['x' => (int) $b['cursor']['x'], 'y' => (int) $b['cursor']['y']]) : null;
        if ($cursor !== null && ($b['clientId'] ?? '') !== '') {
            Db::pdo()->prepare('UPDATE presence SET `cursor` = :c, ts = :t WHERE deck_id = :d AND client_id = :cid')
                ->execute([':c' => $cursor, ':t' => (int) (microtime(true) * 1000), ':d' => $deckId, ':cid' => (string) $b['clientId']]);
        }
        // 선택 중 요소 id — "선택 중" 라벨용 (빈 문자열 = 선택 해제)
        if (($b['clientId'] ?? '') !== '' && array_key_exists('selectedId', $b)) {
            $sel = $b['selectedId'] !== null ? mb_substr((string) $b['selectedId'], 0, 48) : '';
            Db::pdo()->prepare('UPDATE presence SET sel = :s, ts = :t WHERE deck_id = :d AND client_id = :cid')
                ->execute([':s' => $sel, ':t' => (int) (microtime(true) * 1000), ':d' => $deckId, ':cid' => (string) $b['clientId']]);
        }
        self::touchPresence(
            $deckId,
            (string) ($b['clientId'] ?? ''),
            (string) ($b['name'] ?? '게스트'),
            (string) ($b['color'] ?? '#8A8A84'),
            (int) ($b['slideIndex'] ?? 0)
        );
        self::json(200, ['ok' => true]);
    }

    private static function touchPresence(string $deckId, string $cid, string $name, string $color, int $idx): void
    {
        if ($cid === '') return;
        Db::pdo()->prepare(
            'INSERT INTO presence (deck_id, client_id, name, color, slide_index, ts) VALUES (:d, :c, :n, :co, :i, :t)
             ON DUPLICATE KEY UPDATE name = VALUES(name), color = VALUES(color), slide_index = VALUES(slide_index), ts = VALUES(ts)'
        )->execute([':d' => $deckId, ':c' => $cid, ':n' => mb_substr($name, 0, 40), ':co' => substr($color, 0, 16), ':i' => $idx, ':t' => (int) (microtime(true) * 1000)]);
    }

    private static function peers(string $deckId): array
    {
        $now = (int) (microtime(true) * 1000);
        Db::pdo()->prepare('DELETE FROM presence WHERE deck_id = :d AND ts < :t')
            ->execute([':d' => $deckId, ':t' => $now - 30000]);
        $st = Db::pdo()->prepare('SELECT client_id, name, color, slide_index, `cursor`, sel FROM presence WHERE deck_id = :d');
        $st->execute([':d' => $deckId]);
        return array_map(fn ($r) => array_merge([
            'clientId' => $r['client_id'], 'name' => $r['name'],
            'color' => $r['color'], 'slideIndex' => (int) $r['slide_index'],
        ], !empty($r['cursor']) ? ['cursor' => json_decode($r['cursor'], true)] : [],
           !empty($r['sel']) ? ['selectedId' => $r['sel']] : []), $st->fetchAll());
    }

    // ── GET /collab/{id}/events (SSE — 1초 DB 폴링, 110초 후 종료 → EventSource 자동 재접속) ──
    public static function events(string $deckId): void
    {
        $token = (string) ($_GET['token'] ?? '');
        $cid = (string) ($_GET['clientId'] ?? '');
        $rec = self::requireRole($deckId, $token, 'view');
        if (!$rec || $cid === '') self::json(403, ['error' => '권한이 없습니다.']);

        set_time_limit(0);
        ignore_user_abort(false);
        header('Content-Type: text/event-stream; charset=utf-8');
        header('Cache-Control: no-cache');
        header('X-Accel-Buffering: no');
        while (ob_get_level() > 0) ob_end_flush();

        $emit = function (string $event, array $data, ?int $id = null): void {
            if ($id !== null) echo "id: {$id}\n";
            echo "event: {$event}\n";
            echo 'data: ' . json_encode($data, JSON_UNESCAPED_UNICODE) . "\n\n";
            flush();
        };

        self::touchPresence(
            $deckId, $cid,
            (string) ($_GET['name'] ?? '게스트'),
            (string) ($_GET['color'] ?? '#8A8A84'),
            (int) ($_GET['slideIndex'] ?? 0)
        );

        // 재접속 시 Last-Event-ID부터 이어서, 첫 접속은 현재 최신부터
        $lastId = (int) ($_SERVER['HTTP_LAST_EVENT_ID'] ?? 0);
        if ($lastId === 0) {
            $st = Db::pdo()->prepare('SELECT COALESCE(MAX(id),0) m FROM deck_updates WHERE deck_id = :d');
            $st->execute([':d' => $deckId]);
            $lastId = (int) $st->fetch()['m'];
        }

        $emit('hello', ['rev' => (int) $rec['rev'], 'peers' => self::peers($deckId)]);
        $lastPeers = '';

        $start = time();
        while (time() - $start < 110) {
            if (connection_aborted()) break;
            // 업데이트 로그
            $st = Db::pdo()->prepare(
                'SELECT id, rev, kind, origin, payload FROM deck_updates WHERE deck_id = :d AND id > :i ORDER BY id ASC LIMIT 20'
            );
            $st->execute([':d' => $deckId, ':i' => $lastId]);
            foreach ($st->fetchAll() as $u) {
                $lastId = (int) $u['id'];
                $data = ['kind' => $u['kind'], 'rev' => (int) $u['rev'], 'origin' => $u['origin']];
                $data[$u['kind'] === 'slide' ? 'slide' : 'deck'] = json_decode($u['payload'], true);
                $emit('update', $data, $lastId);
            }
            // 프레즌스 (변화 있을 때만)
            $peers = self::peers($deckId);
            $sig = json_encode($peers);
            if ($sig !== $lastPeers) {
                $lastPeers = $sig;
                $emit('presence', ['peers' => $peers]);
            }
            // 자신의 프레즌스 keepalive + ping
            Db::pdo()->prepare('UPDATE presence SET ts = :t WHERE deck_id = :d AND client_id = :c')
                ->execute([':t' => (int) (microtime(true) * 1000), ':d' => $deckId, ':c' => $cid]);
            echo ": ping\n\n";
            flush();
            if (connection_aborted()) break;
            // 커서·선택이 부드럽게 보이도록 300ms 폴링 (라이브 커서)
            usleep(300000);
        }
        // 연결 종료 — EventSource가 자동 재접속하며 프레즌스를 다시 등록한다
        Db::pdo()->prepare('DELETE FROM presence WHERE deck_id = :d AND client_id = :c AND ts < :t')
            ->execute([':d' => $deckId, ':c' => $cid, ':t' => (int) (microtime(true) * 1000) - 25000]);
        exit;
    }
}
