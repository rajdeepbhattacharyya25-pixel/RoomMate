import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.campusflow.app',
  appName: 'CampusFlow',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: '#0a0e17',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      overlaysWebView: true,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    LocalNotifications: {
      iconColor: '#6366F1',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
