// 상단바/줌 툴바에서 현재 캔버스를 제어하기 위한 얇은 레지스트리
export type AlignDir = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type DistDir = "h" | "v";

export interface CanvasApi {
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  /** 선택된 요소 정렬 (1개=슬라이드 기준, 2+=선택 묶음 기준) */
  align(dir: AlignDir): void;
  /** 3+ 요소 균등 분배 */
  distribute(dir: DistDir): void;
  /** 현재 선택 요소 수 */
  selectionCount(): number;
}

let current: CanvasApi | null = null;

export function registerCanvasApi(api: CanvasApi | null): void {
  current = api;
}

export function canvasApi(): CanvasApi | null {
  return current;
}
