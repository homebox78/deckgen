<?php
/** PDO 싱글턴 + 스키마 보장 (hom2box.com MariaDB) */
final class Db
{
    private static ?PDO $pdo = null;
    private static array $cfg = [];

    public static function cfg(string $key, $default = null)
    {
        if (!self::$cfg) {
            self::$cfg = require __DIR__ . '/../config.php';
        }
        $env = getenv(strtoupper($key));
        return $env !== false ? $env : (self::$cfg[$key] ?? $default);
    }

    public static function pdo(): PDO
    {
        if (self::$pdo === null) {
            $dsn = sprintf(
                'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
                self::cfg('host', 'localhost'),
                (int) self::cfg('port', 3306),
                self::cfg('db', 'deckGen')
            );
            self::$pdo = new PDO($dsn, self::cfg('user'), self::cfg('pass'), [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            self::ensureSchema();
        }
        return self::$pdo;
    }

    private static function ensureSchema(): void
    {
        self::$pdo->exec(
            'CREATE TABLE IF NOT EXISTS decks (
                id VARCHAR(64) PRIMARY KEY,
                title TEXT,
                json LONGTEXT NOT NULL,
                rev INT NOT NULL DEFAULT 1,
                edit_token VARCHAR(40) NOT NULL,
                view_token VARCHAR(40) NOT NULL,
                updated_at BIGINT NOT NULL,
                KEY idx_edit (edit_token), KEY idx_view (view_token)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );
        self::$pdo->exec(
            'CREATE TABLE IF NOT EXISTS deck_updates (
                id INT AUTO_INCREMENT PRIMARY KEY,
                deck_id VARCHAR(64) NOT NULL,
                rev INT NOT NULL,
                kind VARCHAR(8) NOT NULL,
                origin VARCHAR(64) NOT NULL,
                payload LONGTEXT NOT NULL,
                created_at BIGINT NOT NULL,
                KEY idx_deck (deck_id, id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );
        self::$pdo->exec(
            'CREATE TABLE IF NOT EXISTS presence (
                deck_id VARCHAR(64) NOT NULL,
                client_id VARCHAR(64) NOT NULL,
                name VARCHAR(60) NOT NULL,
                color VARCHAR(16) NOT NULL,
                slide_index INT NOT NULL DEFAULT 0,
                ts BIGINT NOT NULL,
                PRIMARY KEY (deck_id, client_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );
    }
}
