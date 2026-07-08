<?php
/** §8 AI 파이프라인 (PHP 포팅) — anthropic_api_key 없으면 모의 모드 (Node 서버와 동일 규칙) */
final class Ai
{
    private static function body(): array
    {
        $j = json_decode(file_get_contents('php://input'), true);
        return is_array($j) ? $j : [];
    }

    private static function sseStart(): callable
    {
        set_time_limit(0);
        header('Content-Type: text/event-stream; charset=utf-8');
        header('Cache-Control: no-cache');
        header('X-Accel-Buffering: no');
        while (ob_get_level() > 0) ob_end_flush();
        return function (string $event, array $data): void {
            echo "event: {$event}\n";
            echo 'data: ' . json_encode($data, JSON_UNESCAPED_UNICODE) . "\n\n";
            flush();
        };
    }

    private static function key(): string
    {
        // 키에 줄바꿈/공백이 섞여 붙여넣어져도 HTTP 헤더가 깨지지 않게 정리
        return trim((string) Db::cfg('anthropic_api_key', ''));
    }

    private static function model(): string
    {
        // 관리자 콘솔 "생성 모델" 설정(§14)이 있으면 우선
        $override = Admin::genModelOverride();
        if ($override !== '') return $override;
        return trim((string) Db::cfg('anthropic_model', 'claude-sonnet-4-6'));
    }

