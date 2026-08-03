import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'kibble-clash',
  brand: {
    displayName: '멍밥쟁탈전',
    primaryColor: '#FFC83D',
    icon: '/ui/kibble-clash-app-icon.png',
  },
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite --host',
      build: 'vite build --config vite.config.ts',
    },
  },
  webViewProps: {
    type: 'game',
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: 'never',
    allowsBackForwardNavigationGestures: false,
  },
  navigationBar: {
    withBackButton: false,
    withHomeButton: false,
    withTitle: false,
    transparentBackground: true,
    theme: 'light',
  },
  permissions: [],
  outdir: 'dist',
});
