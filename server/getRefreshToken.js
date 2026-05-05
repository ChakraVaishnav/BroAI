import { google } from "googleapis";
import readline from "readline";
import "dotenv/config";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/google/callback";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.modify"
];

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

if (!CLIENT_ID || !CLIENT_SECRET) {
  throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env");
}

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES
});

console.log("Open this URL in your browser and authorize the app:");
console.log(authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question("\nPaste authorization code here: ", async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());

    console.log("\nREFRESH TOKEN:");
    console.log(tokens.refresh_token || "No refresh token returned. Re-run and ensure prompt=consent.");
  } catch (error) {
    console.error("Failed to exchange code for tokens:", error.message);
  } finally {
    rl.close();
  }
});
