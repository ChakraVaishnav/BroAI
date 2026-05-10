// LinkedIn tool — uses OAuth2 access token (UGC Posts API)
// Required env vars:
//   LINKEDIN_ACCESS_TOKEN  → OAuth2 bearer token from https://www.linkedin.com/developers/
//   LINKEDIN_PERSON_ID     → Your LinkedIn member ID (e.g. "ABC123xyz" from your profile URN)

async function linkedinRequest(url, options = {}) {
  let { LINKEDIN_ACCESS_TOKEN, LINKEDIN_REFRESH_TOKEN, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET } = process.env;

  const buildOptions = (token) => ({
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });

  let res = await fetch(url, buildOptions(LINKEDIN_ACCESS_TOKEN));

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
        process.env.LINKEDIN_REFRESH_TOKEN = refreshData.refresh_token;
      }

      // Persist to .env
      const fs = await import("fs");
      const path = await import("path");
      const envPath = path.join(process.cwd(), ".env");
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, "utf8");
        envContent = envContent.replace(/^LINKEDIN_ACCESS_TOKEN=.*$/m, `LINKEDIN_ACCESS_TOKEN=${LINKEDIN_ACCESS_TOKEN}`);
        if (refreshData.refresh_token) {
          envContent = envContent.replace(/^LINKEDIN_REFRESH_TOKEN=.*$/m, `LINKEDIN_REFRESH_TOKEN=${refreshData.refresh_token}`);
        }
        fs.writeFileSync(envPath, envContent);
      }

      res = await fetch(url, buildOptions(LINKEDIN_ACCESS_TOKEN));
    }
  }

  return res;
}

export const linkedinTools = [
  {
    name: "post_to_linkedin",
    description: "Publishes a new post to Sir's LinkedIn feed. Use this tool ONLY when Sir has explicitly given a final 'yes' to a specific draft or said 'post it'.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The text content to post." },
      },
      required: ["content"],
    },
    execute: async ({ content }) => {
      const authorUrn = `urn:li:person:${process.env.LINKEDIN_PERSON_ID}`;
      const res = await linkedinRequest("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        body: JSON.stringify({
          author: authorUrn,
          lifecycleState: "PUBLISHED",
          specificContent: {
            "com.linkedin.ugc.ShareContent": {
              shareCommentary: { text: content },
              shareMediaCategory: "NONE",
            },
          },
          visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
        }),
      });

      if (!res.ok) throw new Error(`LinkedIn Post failed: ${await res.text()}`);
      const data = await res.json();
      return { success: true, postId: data.id };
    },
  },
  {
    name: "delete_linkedin_post",
    description: "Deletes a specific post from LinkedIn. Use this ONLY when Sir has explicitly asked to remove or delete a post.",
    inputSchema: {
      type: "object",
      properties: {
        postId: { type: "string", description: "The URN/ID of the post to delete (e.g., urn:li:ugcPost:12345)." },
      },
      required: ["postId"],
    },
    execute: async ({ postId }) => {
      const url = `https://api.linkedin.com/v2/ugcPosts/${encodeURIComponent(postId)}`;
      const res = await linkedinRequest(url, {
        method: "DELETE",
      });

      if (!res.ok) {
        const text = await res.text();
        if (res.status === 404) return { success: false, message: "Post not found or already deleted." };
        throw new Error(`Failed to delete post: ${text}`);
      }
      return { success: true, message: "Post deleted successfully, Sir!" };
    },
  },
  {
    name: "list_my_recent_posts",
    description: "Retrieves the 5 most recent posts Sir has published on LinkedIn. Use this to find the ID of a post Sir wants to discuss or check comments for.",
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      const personId = process.env.LINKEDIN_PERSON_ID;
      const authorUrn = `urn:li:person:${personId}`;
      const url = `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(${encodeURIComponent(authorUrn)})&count=5`;
      const res = await linkedinRequest(url);
      if (!res.ok) throw new Error(`Failed to list posts: ${await res.text()}`);
      const data = await res.json();

      return data.elements.map(post => ({
        id: post.id,
        text: post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text || "No text",
        created: new Date(post.firstPublishedAt).toLocaleString()
      }));
    },
  },
  {
    name: "get_post_comments",
    description: "Fetches all comments on a specific LinkedIn post. Use this to see what people are saying to Sir.",
    inputSchema: {
      type: "object",
      properties: {
        postId: { type: "string", description: "The URN/ID of the post (e.g., urn:li:ugcPost:12345)" },
      },
      required: ["postId"],
    },
    execute: async ({ postId }) => {
      const url = `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postId)}/comments`;
      const res = await linkedinRequest(url);
      if (!res.ok) throw new Error(`Failed to get comments: ${await res.text()}`);
      const data = await res.json();

      return data.elements.map(comment => ({
        id: comment.id,
        author: comment.actor,
        message: comment.message.text,
        created: new Date(comment.created.time).toLocaleString()
      }));
    },
  },
  {
    name: "reply_to_linkedin_comment",
    description: "Posts a reply to a specific comment on LinkedIn. Use this ONLY when Sir has explicitly said 'yes' to a specific reply draft.",
    inputSchema: {
      type: "object",
      properties: {
        postId: { type: "string", description: "The URN/ID of the post where the comment is located." },
        commentId: { type: "string", description: "The ID of the comment to reply to." },
        text: { type: "string", description: "The text of your reply." },
      },
      required: ["postId", "commentId", "text"],
    },
    execute: async ({ postId, commentId, text }) => {
      const authorUrn = `urn:li:person:${process.env.LINKEDIN_PERSON_ID}`;
      const url = `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postId)}/comments`;
      const res = await linkedinRequest(url, {
        method: "POST",
        body: JSON.stringify({
          actor: authorUrn,
          message: { text },
          parentComment: commentId
        }),
      });

      if (!res.ok) throw new Error(`Failed to post reply: ${await res.text()}`);
      return { success: true, message: "Reply posted successfully, Sir!" };
    },
  },
];
