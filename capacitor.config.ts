import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.lexiday.app',
  appName: '词序',
  webDir: 'dist-local',
  server: { androidScheme: 'https' },
  android: { backgroundColor: '#f7f8fa' }
};
export default config;
