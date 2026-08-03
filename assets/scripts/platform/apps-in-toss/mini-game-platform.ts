import { setDeviceOrientation } from '@apps-in-toss/web-framework';

export type Orientation = 'landscape' | 'portrait';

export interface MiniGamePlatform {
  readonly environment: 'browser' | 'apps-in-toss';
  supportsOrientationChange(): boolean;
  requestOrientation(orientation: Orientation): Promise<boolean>;
  requestExitConfirmation(message: string): Promise<boolean>;
}

export class BrowserMiniGamePlatform implements MiniGamePlatform {
  readonly environment = 'browser' as const;

  supportsOrientationChange(): boolean {
    return false;
  }

  async requestOrientation(_orientation: Orientation): Promise<boolean> {
    return false;
  }

  async requestExitConfirmation(message: string): Promise<boolean> {
    return window.confirm(message);
  }
}

export async function requestInitialLandscape(): Promise<boolean> {
  try {
    await setDeviceOrientation({ type: 'landscape' });
    return true;
  } catch {
    // 일반 브라우저에는 Apps in Toss 네이티브 브리지가 없으므로
    // CSS 기반 가로 프리뷰를 그대로 사용한다.
    return false;
  }
}

export function setupGameOrientation(): () => void {
  let restored = false;
  void requestInitialLandscape();

  return () => {
    if (restored) return;
    restored = true;
    void setDeviceOrientation({ type: 'portrait' }).catch(() => {
      // Local browsers do not provide the Apps in Toss native bridge.
    });
  };
}
