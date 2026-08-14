import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'kibble-clash',
  brand: {
    primaryColor: '#FFC83D',
  },
  webView: {
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
  webBundleDir: 'dist/web',
});