    /** §14 점검 모드 + IP당 일일 생성 한도 — 차단 시 JSON 응답 후 true 반환 */
    private static function guardGenerate(): bool
    {
        if (Admin::isMaintenance()) {
            http_response_code(503);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => '점검 중입니다. 잠시 후 다시 시도해주세요.'], JSON_UNESCAPED_UNICODE);
            return true;
        }
        if (!Admin::checkDailyLimit()) {
            http_response_code(429);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => '일일 생성 한도를 초과했습니다.'], JSON_UNESCAPED_UNICODE);
            return true;
        }
        return false;
    }

    private static function httpJson(string $url, array $headers, array $body): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 120,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json'], $headers),
            CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE),
        ]);
        $res = curl_exec($ch);
        if ($res === false) throw new RuntimeException('LLM 호출 실패: ' . curl_error($ch));
        $j = json_decode($res, true);
        if (!is_array($j)) throw new RuntimeException('LLM 응답 파싱 실패: ' . substr((string) $res, 0, 200));
        return $j;
    }

    /** 사용 가능한 모델 목록 — config.php LLM 설계 반영 (GET /models) */
    public static function models(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        $models = [];
        if (self::key() !== '') {
            $models[] = ['id' => self::model(), 'provider' => 'anthropic', 'label' => 'Claude ' . self::pretty(preg_replace('/^claude-/', '', self::model())), 'role' => '주력 — 분석·설계·수정', 'default' => true];
        }
        $ok = trim((string) Db::cfg('openai_api_key', ''));
        $om = trim((string) Db::cfg('openai_chat_model', ''));
        if ($ok !== '' && $om !== '') {
            $models[] = ['id' => $om, 'provider' => 'openai', 'label' => 'GPT ' . self::pretty(preg_replace('/^gpt-/', '', $om)), 'role' => '폴백 텍스트'];
        }
        $gk = trim((string) Db::cfg('gemini_api_key', ''));
        $gm = trim((string) Db::cfg('gemini_text_model', ''));
        if ($gk !== '' && $gm !== '') {
            $models[] = ['id' => $gm, 'provider' => 'gemini', 'label' => 'Gemini ' . self::pretty(preg_replace('/^gemini-/', '', $gm)), 'role' => '저비용 보조'];
        }
        echo json_encode(['models' => $models], JSON_UNESCAPED_UNICODE);
    }

    private static function pretty(string $slug): string
    {
        $slug = preg_replace('/-preview$/', '', $slug);
        $words = array_map(fn ($t) => ctype_digit($t) ? $t : ucfirst($t), explode('-', $slug));
        return preg_replace('/(\d) (\d)/', '$1.$2', implode(' ', $words));
    }

    /** 공급자 디스패치 단건 호출 → 텍스트 (Node providers.ts와 동일 계약) */
    private static function complete(string $system, string $user, int $maxTokens, ?string $model = null): string
    {
        $model = $model !== null && $model !== '' ? $model : self::model();
        if (str_starts_with($model, 'gpt') || str_starts_with($model, 'o')) {
            $j = self::httpJson('https://api.openai.com/v1/chat/completions',
                ['Authorization: Bearer ' . trim((string) Db::cfg('openai_api_key', ''))],
                ['model' => $model, 'max_completion_tokens' => $maxTokens,
                 'messages' => [['role' => 'system', 'content' => $system], ['role' => 'user', 'content' => $user]]]);
            $text = $j['choices'][0]['message']['content'] ?? '';
        } elseif (str_starts_with($model, 'gemini')) {
            $j = self::httpJson('https://generativelanguage.googleapis.com/v1beta/models/' . $model . ':generateContent?key=' . trim((string) Db::cfg('gemini_api_key', '')), [],
                ['systemInstruction' => ['parts' => [['text' => $system]]],
                 'contents' => [['role' => 'user', 'parts' => [['text' => $user]]]],
                 'generationConfig' => ['maxOutputTokens' => $maxTokens]]);
            $text = '';
            foreach (($j['candidates'][0]['content']['parts'] ?? []) as $p) $text .= $p['text'] ?? '';
        } else {
            $j = self::httpJson('https://api.anthropic.com/v1/messages',
                ['x-api-key: ' . self::key(), 'anthropic-version: 2023-06-01'],
                ['model' => $model, 'max_tokens' => $maxTokens, 'system' => $system,
                 'messages' => [['role' => 'user', 'content' => $user]]]);
            $text = '';
            foreach (($j['content'] ?? []) as $blk) {
                if (($blk['type'] ?? '') === 'text') $text .= $blk['text'];
            }
        }
        if ($text === '') throw new RuntimeException('빈 응답 (' . $model . ')');
        return preg_replace('/^\s*```(?:json)?\s*|\s*```\s*$/', '', $text);
    }

    // ── POST /outline (SSE) ──
    public static function outline(): void
    {
        $b = self::body();
        $prompt = trim((string) ($b['prompt'] ?? ''));
        if ($prompt === '') {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'prompt가 필요합니다.'], JSON_UNESCAPED_UNICODE);
            return;
        }
        if (self::guardGenerate()) return;
        $count = max(3, min(12, (int) ($b['slideCount'] ?? 5)));
        $carousel = ($b['format'] ?? '') === '4:5';
        $t0 = microtime(true);
        $emit = self::sseStart();

        if (self::key() === '') {
            self::mockOutline($emit, $prompt, $count, $carousel);
            return;
        }
        try {
            $system = Prompts::OUTLINE . ($carousel ? Prompts::CAROUSEL : '');
            $text = self::complete($system, "주제: {$prompt}\nslideCount: {$count}", 2000);
            $sent = 0;
            foreach (explode("\n", $text) as $line) {
                $line = trim($line);
                if ($line === '') continue;
                $j = json_decode($line, true);
                if (is_array($j) && isset($j['title'])) {
                    $j['index'] = $sent;
                    $j['bullets'] = array_values(array_filter((array) ($j['bullets'] ?? []), 'is_string'));
                    $j['viz'] = is_array($j['viz'] ?? null) ? $j['viz'] : null;
                    $emit('slide', $j);
                    $sent++;
                    usleep(250000);
                }
            }
            if ($sent === 0) {
                $emit('error', ['message' => '아웃라인을 생성하지 못했습니다. 다시 시도해주세요.']);
                Admin::logEvent('outline', false, (int) ((microtime(true) - $t0) * 1000), $prompt, 'OutlineGenerationError');
            } else {
                $emit('done', []);
                Admin::logEvent('outline', true, (int) ((microtime(true) - $t0) * 1000), mb_substr($prompt, 0, 60));
            }
        } catch (Throwable $e) {
            $emit('error', ['message' => '아웃라인 생성 실패: ' . $e->getMessage()]);
            Admin::logEvent('outline', false, (int) ((microtime(true) - $t0) * 1000), $prompt, 'OutlineGenerationError');
        }
    }

    private static function mockOutline(callable $emit, string $prompt, int $count, bool $carousel): void
    {
        $topic = mb_strlen($prompt) > 24 ? mb_substr($prompt, 0, 24) . '…' : $prompt;
        for ($i = 0; $i < $count; $i++) {
            usleep(350000);
            $first = $i === 0;
            $last = $i === $count - 1;
            if ($carousel) {
                $emit('slide', [
                    'index' => $i,
                    'title' => $first ? "아직도 이렇게 하세요? {$topic}" : ($last ? '저장하고 오늘 하나만 해보세요' : ($i === 1 ? '대부분 여기서 실수합니다' : '핵심 아이디어 ' . ($i - 1))),
                    'bullets' => $first ? ["{$topic} — 3장이면 감 잡힙니다"] : ($last ? ['지금 바로: 첫 번째 항목부터', '팔로우하면 다음 편도 받아요'] : ['한 줄 포인트', '바로 써먹는 팁']),
                    'viz' => (!$first && !$last && $i === $count - 2) ? ['type' => 'kpi-cards', 'note' => '저장용 체크 카드'] : null,
                ]);
            } else {
                $vizPool = [null, ['type' => 'bar', 'note' => '연도별 시장 규모 성장 추이를 막대로 비교'], ['type' => 'kpi-cards', 'note' => '핵심 성과 지표 4개를 카드로 강조'], ['type' => 'line', 'note' => '월별 지표 변화 추세를 선으로 표현'], ['type' => 'pie', 'note' => '항목별 구성 비율을 원형으로 표현']];
                $emit('slide', [
                    'index' => $i,
                    'title' => $first ? $topic : ($last ? '마무리 및 제언' : "핵심 포인트 {$i}"),
                    'bullets' => $first ? ["\"{$topic}\" 주제 개요", '발표 목적과 기대 효과'] : ($last ? ['핵심 내용 요약', '다음 단계 제안', '질의응답'] : ["{$topic} 관련 근거 {$i}-1", "{$topic} 관련 근거 {$i}-2", '시사점과 적용 방안']),
                    'viz' => ($first || $last) ? null : $vizPool[$i % 5],
                ]);
            }
        }
        $emit('done', []);
    }

    // ── POST /slides (SSE, 슬라이드별 순차) ──
    public static function slides(): void
    {
        $b = self::body();
        $outline = $b['outline'] ?? null;
        if (!is_array($outline) || count($outline) < 1) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => '유효한 outline 배열이 필요합니다.'], JSON_UNESCAPED_UNICODE);
            return;
        }
        if (self::guardGenerate()) return;
        $carousel = ($b['format'] ?? '') === '4:5';
        $t0 = microtime(true);
        $emit = self::sseStart();
        $useMock = self::key() === '';
        $system = Prompts::SLIDES . ($carousel ? "\n\n[4:5 카드뉴스] 세로 캔버스다. title-bullets/kpi-cards/section을 우선하고, 텍스트는 짧게, 페이지 번호·발표자 정보는 절대 넣지 마라. 마지막 장은 section 레이아웃의 CTA로." : '');
        $outlineJson = json_encode($outline, JSON_UNESCAPED_UNICODE);
        $n = count($outline);
        $emitted = 0;

        foreach (array_values($outline) as $i => $item) {
            $item['index'] = $i;
            if ($useMock) {
                usleep(500000);
                $emit('slide-spec', self::mockSpec($item, $n));
                $emitted++;
                continue;
            }
            try {
                $pos = $i === 0 ? '첫' : ($i === $n - 1 ? '마지막' : '중간');
                $text = self::complete(
                    $system,
                    "전체 아웃라인(맥락 참고용):\n{$outlineJson}\n\n이번에 처리할 항목 (index {$i}):\n" . json_encode($item, JSON_UNESCAPED_UNICODE) . "\n\n전체 슬라이드 수: {$n} (index {$i}는 {$pos} 슬라이드)",
                    1500
                );
                $spec = json_decode($text, true);
                if (is_array($spec) && isset($spec['layout'], $spec['content'])) {
                    $spec['index'] = $i;
                    $emit('slide-spec', $spec);
                    $emitted++;
                } else {
                    $emit('slide-error', ['index' => $i, 'message' => '이 슬라이드 생성에 실패했습니다.']);
                }
            } catch (Throwable $e) {
                $emit('slide-error', ['index' => $i, 'message' => '이 슬라이드 생성에 실패했습니다.']);
                Admin::logError('SlideGenerationError', $e->getMessage());
            }
        }
        // Node 서버와 동일: 한 장도 성공 못하면 error 이벤트 + 실패 로깅
        if ($emitted === 0) {
            $emit('error', ['message' => '슬라이드를 생성하지 못했습니다. 다시 시도해주세요.']);
            Admin::logEvent('slides', false, (int) ((microtime(true) - $t0) * 1000), $n . '장', 'SlideGenerationError');
            return;
        }
        $emit('done', []);
        Admin::logEvent('slides', true, (int) ((microtime(true) - $t0) * 1000), $n . '장' . ($useMock ? ' (mock)' : ''));
    }

    private static function mockSpec(array $item, int $total): array
    {
        $i = (int) $item['index'];
        $bullets = array_values(array_filter((array) ($item['bullets'] ?? []), fn ($x) => is_string($x) && trim($x) !== ''));
        $viz = $item['viz']['type'] ?? null;
        $note = (string) ($item['viz']['note'] ?? '');
        $title = (string) ($item['title'] ?? '');
        $chart = function (string $t) use ($note, $title) {
            return $t === 'pie'
                ? ['chartType' => 'pie', 'title' => ($note ?: $title) . ' [예시]', 'labels' => ['항목 A', '항목 B', '항목 C', '기타'], 'series' => [['name' => '비율', 'values' => [42, 28, 18, 12]]]]
                : ['chartType' => $t, 'title' => ($note ?: $title) . ' [예시]', 'labels' => ['2023', '2024', '2025', '2026'], 'series' => [['name' => '지표', 'values' => [12, 19, 27, 38]]]];
        };
        if ($i === 0) return ['index' => $i, 'layout' => 'cover', 'content' => ['title' => $title, 'subtitle' => $bullets[0] ?? '', 'presenter' => 'DeckGen']];
        if ($i === $total - 1) return ['index' => $i, 'layout' => 'section', 'content' => ['title' => $title, 'subtitle' => $bullets[0] ?? '감사합니다']];
        if ($viz === 'bar' || $viz === 'line') return ['index' => $i, 'layout' => 'title-bullets-chart', 'content' => ['title' => $title, 'bullets' => $bullets, 'chart' => $chart($viz)]];
        if ($viz === 'pie') return ['index' => $i, 'layout' => 'chart-focus', 'content' => ['title' => $title, 'chart' => $chart('pie')]];
        if ($viz === 'kpi-cards') return ['index' => $i, 'layout' => 'kpi-cards', 'content' => ['title' => $title, 'kpis' => [['value' => '87%', 'label' => $bullets[0] ?? '지표 1'], ['value' => '3.2배', 'label' => $bullets[1] ?? '지표 2'], ['value' => '1.5억', 'label' => $bullets[2] ?? '지표 3']]]];
        return ['index' => $i, 'layout' => 'title-bullets', 'content' => ['title' => $title, 'bullets' => $bullets]];
    }

    // ── POST /edit ──
    public static function edit(): void
    {
        if (Admin::isMaintenance()) {
            http_response_code(503);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => '점검 중입니다. 잠시 후 다시 시도해주세요.'], JSON_UNESCAPED_UNICODE);
            return;
        }
        $t0 = microtime(true);
        header('Content-Type: application/json; charset=utf-8');
        $b = self::body();
        $instruction = trim((string) ($b['instruction'] ?? ''));
        $slide = $b['slide'] ?? null;
        if ($instruction === '' || !is_array($slide) || !isset($slide['id'], $slide['elements'])) {
            http_response_code(400);
            echo json_encode(['error' => '유효한 요청이 아닙니다.'], JSON_UNESCAPED_UNICODE);
            return;
        }
        // 폴백 체인: 선택 모델 → anthropic 주력 → openai_chat → gemini_text (키 있는 것만)
        $chain = [];
        $sel = trim((string) ($b['model'] ?? ''));
        if ($sel !== '') $chain[] = $sel;
        if (self::key() !== '') $chain[] = self::model();
        if (trim((string) Db::cfg('openai_api_key', '')) !== '' && trim((string) Db::cfg('openai_chat_model', '')) !== '') $chain[] = trim((string) Db::cfg('openai_chat_model', ''));
        if (trim((string) Db::cfg('gemini_api_key', '')) !== '' && trim((string) Db::cfg('gemini_text_model', '')) !== '') $chain[] = trim((string) Db::cfg('gemini_text_model', ''));
        $chain = array_values(array_unique($chain));

        if (count($chain) === 0) {
            echo json_encode(['slide' => self::mockEdit($slide, $instruction), 'model' => 'mock'], JSON_UNESCAPED_UNICODE);
            return;
        }
        $user = '테마 요약: ' . json_encode($b['theme'] ?? [], JSON_UNESCAPED_UNICODE)
            . "\n\n현재 슬라이드:\n" . json_encode($slide, JSON_UNESCAPED_UNICODE)
            . "\n\n사용자 지시: {$instruction}";
        foreach ($chain as $model) {
            try {
                $text = self::complete(Prompts::EDIT, $user, 2000, $model);
                $edited = json_decode($text, true);
                if (!is_array($edited) || !isset($edited['elements'])) throw new RuntimeException('스키마 불일치');
                $edited['id'] = $slide['id'];
                Admin::logEvent('edit', true, (int) ((microtime(true) - $t0) * 1000), mb_substr($instruction, 0, 50) . ' · ' . $model);
                echo json_encode(['slide' => $edited, 'model' => $model], JSON_UNESCAPED_UNICODE);
                return;
            } catch (Throwable $e) {
                // 다음 모델로 폴백
            }
        }
        Admin::logEvent('edit', false, (int) ((microtime(true) - $t0) * 1000), mb_substr($instruction, 0, 50), 'MagicEditError');
        http_response_code(502);
        echo json_encode(['error' => 'AI 수정에 실패했습니다. 다시 시도해주세요.'], JSON_UNESCAPED_UNICODE);
    }

    // ── POST /ai-image (Demo Act 5.5 AI 이미지) — openai_api_key/openai_model. 키 없거나 실패 시 501/502 → 클라 그라디언트 대체 ──
    public static function aiImage(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        $b = self::body();
        $prompt = trim((string) ($b['prompt'] ?? ''));
        if ($prompt === '') {
            http_response_code(400);
            echo json_encode(['error' => 'prompt가 필요합니다.'], JSON_UNESCAPED_UNICODE);
            return;
        }
        $key = trim((string) Db::cfg('openai_api_key', ''));
        $model = trim((string) Db::cfg('openai_model', ''));
        if ($key === '' || $model === '') {
            http_response_code(501);
            echo json_encode(['error' => 'AI 이미지 키가 설정되지 않았습니다.'], JSON_UNESCAPED_UNICODE);
            return;
        }
        $size = is_string($b['size'] ?? null) ? $b['size'] : '1024x1024';
        try {
            $ch = curl_init('https://api.openai.com/v1/images/generations');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 120,
                CURLOPT_POST => true,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $key],
                // gpt-image 계열은 response_format 미지원(b64_json 기본 반환) → 파라미터 생략
                CURLOPT_POSTFIELDS => json_encode(['model' => $model, 'prompt' => $prompt, 'n' => 1, 'size' => $size], JSON_UNESCAPED_UNICODE),
            ]);
            $res = curl_exec($ch);
            $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            if ($res === false) throw new RuntimeException('curl: ' . curl_error($ch));
            if ($code < 200 || $code >= 300) throw new RuntimeException('OpenAI ' . $code . ': ' . substr((string) $res, 0, 300));
            $j = json_decode((string) $res, true);
            $item = $j['data'][0] ?? null;
            $image = !empty($item['b64_json']) ? 'data:image/png;base64,' . $item['b64_json'] : (string) ($item['url'] ?? '');
            if ($image === '') throw new RuntimeException('이미지 응답이 비었습니다.');
            Admin::logEvent('regen', true, 0, 'AI 이미지 · ' . mb_substr($prompt, 0, 40));
            echo json_encode(['image' => $image], JSON_UNESCAPED_UNICODE);
        } catch (Throwable $e) {
            http_response_code(502);
            echo json_encode(['error' => '이미지 생성에 실패했습니다.'], JSON_UNESCAPED_UNICODE);
        }
    }

    private static function mockEdit(array $slide, string $instruction): array
    {
        $lower = mb_strtolower($instruction);
        foreach ($slide['elements'] as $i => $el) {
            $type = $el['type'] ?? '';
            if ($type === 'chart' && (str_contains($lower, '파이') || str_contains($lower, 'pie'))) {
                $slide['elements'][$i]['chartType'] = 'pie';
            } elseif ($type === 'chart' && (str_contains($lower, '막대') || str_contains($lower, 'bar'))) {
                $slide['elements'][$i]['chartType'] = 'bar';
            } elseif ($type === 'text' && in_array($el['role'] ?? '', ['title', 'heading'], true) && str_contains($lower, '제목')) {
                $slide['elements'][$i]['text'] = preg_replace('/[!?.]+$/u', '', $el['text']) . ' — 지금이 기회다!';
            } elseif ($type === 'text' && ($el['role'] ?? '') === 'body' && str_contains($lower, '불릿') && str_contains($lower, '추가')) {
                $slide['elements'][$i]['text'] = $el['text'] . "\n•  (모의) 새로 추가된 불릿 항목";
            }
        }
        return $slide;
    }
}
