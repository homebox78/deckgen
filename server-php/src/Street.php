<?php
/**
 * 우리동네 칠판 (Street Chalkboard) — DeckGen 공유 서버에 얹은 실시간 협업 API.
 * 같은 MariaDB(deckGen)에 st_ 접두 테이블 사용. 실시간은 DeckGen Collab과 동일한
 * SSE(DB 폴링) 패턴. 인증은 닉네임 세션 토큰(소셜 OAuth는 2차).
 */
final class Street
{
    // ── 유틸 ──
    private static function json(int $code, array $body): void
    {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($body, JSON_UNESCAPED_UNICODE);
        exit;
    }
    private static function body(): array
    {
        $j = json_decode((string) file_get_contents('php://input'), true);
        return is_array($j) ? $j : [];
    }
    private static function now(): int { return (int) (microtime(true) * 1000); }
    private static function token(): string { return rtrim(strtr(base64_encode(random_bytes(18)), '+/', '-_'), '='); }
    private static function bearer(): string
    {
        $h = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        // Apache가 RewriteRule 뒤 Authorization을 $_SERVER에 안 넘길 때가 있어 apache_request_headers 폴백
        if ($h === '' && function_exists('apache_request_headers')) {
            foreach (apache_request_headers() as $k => $v) {
                if (strcasecmp($k, 'Authorization') === 0) { $h = $v; break; }
            }
        }
        if (preg_match('/Bearer\s+(.+)/i', $h, $m)) return trim($m[1]);
        return (string) ($_GET['token'] ?? '');
    }

