<?php
/**
 * DeckGen API — PHP 포팅 (hom2box.com/deckGen/api)
 * Node 서버(server/)와 동일 계약: §8 AI 3종 + §12 공유·협업.
 */
declare(strict_types=1);
error_reporting(E_ALL & ~E_DEPRECATED);
ini_set('display_errors', '0');

require __DIR__ . '/src/Db.php';
require __DIR__ . '/src/Prompts.php';
require __DIR__ . '/src/Collab.php';
require __DIR__ . '/src/Ai.php';
require __DIR__ . '/src/Mail.php';
require __DIR__ . '/src/Auth.php';
require __DIR__ . '/src/Admin.php';

$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '';
// /deckGen/api/... → api 이후 경로만
$path = preg_replace('#^.*?/api#', '', $uri) ?: '/';

function notFound(): void
{
    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'not found']);
    exit;
}

try {
    if ($method === 'GET' && $path === '/health') {
        header('Content-Type: application/json');
        echo json_encode(['ok' => true, 'ts' => (int) (microtime(true) * 1000), 'backend' => 'php']);
        exit;
    }

    // ── 공유·협업 ──
    if ($method === 'POST' && $path === '/share') Collab::share();
    if ($method === 'POST' && $path === '/share/invite') Collab::invite();
    if ($method === 'GET' && preg_match('#^/share/([A-Za-z0-9_-]+)$#', $path, $m)) Collab::resolve($m[1]);
    if (preg_match('#^/collab/([^/]+)/(slide|deck|presence|events)$#', $path, $m)) {
        $deckId = urldecode($m[1]);
        if ($method === 'POST' && $m[2] === 'slide') Collab::pushSlide($deckId);
        if ($method === 'POST' && $m[2] === 'deck') Collab::pushDeck($deckId);
        if ($method === 'POST' && $m[2] === 'presence') Collab::presence($deckId);
        if ($method === 'GET' && $m[2] === 'events') Collab::events($deckId);
    }

    // ── 이메일 인증 ──
    if ($method === 'POST' && $path === '/auth/send-code') { Auth::sendCode(); exit; }
    if ($method === 'POST' && $path === '/auth/verify') { Auth::verify(); exit; }

    // ── 공개: 배너·템플릿·이벤트 집계 (§14) ──
    if ($method === 'GET' && $path === '/banners') { Admin::bannersPublic(); exit; }
    if ($method === 'GET' && $path === '/templates') { Admin::templatesPublic(); exit; }
    if ($method === 'POST' && preg_match('#^/templates/([\w-]+)/use$#', $path, $m)) { Admin::templateUse($m[1]); exit; }
    if ($method === 'POST' && $path === '/track') { Admin::track(); exit; }

    // ── 관리자 콘솔 (§14) ──
    if ($method === 'POST' && $path === '/admin/login') { Admin::login(); exit; }
    if ($method === 'POST' && $path === '/admin/verify') { Admin::verify(); exit; }
    if (str_starts_with($path, '/admin/')) {
        Admin::requireAuth();
        if ($method === 'GET' && $path === '/admin/metrics') { Admin::metrics(); exit; }
        if ($method === 'GET' && $path === '/admin/users') { Admin::users(); exit; }
        if ($method === 'POST' && $path === '/admin/users/block') { Admin::blockUser(); exit; }
        if ($method === 'GET' && $path === '/admin/decks') { Admin::decks(); exit; }
        if ($method === 'GET' && $path === '/admin/jobs') { Admin::jobs(); exit; }
        if ($method === 'GET' && $path === '/admin/errors') { Admin::errors(); exit; }
        if ($method === 'POST' && preg_match('#^/admin/errors/(\w+)/resolve$#', $path, $m)) { Admin::resolveError($m[1]); exit; }
        if ($method === 'GET' && $path === '/admin/audit') { Admin::auditLogs(); exit; }
        if ($method === 'GET' && $path === '/admin/banners') { Admin::bannersGet(); exit; }
        if ($method === 'POST' && $path === '/admin/banners') { Admin::bannersAdd(); exit; }
        if ($method === 'PATCH' && preg_match('#^/admin/banners/(\w+)$#', $path, $m)) { Admin::bannersPatch($m[1]); exit; }
        if ($method === 'DELETE' && preg_match('#^/admin/banners/(\w+)$#', $path, $m)) { Admin::bannersDelete($m[1]); exit; }
        if ($method === 'GET' && $path === '/admin/templates') { Admin::templatesGet(); exit; }
        if ($method === 'PUT' && $path === '/admin/templates') { Admin::templatesPut(); exit; }
        if ($method === 'GET' && $path === '/admin/settings') { Admin::settingsGet(); exit; }
        if ($method === 'PATCH' && $path === '/admin/settings') { Admin::settingsPatch(); exit; }
    }

    // ── AI ──
    if ($method === 'GET' && $path === '/models') { Ai::models(); exit; }
    if ($method === 'POST' && $path === '/outline') { Ai::outline(); exit; }
    if ($method === 'POST' && $path === '/slides') { Ai::slides(); exit; }
    if ($method === 'POST' && $path === '/edit') { Ai::edit(); exit; }
    if ($method === 'POST' && $path === '/ai-image') { Ai::aiImage(); exit; }

    notFound();
} catch (Throwable $e) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => '서버 오류: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
