// Firebase Cloud Messaging Service Worker
// Listens for background notifications when the app is closed or tab is inactive.

/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Config will be populated dynamically or fallback to client config
const firebaseConfig = {
  apiKey: "AIzaSyDummyKeyForCampusFlowLocalDev",
  authDomain: "campusflow-fcm.firebaseapp.com",
  projectId: "campusflow-fcm",
  storageBucket: "campusflow-fcm.appspot.com",
  messagingSenderId: "100000000000",
  appId: "1:100000000000:web:abcdef123456"
};

try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message: ', payload);
    const notificationTitle = payload.notification?.title || 'RoomMate Alert';
    const notificationOptions = {
      body: payload.notification?.body || 'New update in your room ledger',
      icon: '/favicon.png',
      badge: '/favicon.png',
      tag: payload.data?.tag || 'roommate-alert',
      data: payload.data || {},
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
} catch (e) {
  console.warn('[firebase-messaging-sw.js] Initialization warning:', e);
}

// Click listener to refocus or open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
