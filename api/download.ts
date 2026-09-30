import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Vercel Serverless Function: /api/download
 * 
 * Production APK direct-download endpoint for RoomMate.
 * 
 * Behaviors:
 * 1. Android & Desktop: Redirects (302) to /RoomMate-v1.0.4-prod.apk with
 *    attachment headers (Content-Disposition: attachment; filename="RoomMate-v1.0.4-prod.apk")
 *    so the mobile browser immediately initiates the APK file download.
 * 2. iOS (iPhone / iPad / iPod): Redirects (302) to /?view=mobile so iOS users
 *    get the responsive mobile web app shell (since Android APKs cannot run on iOS).
 */

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(userAgent);

  // If user is on iOS, APK cannot be installed, redirect to mobile web app view
  if (isIOS) {
    res.writeHead(302, {
      Location: 'https://roommate26.vercel.app/?view=mobile',
      'Cache-Control': 'no-cache',
    });
    res.end();
    return;
  }

  // For Android and Desktop, redirect directly to the latest production APK
  // with attachment headers so the browser immediately downloads it.
  res.writeHead(302, {
    Location: 'https://roommate26.vercel.app/RoomMate-v1.0.4-prod.apk',
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Disposition': 'attachment; filename="RoomMate-v1.0.4-prod.apk"',
    'Cache-Control': 'public, max-age=3600',
  });
  res.end();
}
