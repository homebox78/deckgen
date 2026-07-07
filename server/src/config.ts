import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * 키 관리 단일 소스 = server/config/config.php (git 제외).
 * PHP 배열의 스칼라 항목('key' => 값)을 읽어 process.env[KEY 대문자]로 주입한다.
 * 이미 설정된 환경변수(.env 포함)가 있으면 그쪽이 우선 — PHP(Db::cfg)와 동일 규칙.
 */
export function loadConfigPhp(): void {
  const candidates = [
    path.resolve(process.cwd(), "config/config.php"), // server/에서 실행 시
    path.resolve(process.cwd(), "server/config/config.php"), // 루트에서 실행 시
  ];
  const file = candidates.find((p) => existsSync(p));
  if (!file) return;

  const re = /^'(\w+)'\s*=>\s*(?:'((?:[^'\\]|\\.)*)'|(\d+)|(true|false))\s*,/;
  // DB 접속용 제네릭 키는 PHP 전용 — PORT 등 Node 표준 env와 충돌 방지(Express가 3306에 뜨는 사고)
  const skip = new Set(["host", "port", "db", "user", "pass"]);
  for (const raw of readFileSync(file, "utf-8").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("//") || line.startsWith("#") || line.startsWith("*")) continue; // 주석 제외
    const m = re.exec(line);
    if (!m || skip.has(m[1])) continue;
    const envKey = m[1].toUpperCase();
    if (process.env[envKey] !== undefined) continue; // 환경변수 우선
    const value = (m[2] !== undefined ? m[2].replace(/\\(.)/g, "$1") : (m[3] ?? m[4]))?.trim();
    if (value !== undefined && value !== "") process.env[envKey] = value;
  }
}
