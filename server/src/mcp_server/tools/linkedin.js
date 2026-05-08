// LinkedIn tool — uses OAuth2 access token (UGC Posts API)
// Required env vars:
//   LINKEDIN_ACCESS_TOKEN  → OAuth2 bearer token from https://www.linkedin.com/developers/
//   LINKEDIN_PERSON_ID     → Your LinkedIn member ID (e.g. "ABC123xyz" from your profile URN)
//
// To get these:
//   1. Create an app at https://www.linkedin.com/developers/apps
//   2. Add "Share on LinkedIn" and "Sign In with LinkedIn" products
//   3. Generate an access token with scope: w_member_social
//   4. Your person ID is the part after /in/ in your LinkedIn URL, or use the /v2/me endpoint

export const linkedinTools = [
  {
    name: "post_to_linkedin",
    description:
      "Post a text update to LinkedIn on behalf of the user. Use when the user says 'post this on LinkedIn', 'share on LinkedIn', or 'put this on my LinkedIn'.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The text content to post on LinkedIn.",
        },
      },
      required: ["content"],
    },
    execute: async ({ content } = {}) => {
      let { LINKEDIN_ACCESS_TOKEN, LINKEDIN_PERSON_ID, LINKEDIN_REFRESH_TOKEN, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET } = process.env;

      if (!LINKEDIN_ACCESS_TOKEN) {
        throw new Error("LINKEDIN_ACCESS_TOKEN env var is not set.");
      }
      if (!LINKEDIN_PERSON_ID) {
        throw new Error("LINKEDIN_PERSON_ID env var is not set.");
      }
      if (!content) {
        throw new Error("Post content is required.");
      }

      const authorUrn = `urn:li:person:${LINKEDIN_PERSON_ID}`;

      const buildRequest = (token) => ({
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          author: authorUrn,
          lifecycleState: "PUBLISHED",
          specificContent: {
            "com.linkedin.ugc.ShareContent": {
              shareCommentary: { text: String(content) },
              shareMediaCategory: "NONE",
            },
          },
          visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
        }),
      });

      let res = await fetch("https://api.linkedin.com/v2/ugcPosts", buildRequest(LINKEDIN_ACCESS_TOKEN));

      // Auto-refresh logic if the token is expired (401)
      if (res.status === 401 && LINKEDIN_REFRESH_TOKEN && LINKEDIN_CLIENT_ID && LINKEDIN_CLIENT_SECRET) {
        console.log("[LinkedIn] Access token expired. Attempting auto-refresh...");
        
        const refreshRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: LINKEDIN_REFRESH_TOKEN,
            client_id: LINKEDIN_CLIENT_ID,
            client_secret: LINKEDIN_CLIENT_SECRET,
          }),
        });

        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          LINKEDIN_ACCESS_TOKEN = refreshData.access_token;
          process.env.LINKEDIN_ACCESS_TOKEN = LINKEDIN_ACCESS_TOKEN;
          
          if (refreshData.refresh_token) {
            LINKEDIN_REFRESH_TOKEN = refreshData.refresh_token;
            process.env.LINKEDIN_REFRESH_TOKEN = LINKEDIN_REFRESH_TOKEN;
          }

          // Persist the new tokens to .env so they survive restarts
          import("fs").then((fs) => {
            const envPath = import("path").then(path => path.join(process.cwd(), ".env"));
            envPath.then(p => {
              if (fs.existsSync(p)) {
                let envContent = fs.readFileSync(p, "utf8");
                envContent = envContent.replace(/^LINKEDIN_ACCESS_TOKEN=.*$/m, `LINKEDIN_ACCESS_TOKEN=${LINKEDIN_ACCESS_TOKEN}`);
                if (refreshData.refresh_token) {
                  if (envContent.includes("LINKEDIN_REFRESH_TOKEN=")) {
                    envContent = envContent.replace(/^LINKEDIN_REFRESH_TOKEN=.*$/m, `LINKEDIN_REFRESH_TOKEN=${LINKEDIN_REFRESH_TOKEN}`);
                  } else {
                    envContent += `\nLINKEDIN_REFRESH_TOKEN=${LINKEDIN_REFRESH_TOKEN}`;
                  }
                }
                fs.writeFileSync(p, envContent);
                console.log("[LinkedIn] Saved new tokens to .env");
              }
            });
          });

          // Retry the original post request
          res = await fetch("https://api.linkedin.com/v2/ugcPosts", buildRequest(LINKEDIN_ACCESS_TOKEN));
        } else {
          console.error("[LinkedIn] Auto-refresh failed:", await refreshRes.text());
        }
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`LinkedIn post failed (${res.status}): ${errText}`);
      }

      const data = await res.json();
      const postId = data?.id || null;

      return {
        success: true,
        postId,
        author: authorUrn,
        message: postId
          ? `Posted to LinkedIn successfully! Post ID: ${postId}`
          : "Post submitted to LinkedIn.",
      };
    },
  },
];