    // ── 스키마 (st_ 접두, 최초 1회) ──
    private static bool $ready = false;
    public static function ensureSchema(): void
    {
        if (self::$ready) return;
        $pdo = Db::pdo();
        $pdo->exec("CREATE TABLE IF NOT EXISTS st_users (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            nickname VARCHAR(50) NOT NULL,
            cursor_color VARCHAR(20) DEFAULT '#FF5A5A',
            token VARCHAR(64) NOT NULL,
            is_admin TINYINT(1) DEFAULT 0,
            created_at BIGINT NOT NULL,
            last_login_at BIGINT NULL,
            KEY idx_token (token)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $pdo->exec("CREATE TABLE IF NOT EXISTS st_boards (
            id VARCHAR(24) PRIMARY KEY,
            owner_id BIGINT NOT NULL,
            title VARCHAR(100) NOT NULL,
            description TEXT,
            category VARCHAR(16) DEFAULT 'etc',
            visibility VARCHAR(16) DEFAULT 'public',
            bg_type VARCHAR(30) DEFAULT 'green',
            member_count INT DEFAULT 1,
            board_level INT DEFAULT 1,
            region_tag VARCHAR(100),
            street_theme VARCHAR(50) DEFAULT 'default',
            sky_tone VARCHAR(30) DEFAULT 'day',
            signboard_style VARCHAR(20) DEFAULT 'a_board',
            frame_skin VARCHAR(50) DEFAULT '',
            banner_style LONGTEXT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            KEY idx_owner (owner_id), KEY idx_cat (category)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $pdo->exec("CREATE TABLE IF NOT EXISTS st_members (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            board_id VARCHAR(24) NOT NULL,
            user_id BIGINT NOT NULL,
            role VARCHAR(12) DEFAULT 'member',
            grade INT DEFAULT 1,
            joined_at BIGINT NOT NULL,
            UNIQUE KEY uq_member (board_id, user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $pdo->exec("CREATE TABLE IF NOT EXISTS st_elements (
            id VARCHAR(24) PRIMARY KEY,
            board_id VARCHAR(24) NOT NULL,
            author_id BIGINT NOT NULL,
            type VARCHAR(12) NOT NULL,
            data LONGTEXT NOT NULL,
            z_index INT DEFAULT 0,
            created_at BIGINT NOT NULL,
            deleted_at BIGINT NULL,
            KEY idx_board (board_id, deleted_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $pdo->exec("CREATE TABLE IF NOT EXISTS st_events (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            board_id VARCHAR(24) NOT NULL,
            kind VARCHAR(16) NOT NULL,
            origin VARCHAR(64) NOT NULL,
            payload LONGTEXT NOT NULL,
            created_at BIGINT NOT NULL,
            KEY idx_board (board_id, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $pdo->exec("CREATE TABLE IF NOT EXISTS st_presence (
            board_id VARCHAR(24) NOT NULL,
            client_id VARCHAR(64) NOT NULL,
            user_id BIGINT NULL,
            name VARCHAR(50) NOT NULL,
            color VARCHAR(20) NOT NULL,
            cx INT NULL, cy INT NULL,
            ts BIGINT NOT NULL,
            PRIMARY KEY (board_id, client_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $pdo->exec("CREATE TABLE IF NOT EXISTS st_invites (
            code VARCHAR(24) PRIMARY KEY,
            board_id VARCHAR(24) NOT NULL,
            created_by BIGINT NULL,
            expires_at BIGINT NULL,
            created_at BIGINT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $pdo->exec("CREATE TABLE IF NOT EXISTS st_banned_words (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            word VARCHAR(100) NOT NULL,
            category VARCHAR(12) DEFAULT 'etc',
            severity VARCHAR(12) DEFAULT 'block',
            is_active TINYINT(1) DEFAULT 1,
            created_at BIGINT NOT NULL,
            UNIQUE KEY uq_word (word)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $pdo->exec("CREATE TABLE IF NOT EXISTS st_reports (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            board_id VARCHAR(24) NOT NULL,
            element_id VARCHAR(24) NULL,
            reporter_id BIGINT NULL,
            reason VARCHAR(300) DEFAULT '',
            status VARCHAR(12) DEFAULT 'open',
            created_at BIGINT NOT NULL,
            KEY idx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        // 차단 컬럼 (기존 테이블이면 ALTER, 없으면 무시)
        try { $pdo->exec("ALTER TABLE st_users ADD COLUMN is_blocked TINYINT(1) DEFAULT 0"); } catch (Throwable $e) { /* 이미 있음 */ }
        $pdo->exec("CREATE TABLE IF NOT EXISTS st_notifications (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id BIGINT NOT NULL,
            type VARCHAR(16) DEFAULT 'system',
            message VARCHAR(500) NOT NULL,
            board_id VARCHAR(24) NULL,
            is_read TINYINT(1) DEFAULT 0,
            created_at BIGINT NOT NULL,
            KEY idx_user (user_id, is_read)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        // 기본 금지어 시드(1회)
        $cnt = (int) $pdo->query('SELECT COUNT(*) c FROM st_banned_words')->fetch()['c'];
        if ($cnt === 0) {
            $seed = [['씨발', 'abuse', 'block'], ['개새끼', 'abuse', 'block'], ['좆', 'sexual', 'block'], ['섹스', 'sexual', 'review'], ['도박', 'illegal', 'review'], ['광고', 'spam', 'warn']];
            $ins = $pdo->prepare('INSERT IGNORE INTO st_banned_words (word, category, severity, is_active, created_at) VALUES (:w,:c,:s,1,:t)');
            foreach ($seed as $s) $ins->execute([':w' => $s[0], ':c' => $s[1], ':s' => $s[2], ':t' => self::now()]);
        }
        self::$ready = true;
    }

    // ── 사용자/인증 ──
    private static function userByToken(): ?array
    {
        $t = self::bearer();
        if ($t === '') return null;
        $st = Db::pdo()->prepare('SELECT * FROM st_users WHERE token = :t LIMIT 1');
        $st->execute([':t' => $t]);
        return $st->fetch() ?: null;
    }
    private static function requireUser(): array
    {
        $u = self::userByToken();
        if (!$u) self::json(401, ['error' => '로그인이 필요합니다.']);
        if (!empty($u['is_blocked'])) self::json(403, ['error' => '차단된 사용자입니다. 관리자에게 문의하세요.']);
        return $u;
    }
    private static function pubUser(array $u): array
    {
        return ['id' => (int) $u['id'], 'nickname' => $u['nickname'], 'color' => $u['cursor_color'], 'isAdmin' => (bool) $u['is_admin']];
    }

    // POST /st/auth  {nickname, color?}
    public static function auth(): void
    {
        self::ensureSchema();
        $b = self::body();
        $nick = mb_substr(trim((string) ($b['nickname'] ?? '')), 0, 50);
        if ($nick === '') $nick = '길손' . random_int(1000, 9999);
        if (self::textVerdict($nick) === 'block') self::json(400, ['error' => '사용할 수 없는 닉네임입니다.']);
        $color = preg_match('/^#[0-9a-fA-F]{6}$/', (string) ($b['color'] ?? '')) ? $b['color'] : self::pickColor();
        $tok = self::token();
        $pdo = Db::pdo();
        $pdo->prepare('INSERT INTO st_users (nickname, cursor_color, token, is_admin, created_at, last_login_at) VALUES (:n,:c,:t,0,:ca,:la)')
            ->execute([':n' => $nick, ':c' => $color, ':t' => $tok, ':ca' => self::now(), ':la' => self::now()]);
        $id = (int) $pdo->lastInsertId();
        $u = $pdo->query('SELECT * FROM st_users WHERE id = ' . $id)->fetch();
        self::json(200, ['user' => self::pubUser($u), 'token' => $tok]);
    }
    // GET /st/me
    public static function me(): void
    {
        self::ensureSchema();
        $u = self::requireUser();
        self::json(200, ['user' => self::pubUser($u)]);
    }
    private static function pickColor(): string
    {
        $p = ['#FF5A5A', '#4ECDC4', '#FFD93D', '#6BCB77', '#4D96FF', '#FF6FB5', '#A66CFF', '#FF9F45'];
        return $p[random_int(0, count($p) - 1)];
    }

    // ── 금지어 필터 ──
    private static ?array $wordCache = null;
    private static function words(): array
    {
        if (self::$wordCache === null) {
            self::$wordCache = Db::pdo()->query("SELECT word, severity FROM st_banned_words WHERE is_active = 1")->fetchAll();
        }
        return self::$wordCache;
    }
    private static function normalize(string $s): string
    {
        $s = mb_strtolower($s);
        return preg_replace('/[\s\p{P}\p{S}]+/u', '', $s) ?? $s;
    }
    /** @return 'pass'|'warn'|'review'|'block' */
    private static function textVerdict(string $text): string
    {
        $norm = self::normalize($text);
        $verdict = 'pass';
        foreach (self::words() as $w) {
            if ($w['word'] === '' ) continue;
            if (mb_strpos($norm, self::normalize($w['word'])) !== false) {
                if ($w['severity'] === 'block') return 'block';
                if ($w['severity'] === 'review') $verdict = 'review';
                elseif ($verdict === 'pass') $verdict = 'warn';
            }
        }
        return $verdict;
    }
    private static function maskWords(string $text): string
    {
        foreach (self::words() as $w) {
            if ($w['severity'] === 'warn' && $w['word'] !== '') {
                $text = preg_replace('/' . preg_quote($w['word'], '/') . '/iu', str_repeat('●', mb_strlen($w['word'])), $text);
            }
        }
        return $text;
    }

    // ── 권한/등급 ──
    private const GRADE_CAP = [
        1 => ['drawing' => true, 'emoji' => false, 'image' => false, 'video' => false, 'text' => false, 'colors' => 3],
        2 => ['drawing' => true, 'emoji' => true, 'image' => false, 'video' => false, 'text' => false, 'colors' => 5],
        3 => ['drawing' => true, 'emoji' => true, 'image' => true, 'video' => false, 'text' => true, 'colors' => 5],
        4 => ['drawing' => true, 'emoji' => true, 'image' => true, 'video' => true, 'text' => true, 'colors' => 5],
    ];
    private static function membership(string $boardId, int $userId): ?array
    {
        $st = Db::pdo()->prepare('SELECT * FROM st_members WHERE board_id = :b AND user_id = :u LIMIT 1');
        $st->execute([':b' => $boardId, ':u' => $userId]);
        return $st->fetch() ?: null;
    }
    private static function levelOf(int $count): int
    {
        if ($count >= 100) return 4;
        if ($count >= 30) return 3;
        if ($count >= 10) return 2;
        return 1;
    }

    // ── 보드 목록/생성 ──
    // GET /st/boards?category=&sort=&q=
    public static function listBoards(): void
    {
        self::ensureSchema();
        $cat = (string) ($_GET['category'] ?? '');
        $sort = ($_GET['sort'] ?? 'recent') === 'popular' ? 'member_count DESC, updated_at DESC' : 'updated_at DESC';
        $q = trim((string) ($_GET['q'] ?? ''));
        $where = "visibility != 'private'";
        $args = [];
        if (in_array($cat, ['region', 'club', 'friends', 'etc'], true)) { $where .= ' AND category = :c'; $args[':c'] = $cat; }
        if ($q !== '') { $where .= ' AND (title LIKE :q OR description LIKE :q2)'; $args[':q'] = "%$q%"; $args[':q2'] = "%$q%"; }
        $st = Db::pdo()->prepare("SELECT b.*, u.nickname owner_name FROM st_boards b JOIN st_users u ON u.id = b.owner_id WHERE $where ORDER BY $sort LIMIT 100");
        $st->execute($args);
        self::json(200, ['boards' => array_map([self::class, 'boardCard'], $st->fetchAll())]);
    }
    private static function boardCard(array $b): array
    {
        return [
            'id' => $b['id'], 'title' => $b['title'], 'description' => $b['description'],
            'category' => $b['category'], 'visibility' => $b['visibility'], 'bgType' => $b['bg_type'],
            'memberCount' => (int) $b['member_count'], 'boardLevel' => (int) $b['board_level'],
            'regionTag' => $b['region_tag'], 'signboardStyle' => $b['signboard_style'],
            'skyTone' => $b['sky_tone'], 'streetTheme' => $b['street_theme'], 'frameSkin' => $b['frame_skin'],
            'ownerName' => $b['owner_name'] ?? '', 'updatedAt' => (int) $b['updated_at'],
        ];
    }

    // POST /st/boards
    public static function createBoard(): void
    {
        self::ensureSchema();
        $u = self::requireUser();
        $b = self::body();
        $title = mb_substr(trim((string) ($b['title'] ?? '')), 0, 100);
        if ($title === '') self::json(400, ['error' => '칠판 이름을 입력하세요.']);
        if (self::textVerdict($title) === 'block') self::json(400, ['error' => '사용할 수 없는 제목입니다.']);
        $desc = mb_substr(trim((string) ($b['description'] ?? '')), 0, 500);
        $cat = in_array($b['category'] ?? '', ['region', 'club', 'friends', 'etc'], true) ? $b['category'] : 'etc';
        $vis = in_array($b['visibility'] ?? '', ['public', 'private', 'invite'], true) ? $b['visibility'] : 'public';
        $id = substr(bin2hex(random_bytes(8)), 0, 16);
        $now = self::now();
        $pdo = Db::pdo();
        $pdo->prepare('INSERT INTO st_boards (id, owner_id, title, description, category, visibility, bg_type, member_count, board_level, region_tag, signboard_style, sky_tone, street_theme, created_at, updated_at)
            VALUES (:id,:o,:t,:d,:c,:v,:bg,1,1,:rt,:sb,:sky,:th,:ca,:ua)')
            ->execute([':id' => $id, ':o' => $u['id'], ':t' => $title, ':d' => $desc, ':c' => $cat, ':v' => $vis,
                ':bg' => (string) ($b['bgType'] ?? 'green'), ':rt' => mb_substr((string) ($b['regionTag'] ?? ''), 0, 100),
                ':sb' => in_array($b['signboardStyle'] ?? '', ['a_board', 'arch'], true) ? $b['signboardStyle'] : 'a_board',
                ':sky' => 'day', ':th' => 'default', ':ca' => $now, ':ua' => $now]);
        $pdo->prepare('INSERT INTO st_members (board_id, user_id, role, grade, joined_at) VALUES (:b,:u,\'owner\',4,:j)')
            ->execute([':b' => $id, ':u' => $u['id'], ':j' => $now]);
        self::json(200, ['id' => $id]);
    }

    // GET /st/boards/:id
    public static function getBoard(string $id): void
    {
        self::ensureSchema();
        $st = Db::pdo()->prepare('SELECT b.*, u.nickname owner_name FROM st_boards b JOIN st_users u ON u.id=b.owner_id WHERE b.id = :id');
        $st->execute([':id' => $id]);
        $board = $st->fetch();
        if (!$board) self::json(404, ['error' => '존재하지 않는 칠판입니다.']);
        $me = self::userByToken();
        $mem = $me ? self::membership($id, (int) $me['id']) : null;
        $els = Db::pdo()->prepare('SELECT id, author_id, type, data, z_index FROM st_elements WHERE board_id = :b AND deleted_at IS NULL ORDER BY z_index ASC, created_at ASC');
        $els->execute([':b' => $id]);
        $mst = Db::pdo()->prepare('SELECT m.user_id, m.role, m.grade, u.nickname, u.cursor_color FROM st_members m JOIN st_users u ON u.id=m.user_id WHERE m.board_id = :b ORDER BY m.joined_at ASC');
        $mst->execute([':b' => $id]);
        self::json(200, [
            'board' => self::boardCard($board),
            'elements' => array_map(fn ($e) => [
                'id' => $e['id'], 'authorId' => (int) $e['author_id'], 'type' => $e['type'],
                'data' => json_decode($e['data'], true), 'zIndex' => (int) $e['z_index'],
            ], $els->fetchAll()),
            'members' => array_map(fn ($m) => [
                'userId' => (int) $m['user_id'], 'nickname' => $m['nickname'], 'color' => $m['cursor_color'],
                'role' => $m['role'], 'grade' => (int) $m['grade'],
            ], $mst->fetchAll()),
            'myRole' => $mem ? $mem['role'] : null,
            'myGrade' => $mem ? (int) $mem['grade'] : 0,
            'caps' => $mem ? self::GRADE_CAP[(int) $mem['grade']] : null,
        ]);
    }

    // POST /st/boards/:id/join
    public static function joinBoard(string $id): void
    {
        self::ensureSchema();
        $u = self::requireUser();
        $pdo = Db::pdo();
        $board = $pdo->query('SELECT * FROM st_boards WHERE id = ' . $pdo->quote($id))->fetch();
        if (!$board) self::json(404, ['error' => '존재하지 않는 칠판입니다.']);
        if (self::membership($id, (int) $u['id'])) { self::json(200, ['ok' => true, 'already' => true]); }
        $pdo->prepare('INSERT IGNORE INTO st_members (board_id, user_id, role, grade, joined_at) VALUES (:b,:u,\'member\',1,:j)')
            ->execute([':b' => $id, ':u' => $u['id'], ':j' => self::now()]);
        // member_count 재계산 + 레벨 갱신 + 첫 Lv.2 도달 알림
        $cnt = (int) $pdo->query('SELECT COUNT(*) c FROM st_members WHERE board_id = ' . $pdo->quote($id))->fetch()['c'];
        $level = self::levelOf($cnt);
        $prevLevel = (int) $board['board_level'];
        $pdo->prepare('UPDATE st_boards SET member_count = :c, board_level = :l, updated_at = :t WHERE id = :id')
            ->execute([':c' => $cnt, ':l' => $level, ':t' => self::now(), ':id' => $id]);
        if ($level >= 2 && $prevLevel < 2) {
            $pdo->prepare('INSERT INTO st_notifications (user_id, type, message, board_id, is_read, created_at) VALUES (:u,\'unlock\',:m,:b,0,:t)')
                ->execute([':u' => $board['owner_id'], ':m' => "'{$board['title']}' 칠판이 10명을 돌파해 꾸미기가 해금됐어요!", ':b' => $id, ':t' => self::now()]);
        }
        self::logEvent($id, 'member', '', ['memberCount' => $cnt, 'boardLevel' => $level]);
        self::json(200, ['ok' => true, 'memberCount' => $cnt, 'boardLevel' => $level]);
    }

    // PATCH /st/boards/:id  (owner — 꾸미기/설정)
    public static function updateBoard(string $id): void
    {
        self::ensureSchema();
        $u = self::requireUser();
        $mem = self::membership($id, (int) $u['id']);
        if (!$mem || $mem['role'] !== 'owner') self::json(403, ['error' => '방장만 수정할 수 있습니다.']);
        $b = self::body();
        $cols = ['bg_type' => 'bgType', 'sky_tone' => 'skyTone', 'street_theme' => 'streetTheme', 'signboard_style' => 'signboardStyle', 'frame_skin' => 'frameSkin', 'region_tag' => 'regionTag', 'title' => 'title', 'description' => 'description'];
        $set = []; $args = [':id' => $id, ':t' => self::now()];
        foreach ($cols as $col => $key) {
            if (array_key_exists($key, $b)) {
                if (($col === 'title' || $col === 'description') && self::textVerdict((string) $b[$key]) === 'block') continue;
                $set[] = "$col = :$col"; $args[":$col"] = mb_substr((string) $b[$key], 0, 500);
            }
        }
        if (!$set) self::json(400, ['error' => '변경할 내용이 없습니다.']);
        Db::pdo()->prepare('UPDATE st_boards SET ' . implode(', ', $set) . ', updated_at = :t WHERE id = :id')->execute($args);
        $board = Db::pdo()->query('SELECT b.*, u.nickname owner_name FROM st_boards b JOIN st_users u ON u.id=b.owner_id WHERE b.id=' . Db::pdo()->quote($id))->fetch();
        self::logEvent($id, 'board', '', self::boardCard($board));
        self::json(200, ['board' => self::boardCard($board)]);
    }

    // DELETE /st/boards/:id (owner)
    public static function deleteBoard(string $id): void
    {
        self::ensureSchema();
        $u = self::requireUser();
        $mem = self::membership($id, (int) $u['id']);
        if (!$mem || $mem['role'] !== 'owner') self::json(403, ['error' => '방장만 삭제할 수 있습니다.']);
        $pdo = Db::pdo();
        foreach (['st_elements', 'st_members', 'st_events', 'st_presence', 'st_invites'] as $t) {
            $pdo->prepare("DELETE FROM $t WHERE board_id = :b")->execute([':b' => $id]);
        }
        $pdo->prepare('DELETE FROM st_boards WHERE id = :b')->execute([':b' => $id]);
        self::json(200, ['ok' => true]);
    }

    // ── 요소 CRUD (실시간 이벤트 로깅) ──
    private static function logEvent(string $boardId, string $kind, string $origin, array $payload): void
    {
        $pdo = Db::pdo();
        $pdo->prepare('INSERT INTO st_events (board_id, kind, origin, payload, created_at) VALUES (:b,:k,:o,:p,:t)')
            ->execute([':b' => $boardId, ':k' => $kind, ':o' => $origin, ':p' => json_encode($payload, JSON_UNESCAPED_UNICODE), ':t' => self::now()]);
        // 드래그 실시간 스트리밍으로 이벤트가 잦아짐 → 정리(subquery) 매번 X, 확률적으로만
        if (mt_rand(1, 12) === 1) {
            $pdo->prepare('DELETE FROM st_events WHERE board_id = :b AND id < (SELECT mid FROM (SELECT MIN(id) mid FROM (SELECT id FROM st_events WHERE board_id = :b2 ORDER BY id DESC LIMIT 300) t) t2)')
                ->execute([':b' => $boardId, ':b2' => $boardId]);
        }
    }

    // POST /st/boards/:id/elements  {type, data, zIndex, clientId}
    public static function addElement(string $id): void
    {
        self::ensureSchema();
        $u = self::requireUser();
        $mem = self::membership($id, (int) $u['id']);
        if (!$mem) self::json(403, ['error' => '먼저 칠판에 참여하세요.']);
        $b = self::body();
        $type = (string) ($b['type'] ?? '');
        if (!in_array($type, ['drawing', 'image', 'video', 'emoji', 'text'], true)) self::json(400, ['error' => '유효하지 않은 타입입니다.']);
        $cap = self::GRADE_CAP[(int) $mem['grade']] ?? self::GRADE_CAP[1];
        if (empty($cap[$type])) self::json(403, ['error' => '등급이 부족합니다. (' . $type . ')']);
        $data = is_array($b['data'] ?? null) ? $b['data'] : [];
        // 텍스트 검열
        if ($type === 'text') {
            $v = self::textVerdict((string) ($data['text'] ?? ''));
            if ($v === 'block') { self::json(200, ['rejected' => true, 'reason' => '금지어가 포함되어 있습니다.']); }
            if ($v === 'warn') $data['text'] = self::maskWords((string) ($data['text'] ?? ''));
            if ($v === 'review') { self::json(200, ['pending' => true]); }
        }
        $eid = substr(bin2hex(random_bytes(8)), 0, 16);
        $z = (int) ($b['zIndex'] ?? 0);
        Db::pdo()->prepare('INSERT INTO st_elements (id, board_id, author_id, type, data, z_index, created_at) VALUES (:id,:b,:a,:t,:d,:z,:c)')
            ->execute([':id' => $eid, ':b' => $id, ':a' => $u['id'], ':t' => $type, ':d' => json_encode($data, JSON_UNESCAPED_UNICODE), ':z' => $z, ':c' => self::now()]);
        $el = ['id' => $eid, 'authorId' => (int) $u['id'], 'type' => $type, 'data' => $data, 'zIndex' => $z];
        self::logEvent($id, 'add', (string) ($b['clientId'] ?? ''), $el);
        self::json(200, ['element' => $el]);
    }

    // PATCH /st/boards/:id/elements/:eid  {data, zIndex, clientId}
    public static function updateElement(string $id, string $eid): void
    {
        self::ensureSchema();
        $u = self::requireUser();
        $mem = self::membership($id, (int) $u['id']);
        if (!$mem) self::json(403, ['error' => '권한이 없습니다.']);
        $pdo = Db::pdo();
        $st = $pdo->prepare('SELECT * FROM st_elements WHERE id = :e AND board_id = :b AND deleted_at IS NULL');
        $st->execute([':e' => $eid, ':b' => $id]);
        $el = $st->fetch();
        if (!$el) self::json(404, ['error' => '요소를 찾을 수 없습니다.']);
        if ((int) $el['author_id'] !== (int) $u['id'] && $mem['role'] !== 'owner' && $mem['role'] !== 'manager')
            self::json(403, ['error' => '본인 또는 방장만 수정할 수 있습니다.']);
        $b = self::body();
        $data = is_array($b['data'] ?? null) ? $b['data'] : json_decode($el['data'], true);
        $z = array_key_exists('zIndex', $b) ? (int) $b['zIndex'] : (int) $el['z_index'];
        $pdo->prepare('UPDATE st_elements SET data = :d, z_index = :z WHERE id = :e')
            ->execute([':d' => json_encode($data, JSON_UNESCAPED_UNICODE), ':z' => $z, ':e' => $eid]);
        $out = ['id' => $eid, 'authorId' => (int) $el['author_id'], 'type' => $el['type'], 'data' => $data, 'zIndex' => $z];
        self::logEvent($id, 'update', (string) ($b['clientId'] ?? ''), $out);
        self::json(200, ['element' => $out]);
    }

    // DELETE /st/boards/:id/elements/:eid
    public static function deleteElement(string $id, string $eid): void
    {
        self::ensureSchema();
        $u = self::requireUser();
        $mem = self::membership($id, (int) $u['id']);
        if (!$mem) self::json(403, ['error' => '권한이 없습니다.']);
        $pdo = Db::pdo();
        $st = $pdo->prepare('SELECT * FROM st_elements WHERE id = :e AND board_id = :b');
        $st->execute([':e' => $eid, ':b' => $id]);
        $el = $st->fetch();
        if (!$el) self::json(404, ['error' => '요소를 찾을 수 없습니다.']);
        if ((int) $el['author_id'] !== (int) $u['id'] && $mem['role'] !== 'owner')
            self::json(403, ['error' => '본인 또는 방장만 삭제할 수 있습니다.']);
        $pdo->prepare('UPDATE st_elements SET deleted_at = :t WHERE id = :e')->execute([':t' => self::now(), ':e' => $eid]);
        self::logEvent($id, 'delete', (string) (self::body()['clientId'] ?? ''), ['id' => $eid]);
        self::json(200, ['ok' => true]);
    }

    // POST /st/boards/:id/clear  (owner — 전체 지우기)
    public static function clearBoard(string $id): void
    {
        self::ensureSchema();
        $u = self::requireUser();
        $mem = self::membership($id, (int) $u['id']);
        if (!$mem || $mem['role'] !== 'owner') self::json(403, ['error' => '방장만 전체 지우기가 가능합니다.']);
        Db::pdo()->prepare('UPDATE st_elements SET deleted_at = :t WHERE board_id = :b AND deleted_at IS NULL')->execute([':t' => self::now(), ':b' => $id]);
        self::logEvent($id, 'clear', (string) (self::body()['clientId'] ?? ''), ['at' => self::now()]);
        self::json(200, ['ok' => true]);
    }

    // ── 프레즌스 커서 ──
    // POST /st/boards/:id/cursor  {clientId, x, y}
    public static function cursor(string $id): void
    {
        self::ensureSchema();
        $u = self::userByToken();
        $b = self::body();
        $cid = (string) ($b['clientId'] ?? '');
        if ($cid === '') self::json(400, ['error' => 'clientId 필요']);
        $name = $u ? $u['nickname'] : mb_substr((string) ($b['name'] ?? '길손'), 0, 50);
        $color = $u ? $u['cursor_color'] : (preg_match('/^#[0-9a-fA-F]{6}$/', (string) ($b['color'] ?? '')) ? $b['color'] : '#8A8A84');
        Db::pdo()->prepare('INSERT INTO st_presence (board_id, client_id, user_id, name, color, cx, cy, ts) VALUES (:b,:c,:u,:n,:co,:x,:y,:t)
            ON DUPLICATE KEY UPDATE cx=VALUES(cx), cy=VALUES(cy), name=VALUES(name), color=VALUES(color), ts=VALUES(ts)')
            ->execute([':b' => $id, ':c' => $cid, ':u' => $u ? $u['id'] : null, ':n' => $name, ':co' => $color,
                ':x' => isset($b['x']) ? (int) $b['x'] : null, ':y' => isset($b['y']) ? (int) $b['y'] : null, ':t' => self::now()]);
        self::json(200, ['ok' => true]);
    }
    private static function peers(string $boardId): array
    {
        $pdo = Db::pdo();
        $pdo->prepare('DELETE FROM st_presence WHERE board_id = :b AND ts < :t')->execute([':b' => $boardId, ':t' => self::now() - 20000]);
        $st = $pdo->prepare('SELECT client_id, name, color, cx, cy FROM st_presence WHERE board_id = :b');
        $st->execute([':b' => $boardId]);
        return array_map(fn ($r) => [
            'clientId' => $r['client_id'], 'name' => $r['name'], 'color' => $r['color'],
            'cursor' => ($r['cx'] !== null) ? ['x' => (int) $r['cx'], 'y' => (int) $r['cy']] : null,
        ], $st->fetchAll());
    }

    // GET /st/boards/:id/events (SSE)
    public static function events(string $id): void
    {
        self::ensureSchema();
        $cid = (string) ($_GET['clientId'] ?? '');
        if ($cid === '') self::json(400, ['error' => 'clientId 필요']);
        $board = Db::pdo()->query('SELECT id FROM st_boards WHERE id = ' . Db::pdo()->quote($id))->fetch();
        if (!$board) self::json(404, ['error' => '없는 칠판']);

        set_time_limit(0);
        ignore_user_abort(false);
        header('Content-Type: text/event-stream; charset=utf-8');
        header('Cache-Control: no-cache');
        header('X-Accel-Buffering: no');
        while (ob_get_level() > 0) ob_end_flush();
        $emit = function (string $ev, array $d, ?int $mid = null) {
            if ($mid !== null) echo "id: {$mid}\n";
            echo "event: {$ev}\n"; echo 'data: ' . json_encode($d, JSON_UNESCAPED_UNICODE) . "\n\n"; flush();
        };

        $lastId = (int) ($_SERVER['HTTP_LAST_EVENT_ID'] ?? ($_GET['since'] ?? 0));
        if ($lastId === 0) {
            $lastId = (int) Db::pdo()->query('SELECT COALESCE(MAX(id),0) m FROM st_events WHERE board_id = ' . Db::pdo()->quote($id))->fetch()['m'];
        }
        $emit('hello', ['peers' => self::peers($id)]);
        $lastPeers = '';
        $start = time();
        while (time() - $start < 110) {
            if (connection_aborted()) break;
            $st = Db::pdo()->prepare('SELECT id, kind, origin, payload FROM st_events WHERE board_id = :b AND id > :i ORDER BY id ASC LIMIT 40');
            $st->execute([':b' => $id, ':i' => $lastId]);
            foreach ($st->fetchAll() as $e) {
                $lastId = (int) $e['id'];
                $emit('event', ['kind' => $e['kind'], 'origin' => $e['origin'], 'payload' => json_decode($e['payload'], true)], $lastId);
            }
            $peers = self::peers($id);
            $sig = json_encode($peers);
            if ($sig !== $lastPeers) { $lastPeers = $sig; $emit('presence', ['peers' => $peers]); }
            echo ": ping\n\n"; flush();
            if (connection_aborted()) break;
            usleep(110000); // 실시간성 ↑ (110ms 폴링 — 커서·요소 반영 지연 축소)
        }
        Db::pdo()->prepare('DELETE FROM st_presence WHERE board_id = :b AND client_id = :c')->execute([':b' => $id, ':c' => $cid]);
        exit;
    }

    // ── 초대 ──
    // POST /st/boards/:id/invite
    public static function invite(string $id): void
    {
        self::ensureSchema();
        $u = self::requireUser();
        $mem = self::membership($id, (int) $u['id']);
        if (!$mem || !in_array($mem['role'], ['owner', 'manager'], true)) self::json(403, ['error' => '초대 권한이 없습니다.']);
        $code = substr(bin2hex(random_bytes(6)), 0, 12);
        Db::pdo()->prepare('INSERT INTO st_invites (code, board_id, created_by, expires_at, created_at) VALUES (:c,:b,:u,:e,:t)')
            ->execute([':c' => $code, ':b' => $id, ':u' => $u['id'], ':e' => self::now() + 7 * 86400000, ':t' => self::now()]);
        self::json(200, ['code' => $code]);
    }
    // GET /st/join/:code
    public static function resolveInvite(string $code): void
    {
        self::ensureSchema();
        $st = Db::pdo()->prepare('SELECT i.board_id, b.title FROM st_invites i JOIN st_boards b ON b.id=i.board_id WHERE i.code = :c AND (i.expires_at IS NULL OR i.expires_at > :now) LIMIT 1');
        $st->execute([':c' => $code, ':now' => self::now()]);
        $r = $st->fetch();
        if (!$r) self::json(404, ['error' => '만료되었거나 존재하지 않는 초대입니다.']);
        self::json(200, ['boardId' => $r['board_id'], 'title' => $r['title']]);
    }

    // ── 알림 ──
    // GET /st/notifications
    public static function notifications(): void
    {
        self::ensureSchema();
        $u = self::requireUser();
        $st = Db::pdo()->prepare('SELECT id, type, message, board_id, is_read, created_at FROM st_notifications WHERE user_id = :u ORDER BY id DESC LIMIT 30');
        $st->execute([':u' => $u['id']]);
        self::json(200, ['notifications' => array_map(fn ($n) => [
            'id' => (int) $n['id'], 'type' => $n['type'], 'message' => $n['message'],
            'boardId' => $n['board_id'], 'isRead' => (bool) $n['is_read'], 'createdAt' => (int) $n['created_at'],
        ], $st->fetchAll())]);
    }
    // POST /st/notifications/read
    public static function readNotifications(): void
    {
        self::ensureSchema();
        $u = self::requireUser();
        Db::pdo()->prepare('UPDATE st_notifications SET is_read = 1 WHERE user_id = :u')->execute([':u' => $u['id']]);
        self::json(200, ['ok' => true]);
    }

    // ── 관리자: 금지어 ──
    private static function requireAdmin(): array
    {
        $u = self::requireUser();
        if (!$u['is_admin']) self::json(403, ['error' => '관리자만 접근할 수 있습니다.']);
        return $u;
    }
    public static function bannedList(): void
    {
        self::ensureSchema();
        self::requireAdmin();
        $rows = Db::pdo()->query('SELECT id, word, category, severity, is_active FROM st_banned_words ORDER BY id DESC')->fetchAll();
        self::json(200, ['words' => array_map(fn ($w) => [
            'id' => (int) $w['id'], 'word' => $w['word'], 'category' => $w['category'],
            'severity' => $w['severity'], 'isActive' => (bool) $w['is_active'],
        ], $rows)]);
    }
    public static function bannedAdd(): void
    {
        self::ensureSchema();
        self::requireAdmin();
        $b = self::body();
        $word = mb_substr(trim((string) ($b['word'] ?? '')), 0, 100);
        if ($word === '') self::json(400, ['error' => '단어를 입력하세요.']);
        Db::pdo()->prepare('INSERT INTO st_banned_words (word, category, severity, is_active, created_at) VALUES (:w,:c,:s,1,:t)
            ON DUPLICATE KEY UPDATE category=VALUES(category), severity=VALUES(severity), is_active=1')
            ->execute([':w' => $word, ':c' => in_array($b['category'] ?? '', ['sexual', 'illegal', 'abuse', 'spam', 'etc'], true) ? $b['category'] : 'etc',
                ':s' => in_array($b['severity'] ?? '', ['block', 'review', 'warn'], true) ? $b['severity'] : 'block', ':t' => self::now()]);
        self::$wordCache = null;
        self::json(200, ['ok' => true]);
    }
    public static function bannedDelete(string $wid): void
    {
        self::ensureSchema();
        self::requireAdmin();
        Db::pdo()->prepare('DELETE FROM st_banned_words WHERE id = :i')->execute([':i' => (int) $wid]);
        self::$wordCache = null;
        self::json(200, ['ok' => true]);
    }

    // ── 신고 / 차단 ──
    // POST /st/boards/:id/report  {elementId, reason}
    public static function report(string $id): void
    {
        self::ensureSchema();
        $u = self::requireUser();
        $b = self::body();
        $eid = mb_substr((string) ($b['elementId'] ?? ''), 0, 24) ?: null;
        $reason = mb_substr(trim((string) ($b['reason'] ?? '')), 0, 300);
        Db::pdo()->prepare('INSERT INTO st_reports (board_id, element_id, reporter_id, reason, status, created_at) VALUES (:b,:e,:r,:rs,\'open\',:t)')
            ->execute([':b' => $id, ':e' => $eid, ':r' => $u['id'], ':rs' => $reason, ':t' => self::now()]);
        self::json(200, ['ok' => true]);
    }
    // GET /st/admin/reports
    public static function reportList(): void
    {
        self::ensureSchema();
        self::requireAdmin();
        $rows = Db::pdo()->query("SELECT r.*, u.nickname reporter, e.type el_type, e.data el_data, e.author_id, e.deleted_at
            FROM st_reports r
            LEFT JOIN st_users u ON u.id = r.reporter_id
            LEFT JOIN st_elements e ON e.id = r.element_id
            WHERE r.status = 'open' ORDER BY r.id DESC LIMIT 100")->fetchAll();
        self::json(200, ['reports' => array_map(fn ($r) => [
            'id' => (int) $r['id'], 'boardId' => $r['board_id'], 'elementId' => $r['element_id'],
            'reporter' => $r['reporter'] ?? '탈퇴',
            'reason' => $r['reason'], 'createdAt' => (int) $r['created_at'],
            'elementType' => $r['el_type'], 'elementData' => $r['el_data'] ? json_decode($r['el_data'], true) : null,
            'authorId' => $r['author_id'] ? (int) $r['author_id'] : null,
            'alreadyHidden' => $r['deleted_at'] !== null,
        ], $rows)]);
    }
    // POST /st/admin/reports/:rid/resolve  {action: hide|dismiss|block}
    public static function reportResolve(string $rid): void
    {
        self::ensureSchema();
        self::requireAdmin();
        $action = (string) (self::body()['action'] ?? 'dismiss');
        $pdo = Db::pdo();
        $rep = $pdo->query('SELECT * FROM st_reports WHERE id = ' . (int) $rid)->fetch();
        if (!$rep) self::json(404, ['error' => '신고를 찾을 수 없습니다.']);
        if ($action === 'hide' || $action === 'block') {
            if ($rep['element_id']) {
                $el = $pdo->prepare('SELECT board_id FROM st_elements WHERE id = :e');
                $el->execute([':e' => $rep['element_id']]);
                $erow = $el->fetch();
                $pdo->prepare('UPDATE st_elements SET deleted_at = :t WHERE id = :e')->execute([':t' => self::now(), ':e' => $rep['element_id']]);
                if ($erow) self::logEvent($erow['board_id'], 'delete', '', ['id' => $rep['element_id']]);
            }
        }
        if ($action === 'block' && $rep['element_id']) {
            $au = $pdo->prepare('SELECT author_id FROM st_elements WHERE id = :e');
            $au->execute([':e' => $rep['element_id']]);
            $arow = $au->fetch();
            if ($arow) $pdo->prepare('UPDATE st_users SET is_blocked = 1 WHERE id = :u')->execute([':u' => $arow['author_id']]);
        }
        $pdo->prepare('UPDATE st_reports SET status = :s WHERE id = :i')
            ->execute([':s' => $action === 'dismiss' ? 'dismissed' : 'resolved', ':i' => (int) $rid]);
        self::json(200, ['ok' => true]);
    }
}
