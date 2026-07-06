// 상단바/줌 툴바에서 현재 캔버스를 제어하기 위한 얇은 레지스트리
export interface CanvasApi {
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
}

let current: CanvasApi | null = null;

export function registerCanvasApi(api: CanvasApi | null): void {
  current = api;
}

export function canvasApi(): CanvasApi | null {
  return current;
}
