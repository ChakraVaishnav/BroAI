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
        attachProvidedImage: { type: "boolean", description: "Set to true to include the image provided by the user in this turn." },
      },
      required: ["content"],
    },
    execute: async ({ content, attachProvidedImage }) => {
      const { ZERNIO } = process.env;
      const accountId = await getZernioLinkedinAccountId();
      let mediaItems = undefined;

      if (attachProvidedImage && process.env.CURRENT_IMAGE_BASE64) {
        const match = process.env.CURRENT_IMAGE_BASE64.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
          const mimeType = match[1];
          const base64Data = match[2];
          const buffer = Buffer.from(base64Data, "base64");
          const blob = new Blob([buffer], { type: mimeType });
          
          const formData = new FormData();
          formData.append("file", blob, "upload.jpg");
          
          const uploadRes = await fetch("https://zernio.com/api/v1/media/upload-direct", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${ZERNIO}`,
            },
            body: formData,
          });
          
          if (!uploadRes.ok) throw new Error(`Zernio media upload failed: ${await uploadRes.text()}`);
          const uploadData = await uploadRes.json();
          mediaItems = [{ type: "image", url: uploadData.url }];
        }
      }
      
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
          ...(mediaItems ? { mediaItems } : {}),
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
