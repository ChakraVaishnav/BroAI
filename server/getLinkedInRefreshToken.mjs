import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables manually
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), ".env");
let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

const getEnv = (key) => {
  const match = envContent.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim() : null;
};

const CLIENT_ID = getEnv("LINKEDIN_CLIENT_ID");
const CLIENT_SECRET = getEnv("LINKEDIN_CLIENT_SECRET");
const REDIRECT_URI = getEnv("LINKEDIN_REDIRECT_URI") || "http://localhost:8181";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌ Missing LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET in .env");
  process.exit(1);
}

// Scopes: openid + profile (to auto-fetch the ALPHANUMERIC ID) + w_member_social (for posting)
const SCOPES = ["openid", "profile", "w_member_social"].join("%20");
const STATE = "broai_" + Math.random().toString(36).slice(2);

const authUrl =
  `https://www.linkedin.com/oauth/v2/authorization?` +
  `response_type=code&` +
  `client_id=${CLIENT_ID}&` +
  `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
  `scope=${SCOPES}&` +
  `state=${STATE}`;

console.log("\n🔗 Please copy and paste this URL into your browser to authorize:");
console.log("\n" + authUrl + "\n");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:8181");

  if (url.pathname === "/") {
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const errorDesc = url.searchParams.get("error_description");

    if (error) {
      console.error(`\n❌ Authorization failed: ${error} - ${errorDesc}`);
      res.end(`<h1>Auth Failed</h1><p>${error}: ${errorDesc}</p>`);
      process.exit(1);
    }

    if (code) {
      res.end("<h1>Success!</h1><p>You can close this window and return to the terminal.</p>");
      console.log("══════════════════════════════════════════════════════");
      console.log("🔄 Exchanging code for access and refresh tokens...");

      try {
        const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
          }),
        });

        const tokenData = await tokenRes.json();

        if (tokenData.error) {
          throw new Error(`${tokenData.error} - ${tokenData.error_description}`);
        }

        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;

        if (!refreshToken) {
          console.error("⚠️  LinkedIn did not return a refresh token! Your app might not be configured to support them.");
        } else {
           console.log("✅ Successfully retrieved 1-Year Refresh Token!");
        }

        // Fetch Person ID using OpenID
        let personId = getEnv("LINKEDIN_PERSON_ID");
        try {
          const uiRes = await fetch("https://api.linkedin.com/v2/userinfo", {
            headers: { Authorization: "Bearer " + accessToken },
          });
          if (uiRes.ok) {
            const uiData = await uiRes.json();
            if (uiData.sub) personId = uiData.sub;
          }
        } catch (e) {
          console.log("⚠️  Could not auto-fetch person ID, keeping old one.");
        }

        // Update .env
        let newEnv = envContent;
        const updateOrAdd = (k, v) => {
          if (newEnv.includes(`${k}=`)) {
            newEnv = newEnv.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`);
          } else {
            newEnv += `\n${k}=${v}`;
          }
        };

        updateOrAdd("LINKEDIN_ACCESS_TOKEN", accessToken);
        updateOrAdd("LINKEDIN_PERSON_ID", personId);
        if (refreshToken) updateOrAdd("LINKEDIN_REFRESH_TOKEN", refreshToken);

        fs.writeFileSync(envPath, newEnv.trim() + "\n");
        console.log("📄 Updated .env with new Access Token and Refresh Token!");

        console.log("══════════════════════════════════════════════════════\n");
        process.exit(0);
      } catch (err) {
        console.error("\n❌ Error fetching token:", err.message);
        process.exit(1);
      }
    }
  }
});

server.listen(8181, () => {});
