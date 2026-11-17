import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.spara.education',
  appName: 'Spara',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    backgroundColor: '#F4F5F7',
  },
};

export default config;
