// 관리자 콘솔 데이터 저장소 (Node dev = 파일 기반 server/data/admin/*.json)
// PHP 운영판은 동일 계약을 MySQL 테이블로 구현 (§14)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(process.cwd(), "data/admin");

function file(name: string): string {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  return path.join(DIR, name);
}

function load<T>(name: string, fallback: T): T {
  try {
    const p = file(name);
    if (!existsSync(p)) return fallback;
    return JSON.parse(readFileSync(p, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function save(name: string, data: unknown): void {
  writeFileSync(file(name), JSON.stringify(data, null, 2), "utf-8");
}

// ===== 서비스 설정 =====
export interface AppSettings {
  signupAllowed: boolean; // 표시용 (계정 시스템 2차)
  freeDailyLimit: number; // IP당 일일 생성 한도
  maintenance: boolean; // 점검 모드 — 생성 3종 503
  genModel: string; // 생성 모델 오버라이드 ("" = config 기본)
  aiImageEnabled: boolean; // 유료 AI 이미지 생성 허용(기본 OFF, 비용 사고 방지)
}

const DEFAULT_SETTINGS: AppSettings = {
  signupAllowed: true,
  freeDailyLimit: 20,
  maintenance: false,
  genModel: "",
  aiImageEnabled: false,
};

export function getSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...load<Partial<AppSettings>>("settings.json", {}) };
}

export function patchSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch };
  save("settings.json", next);
  return next;
}

// ===== 배너 =====
export interface Banner {
  id: string;
  type: "info" | "warn" | "maint";
  text: string;
  on: boolean;
  createdAt: number;
}

export function getBanners(): Banner[] {
  return load<Banner[]>("banners.json", []);
}

export function setBanners(list: Banner[]): void {
  save("banners.json", list);
}

// ===== 템플릿 (홈 스토리보드 갤러리) =====
export interface TemplateMeta {
  id: string; // wireframes.ts 라이브러리 id
  name: string;
  on: boolean;
  pro: boolean;
  uses: number;
}

export function getTemplates(): TemplateMeta[] {
  return load<TemplateMeta[]>("templates.json", []);
}

export function setTemplates(list: TemplateMeta[]): void {
  save("templates.json", list);
}

// ===== 이벤트 (생성/내보내기/오류 — 대시보드·작업 큐 실데이터) =====
export interface AppEvent {
  ts: number;
  kind: "outline" | "slides" | "edit" | "export" | "import" | "regen";
  ok: boolean;
  ms: number;
  meta?: string; // 덱 제목·모델 등
  err?: string; // 오류 타입 (실패 시)
}

export function logEvent(ev: AppEvent): void {
  const list = load<AppEvent[]>("events.json", []);
  list.push(ev);
  // 최근 2000건만 유지
  save("events.json", list.slice(-2000));
}

export function getEvents(): AppEvent[] {
  return load<AppEvent[]>("events.json", []);
}

// ===== 오류 그룹 =====
export interface ErrorGroup {
  id: string;
  type: string;
  msg: string;
  count: number;
  lastAt: number;
  resolved: boolean;
}

export function logError(type: string, msg: string): void {
  const list = load<ErrorGroup[]>("errors.json", []);
  const found = list.find((e) => e.type === type && !e.resolved);
  if (found) {
    found.count++;
    found.lastAt = Date.now();
    found.msg = msg;
  } else {
    list.push({
      id: Math.random().toString(36).slice(2, 10),
      type,
      msg,
      count: 1,
      lastAt: Date.now(),
      resolved: false,
    });
  }
  save("errors.json", list.slice(-200));
}

export function getErrors(): ErrorGroup[] {
  return load<ErrorGroup[]>("errors.json", []);
}

export function resolveError(id: string): void {
  const list = load<ErrorGroup[]>("errors.json", []);
  const found = list.find((e) => e.id === id);
  if (found) found.resolved = true;
  save("errors.json", list);
}

// ===== 감사 로그 (append-only) =====
export interface AuditEntry {
  ts: number;
  actor: string;
  cat: "auth" | "user" | "settings" | "data" | "banner" | "template";
  action: string;
  detail: string;
  ip: string;
}

export function logAudit(entry: AuditEntry): void {
  const list = load<AuditEntry[]>("audit.json", []);
  list.push(entry);
  save("audit.json", list.slice(-5000));
}

export function getAudit(): AuditEntry[] {
  return load<AuditEntry[]>("audit.json", []);
}

// ===== 차단 사용자 (협업 참여자 이름 기준) =====
export function getBlocked(): string[] {
  return load<string[]>("blocked.json", []);
}

export function setBlocked(list: string[]): void {
  save("blocked.json", list);
}
