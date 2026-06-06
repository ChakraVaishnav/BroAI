/**
 * Google OAuth routes
 * GET /auth/google        → redirect user to Google consent screen
 * GET /auth/google/callback → exchange code for tokens, deep-link back to app
 */
import express from "express";
import { google } from "googleapis";

const router = express.Router();

// Cache to handle Chrome double-fetching the callback URL
const codeCache = new Map();

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// ── Step 1: Redirect to Google ─────────────────────────────────────────────
router.get("/google", (req, res) => {
  const { redirect } = req.query;
  const oauth2Client = getOAuth2Client();

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",   // ensures we get a refresh_token
    prompt: "consent",        // forces Google to always return refresh_token
    state: redirect,          // pass the app's deep link base URL through
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/calendar",
    ],
  });

  res.redirect(url);
});

// ── Step 2: Handle Google callback ────────────────────────────────────────
router.get("/google/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.send(`
      <html>
        <body style="font-family:sans-serif;text-align:center;padding:50px;background:#111;color:#fff">
          <h2>❌ Google authentication failed</h2>
          <p>${error || "No code received"}</p>
          <p>Please close this tab and try again in the BroAI app.</p>
        </body>
      </html>
    `);
  }

  // If we already successfully processed this code recently (e.g. Chrome pre-fetch),
  // return the cached success page to prevent invalid_grant on the second request.
  if (codeCache.has(code)) {
    console.log("[Auth] Code already processed recently. Returning cached success page.");
    return res.send(codeCache.get(code));
  }

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      // This happens if the user already granted access before — Google only
      // returns refresh_token on the first consent. We already have one stored.
      return res.send(`
        <html>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: center; padding: 50px; background: #0a0a0a; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0;">
            <div style="background: rgba(255,255,255,0.05); padding: 40px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.1); max-width: 400px;">
              <h2 style="margin-bottom: 16px; font-weight: 600;">⚠️ No new refresh token</h2>
              <p style="color: #a1a1aa; line-height: 1.6; margin-bottom: 24px;">Google did not issue a new refresh token. Your existing token is still valid.</p>
              <p style="color: #a1a1aa; font-size: 14px;">If you are having issues, revoke access at <a href="https://myaccount.google.com/permissions" style="color: #3b82f6; text-decoration: none;">myaccount.google.com/permissions</a> and try again.</p>
            </div>
          </body>
        </html>
      `);
    }

    const refreshToken = tokens.refresh_token;
    
    // The state parameter contains the deep link base (e.g. exp://192.168.1.36:8081/--/auth or broai://auth)
    const redirectBase = req.query.state || "broai://auth";
    const deepLink = `${redirectBase}?refresh_token=${encodeURIComponent(refreshToken)}`;

    // Show a sleek redirect page
    const successHtml = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>BroAI – Connected</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
              background-color: #050505;
              color: #ffffff;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              overflow: hidden;
            }
            .glow {
              position: absolute;
              width: 300px;
              height: 300px;
              background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(0, 0, 0, 0) 70%);
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              z-index: 0;
            }
            .card {
              position: relative;
              z-index: 1;
              background: rgba(25, 25, 25, 0.6);
              backdrop-filter: blur(20px);
              -webkit-backdrop-filter: blur(20px);
              border: 1px solid rgba(255, 255, 255, 0.08);
              padding: 48px 40px;
              border-radius: 24px;
              text-align: center;
              max-width: 360px;
              width: 100%;
              box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
              animation: fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .icon-wrapper {
              width: 72px;
              height: 72px;
              background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0 auto 24px;
              box-shadow: 0 0 24px rgba(34, 197, 94, 0.3);
            }
            .icon {
              color: white;
              font-size: 32px;
              line-height: 1;
            }
            h1 {
              font-size: 24px;
              font-weight: 600;
              margin-bottom: 12px;
              letter-spacing: -0.5px;
            }
            p {
              color: #a1a1aa;
              font-size: 15px;
              line-height: 1.6;
              margin-bottom: 32px;
            }
            .btn {
              display: block;
              width: 100%;
              background: #ffffff;
              color: #000000;
              font-weight: 600;
              font-size: 15px;
              padding: 16px 24px;
              border-radius: 12px;
              text-decoration: none;
              transition: transform 0.2s ease, opacity 0.2s ease;
            }
            .btn:active {
              transform: scale(0.98);
              opacity: 0.9;
            }
            @keyframes fadeUp {
              0% { opacity: 0; transform: translateY(20px); }
              100% { opacity: 1; transform: translateY(0); }
            }
          </style>
        </head>
        <body>
          <div class="glow"></div>
          <div class="card">
            <div class="icon-wrapper">
              <div class="icon">✓</div>
            </div>
            <h1>Google Connected</h1>
            <p>Authentication successful. You can now securely use Gmail and Calendar via BroAI.</p>
            <a href="${deepLink}" class="btn">Return to App</a>
          </div>
        </body>
      </html>
    `;
    
    codeCache.set(code, successHtml);
    setTimeout(() => codeCache.delete(code), 60000); // Clear after 60s
    
    return res.send(successHtml);
  } catch (err) {
    console.error("[Auth] Google callback error:", err);
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: center; padding: 50px; background: #0a0a0a; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0;">
          <div style="background: rgba(255,255,255,0.05); padding: 40px; border-radius: 24px; border: 1px solid rgba(255,0,0,0.2); max-width: 400px;">
            <h2 style="margin-bottom: 16px; font-weight: 600; color: #ef4444;">❌ Error exchanging token</h2>
            <p style="color: #a1a1aa; line-height: 1.6; margin-bottom: 24px;">${err.message}</p>
            <p style="color: #a1a1aa; font-size: 14px;">Please close this tab and try again in the BroAI app.</p>
          </div>
        </body>
      </html>
    `);
  }
});

export default router;
