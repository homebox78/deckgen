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
        return trim((string) Db::cfg('anthropic_model', 'claude-sonnet-4-6'));
    }

    /** Anthropic 단건 호출 → 텍스트 (스트리밍 없음 — 배포판 단순화) */
    private static function complete(string $system, string $user, int $maxTokens): string
    {
        $ch = curl_init('https://api.anthropic.com/v1/messages');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 120,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'x-api-key: ' . self::key(),
                'anthropic-version: 2023-06-01',
            ],
            CURLOPT_POSTFIELDS => json_encode([
                'model' => self::model(),
                'max_tokens' => $maxTokens,
                'system' => $system,
                'messages' => [['role' => 'user', 'content' => $user]],
            ], JSON_UNESCAPED_UNICODE),
        ]);
        $res = curl_exec($ch);
        if ($res === false) throw new RuntimeException('Anthropic 호출 실패: ' . curl_error($ch));
        $j = json_decode($res, true);
        $text = '';
        foreach (($j['content'] ?? []) as $blk) {
            if (($blk['type'] ?? '') === 'text') $text .= $blk['text'];
        }
        if ($text === '') throw new RuntimeException('빈 응답: ' . substr($res, 0, 200));
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
        $count = max(3, min(12, (int) ($b['slideCount'] ?? 5)));
        $carousel = ($b['format'] ?? '') === '4:5';
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
            if ($sent === 0) $emit('error', ['message' => '아웃라인을 생성하지 못했습니다. 다시 시도해주세요.']);
            else $emit('done', []);
        } catch (Throwable $e) {
            $emit('error', ['message' => '아웃라인 생성 실패: ' . $e->getMessage()]);
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
        $carousel = ($b['format'] ?? '') === '4:5';
        $emit = self::sseStart();
        $useMock = self::key() === '';
        $system = Prompts::SLIDES . ($carousel ? "\n\n[4:5 카드뉴스] 세로 캔버스다. title-bullets/kpi-cards/section을 우선하고, 텍스트는 짧게, 페이지 번호·발표자 정보는 절대 넣지 마라. 마지막 장은 section 레이아웃의 CTA로." : '');
        $outlineJson = json_encode($outline, JSON_UNESCAPED_UNICODE);
        $n = count($outline);

        foreach (array_values($outline) as $i => $item) {
            $item['index'] = $i;
            if ($useMock) {
                usleep(500000);
                $emit('slide-spec', self::mockSpec($item, $n));
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
                } else {
                    $emit('slide-error', ['index' => $i, 'message' => '이 슬라이드 생성에 실패했습니다.']);
                }
            } catch (Throwable $e) {
                $emit('slide-error', ['index' => $i, 'message' => '이 슬라이드 생성에 실패했습니다.']);
            }
        }
        $emit('done', []);
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
        header('Content-Type: application/json; charset=utf-8');
        $b = self::body();
        $instruction = trim((string) ($b['instruction'] ?? ''));
        $slide = $b['slide'] ?? null;
        if ($instruction === '' || !is_array($slide) || !isset($slide['id'], $slide['elements'])) {
            http_response_code(400);
            echo json_encode(['error' => '유효한 요청이 아닙니다.'], JSON_UNESCAPED_UNICODE);
            return;
        }
        if (self::key() === '') {
            echo json_encode(['slide' => self::mockEdit($slide, $instruction)], JSON_UNESCAPED_UNICODE);
            return;
        }
        try {
            $text = self::complete(
                Prompts::EDIT,
                '테마 요약: ' . json_encode($b['theme'] ?? [], JSON_UNESCAPED_UNICODE)
                . "\n\n현재 슬라이드:\n" . json_encode($slide, JSON_UNESCAPED_UNICODE)
                . "\n\n사용자 지시: {$instruction}",
                2000
            );
            $edited = json_decode($text, true);
            if (!is_array($edited) || !isset($edited['elements'])) throw new RuntimeException('스키마 불일치');
            $edited['id'] = $slide['id'];
            echo json_encode(['slide' => $edited], JSON_UNESCAPED_UNICODE);
        } catch (Throwable $e) {
            http_response_code(502);
            echo json_encode(['error' => 'AI 수정에 실패했습니다. 다시 시도해주세요.'], JSON_UNESCAPED_UNICODE);
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
