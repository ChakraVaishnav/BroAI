// LinkedIn tool — uses Zernio API for posting
// Required env vars:
//   ZERNIO  → API Key for Zernio

async function getZernioLinkedinAccountId() {
  const { ZERNIO } = process.env;
  if (!ZERNIO) throw new Error("ZERNIO environment variable is missing.");

  const res = await fetch("https://zernio.com/api/v1/accounts", {
    headers: {
      Authorization: `Bearer ${ZERNIO}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Zernio accounts: ${await res.text()}`);
  }

  const data = await res.json();
  const linkedinAccount = data.accounts?.find(acc => acc.platform === 'linkedin');
  
  if (!linkedinAccount) {
    throw new Error("No LinkedIn account found in Zernio connections.");
  }
  
  return linkedinAccount._id;
}

export const linkedinTools = [
  {
    name: "post_to_linkedin",
    description: "Publish a post to Sir's LinkedIn via Zernio. Call ONLY after Sir has seen the full draft AND confirmed with: \"Post it\" / \"Do it\" / \"Confirm\" / \"Execute\".",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The text content to post." },
      },
      required: ["content"],
    },
    execute: async ({ content }) => {
      const { ZERNIO } = process.env;
      const accountId = await getZernioLinkedinAccountId();
      
      const res = await fetch("https://zernio.com/api/v1/posts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ZERNIO}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: content,
          platforms: [{ platform: "linkedin", accountId: accountId }],
          publishNow: true,
        }),
      });

      if (!res.ok) throw new Error(`LinkedIn Post via Zernio failed: ${await res.text()}`);
      const data = await res.json();
      return { success: true, message: "Posted successfully to LinkedIn via Zernio!", data };
    },
  },
  {
    name: "list_my_recent_posts",
    description: "Retrieve Sir's recent LinkedIn posts via Zernio. Call when Sir asks about his LinkedIn activity or recent posts.",
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      const { ZERNIO } = process.env;
      
      // Zernio's /v1/posts endpoint returns all posts across connected accounts
      // We can fetch it and return the posts.
      const res = await fetch("https://zernio.com/api/v1/posts?status=published", {
        headers: {
          Authorization: `Bearer ${ZERNIO}`,
        },
      });
      
      if (!res.ok) throw new Error(`Failed to list posts from Zernio: ${await res.text()}`);
      const data = await res.json();

      return data.posts.map(post => ({
        id: post._id,
        text: post.content || post.text || "No text",
        created: post.createdAt,
        url: post.platforms?.[0]?.platformPostUrl || null
      }));
    },
  }
];
