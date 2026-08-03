export interface AnalyticsEvent {
  name: string;
  properties?: Record<string, string | number | boolean>;
}

export interface AnalyticsPort {
  track(event: AnalyticsEvent): void;
}

export class NoopAnalytics implements AnalyticsPort {
  track(_event: AnalyticsEvent): void {
    // MVP에서는 외부 분석 도구를 연결하지 않는다.
  }
}
