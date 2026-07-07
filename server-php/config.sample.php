<?php
/** 서버 실값은 api/config.php 로 배치 (git 제외) — 이 파일은 견본 */
return [
    'host' => 'localhost',
    'port' => 3306,
    'db'   => 'deckGen',
    'user' => '<DB_USER>',
    'pass' => '<DB_PASS>',
    // AI — 비우면 모의(mock) 모드로 동작
    'anthropic_api_key' => '',
    'anthropic_model'   => 'claude-sonnet-4-6',
];
