/**
 * Cloudflare Email Routing Worker: UptimeRobot Email-to-Webhook Bridge
 * 
 * Free-Tier Compliant Architecture:
 * - Listens to incoming UptimeRobot alert emails delivered via Cloudflare Email Routing.
 * - Extracts outage status (DOWN / UP), monitor name, and timestamp.
 * - Dispatches a secured webhook to RoomMate's /api/uptime-webhook endpoint.
 * - 100% Free: Cloudflare Email Routing and Workers have generous free tiers (100k requests/day).
 * 
 * Deployment Instructions:
 * 1. Go to Cloudflare Dashboard -> Workers & Pages -> Create Application -> Create Worker.
 * 2. Paste this file into the Cloudflare Worker editor.
 * 3. In Worker Settings -> Variables -> Environment Variables:
 *    - Add `ROOMMATE_WEBHOOK_URL` = "https://roommate26.vercel.app/api/uptime-webhook"
 *    - Add `UPTIME_WEBHOOK_SECRET` = "<your-configured-webhook-secret>"
 * 4. Go to Cloudflare Dashboard -> Email Routing -> Routing Rules:
 *    - Create an address (e.g. `alerts@yourdomain.com`).
 *    - Set Action: "Send to a Worker" -> Select this Worker.
 * 5. In UptimeRobot Dashboard:
 *    - Add an Email Alert Contact with `alerts@yourdomain.com`.
 *    - Verify the confirmation email.
 */

export default {
  async email(message, env, ctx) {
    try {
      const subject = message.headers.get('subject') || '';
      const rawBody = await new Response(message.raw).text();

      // Detect Event Type from Subject or Content
      let event = 'DOWN';
      if (/is\s+UP|Monitor\s+is\s+UP|Operational/i.test(subject) || /is\s+UP/i.test(rawBody)) {
        event = 'UP';
      } else if (/is\s+DOWN|outage|offline/i.test(subject) || /is\s+DOWN/i.test(rawBody)) {
        event = 'DOWN';
      }

      // Extract Monitor Name
      let monitorName = 'RoomMate Service';
      const monitorMatch = subject.match(/Monitor\s+is\s+(?:DOWN|UP):\s*(.+)/i) || 
                           subject.match(/(.+?)\s+is\s+(?:DOWN|UP)/i);
      if (monitorMatch && monitorMatch[1]) {
        monitorName = monitorMatch[1].trim();
      }

      const webhookUrl = env.ROOMMATE_WEBHOOK_URL || 'https://roommate26.vercel.app/api/uptime-webhook';
      const secret = env.UPTIME_WEBHOOK_SECRET;

      if (!secret) {
        console.error('UPTIME_WEBHOOK_SECRET environment variable is not configured');
        return;
      }

      const payload = {
        event,
        monitorName,
        url: webhookUrl.replace('/api/uptime-webhook', ''),
        reason: `Processed from email: ${subject}`,
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': secret,
          'User-Agent': 'Cloudflare-Email-To-Webhook/1.0',
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      console.log(`[Email-to-Webhook] Dispatched ${event} for "${monitorName}". HTTP ${response.status}: ${responseText}`);
    } catch (err) {
      console.error('[Email-to-Webhook] Error processing incoming alert email:', err);
    }
  }
};
