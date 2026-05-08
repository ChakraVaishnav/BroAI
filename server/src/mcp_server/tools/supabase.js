import { getSupabaseClient } from "../../supabase/client.js";

// Table column reference (actual DB schema):
// User:     id, username, email, password, creds, unlimited, jobsInDB, totalJobsSearched, authProvider, emailVerified
// Rating:   id, userId, score, comment, createdAt, template
// Resume:   id, userId, data, updatedAt
// JobUsage: id, userId, date, searchCount, jobsFetched, tier, credits, creditsUsed, lastSearchAt, updatedAt
// Job:      id, userId (FK), ... (fetched jobs per user)

async function withTimeout(promise, label, timeoutMs = 10000) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

export const supabaseTools = [
  // ── 1. Total user count ─────────────────────────────────────────────────
  {
    name: "get_user_count",
    description:
      "Returns the total number of registered users in the database. Use when asked 'how many users', 'total users', 'user count', etc.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async () => {
      const supabase = getSupabaseClient();
      const { count, error } = await withTimeout(
        supabase.from("User").select("id", { count: "exact", head: true }),
        "User count query"
      );
      if (error) throw new Error(`User count failed: ${error.message}`);
      return { success: true, totalUsers: count || 0 };
    },
  },

  // ── 2. User details by ID ────────────────────────────────────────────────
  {
    name: "get_user_by_id",
    description:
      "Fetch full details of a single user by their user ID. Returns id, username, email, creds, unlimited, jobsInDB, totalJobsSearched, authProvider, emailVerified.",
    inputSchema: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "The user's ID (UUID or numeric string).",
        },
      },
      required: ["userId"],
    },
    execute: async ({ userId } = {}) => {
      if (!userId) throw new Error("userId is required");
      const supabase = getSupabaseClient();
      const { data, error } = await withTimeout(
        supabase
          .from("User")
          .select("id, username, email, creds, unlimited, jobsInDB, totalJobsSearched, authProvider, emailVerified")
          .eq("id", userId)
          .single(),
        "User by ID query"
      );
      if (error) throw new Error(`User lookup failed: ${error.message}`);
      return { success: true, user: data || null };
    },
  },

  // ── 3. Last N users ──────────────────────────────────────────────────────
  {
    name: "get_last_users",
    description:
      "Returns the most recently registered users. Use when asked 'last 5 users', 'recent users', 'who signed up recently', etc. Ordered by id descending (newest first).",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "How many recent users to return. Default is 5, max 50.",
        },
      },
      required: [],
    },
    execute: async ({ limit = 5 } = {}) => {
      const supabase = getSupabaseClient();
      const { data, error } = await withTimeout(
        supabase
          .from("User")
          .select("id, username, email, authProvider, emailVerified")
          .order("id", { ascending: false })
          .limit(Math.min(Number(limit) || 5, 50)),
        "Last users query"
      );
      if (error) throw new Error(`Last users query failed: ${error.message}`);
      return { success: true, count: data?.length || 0, users: data || [] };
    },
  },

  // ── 4. Search users by username ──────────────────────────────────────────
  {
    name: "search_users_by_name",
    description:
      "Find all users whose username matches a given name (partial, case-insensitive). Returns their username and email. Use when asked to find users by a specific name or username.",
    inputSchema: {
      type: "object",
      properties: {
        username: {
          type: "string",
          description: "The username or partial name to search for.",
        },
      },
      required: ["username"],
    },
    execute: async ({ username } = {}) => {
      if (!username) throw new Error("username is required");
      const supabase = getSupabaseClient();
      const { data, error } = await withTimeout(
        supabase
          .from("User")
          .select("id, username, email, authProvider, emailVerified")
          .ilike("username", `%${username}%`)
          .limit(50),
        "Search users by username"
      );
      if (error) throw new Error(`User name search failed: ${error.message}`);
      return {
        success: true,
        count: data?.length || 0,
        searchTerm: username,
        users: data || [],
      };
    },
  },

  // ── 5. Jobs fetched by a specific user ───────────────────────────────────
  {
    name: "get_jobs_by_user",
    description:
      "Returns all jobs fetched by a specific user (by userId), plus their JobUsage stats (searchCount, jobsFetched, tier, credits). Use when asked how many jobs a user has, what jobs a user fetched, or a user's job usage.",
    inputSchema: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "The user's ID to look up jobs and usage for.",
        },
        limit: {
          type: "number",
          description: "Max job rows to return. Default is 20, max 100.",
        },
      },
      required: ["userId"],
    },
    execute: async ({ userId, limit = 20 } = {}) => {
      if (!userId) throw new Error("userId is required");
      const supabase = getSupabaseClient();

      const [jobsResult, usageResult] = await Promise.all([
        withTimeout(
          supabase
            .from("Job")
            .select("*")
            .eq("userId", userId)
            .order("id", { ascending: false })
            .limit(Math.min(Number(limit) || 20, 100)),
          "Jobs by user query"
        ),
        withTimeout(
          supabase
            .from("JobUsage")
            .select("id, userId, date, searchCount, jobsFetched, tier, credits, creditsUsed, lastSearchAt, updatedAt")
            .eq("userId", userId)
            .order("updatedAt", { ascending: false })
            .limit(50),
          "JobUsage by user query"
        ),
      ]);

      if (jobsResult.error) throw new Error(`Jobs query failed: ${jobsResult.error.message}`);

      return {
        success: true,
        userId,
        totalJobsFetched: jobsResult.data?.length || 0,
        jobs: jobsResult.data || [],
        usageRecords: usageResult.data || [],
        usageCount: usageResult.data?.length || 0,
      };
    },
  },

  // ── 6. Recent ratings ────────────────────────────────────────────────────
  {
    name: "get_recent_ratings",
    description:
      "Returns the most recent ratings from the Rating table. Columns: id, userId, score (1–5), comment, createdAt, template. Use when asked about 'last ratings', 'recent reviews', 'what ratings were given', etc.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of ratings to return. Default is 10, max 100.",
        },
        minScore: {
          type: "number",
          description: "Filter to only ratings with score >= this value (1–5). Omit for all.",
        },
      },
      required: [],
    },
    execute: async ({ limit = 10, minScore } = {}) => {
      const supabase = getSupabaseClient();
      let query = supabase
        .from("Rating")
        .select("id, userId, score, comment, createdAt, template")
        .order("createdAt", { ascending: false })
        .limit(Math.min(Number(limit) || 10, 100));

      if (minScore && Number(minScore) >= 1 && Number(minScore) <= 5) {
        query = query.gte("score", Number(minScore));
      }

      const { data, error } = await withTimeout(query, "Ratings query");
      if (error) throw new Error(`Ratings query failed: ${error.message}`);

      const avg =
        data && data.length > 0
          ? (data.reduce((sum, r) => sum + (r.score || 0), 0) / data.length).toFixed(2)
          : null;

      return {
        success: true,
        count: data?.length || 0,
        averageScore: avg ? parseFloat(avg) : null,
        ratings: data || [],
      };
    },
  },

  // ── 7. Generic table explorer ────────────────────────────────────────────
  {
    name: "query_table",
    description:
      "Query any allowed database table and return its latest rows. Use for any question about table contents not covered by the other tools. Known tables and their key columns: User (id, username, email, creds, unlimited, jobsInDB, totalJobsSearched), Resume (id, userId, data, updatedAt — data is full resume JSON), Job (id, userId, ...), JobUsage (id, userId, date, searchCount, jobsFetched, tier, credits, creditsUsed, lastSearchAt, updatedAt), Rating (id, userId, score, comment, createdAt, template).",
    inputSchema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          description:
            "Exact table name to query. Allowed values: User, Resume, Job, JobUsage, Rating.",
        },
        limit: {
          type: "number",
          description: "Rows to return. Default is 10, max 50.",
        },
        userId: {
          type: "string",
          description: "Optional: filter rows by userId column (where applicable).",
        },
        orderBy: {
          type: "string",
          description:
            "Column to sort by. Use 'id' for User/Job; 'createdAt' for Rating; 'updatedAt' for Resume/JobUsage. Default is 'id'.",
        },
        ascending: {
          type: "boolean",
          description: "Sort ascending if true, descending if false. Default false (newest first).",
        },
      },
      required: ["table"],
    },
    execute: async ({ table, limit = 10, userId, orderBy = "id", ascending = false } = {}) => {
      if (!table) throw new Error("table name is required");

      const ALLOWED_TABLES = ["User", "Resume", "Job", "JobUsage", "Rating"];
      if (!ALLOWED_TABLES.includes(table)) {
        return {
          success: false,
          error: `Table "${table}" is not allowed. Allowed tables: ${ALLOWED_TABLES.join(", ")}`,
        };
      }

      const supabase = getSupabaseClient();
      let query = supabase
        .from(table)
        .select("*")
        .order(orderBy, { ascending: Boolean(ascending) })
        .limit(Math.min(Number(limit) || 10, 50));

      if (userId) {
        // User table uses "id", all others use "userId"
        const filterCol = table === "User" ? "id" : "userId";
        query = query.eq(filterCol, userId);
      }

      const { data, error } = await withTimeout(query, `${table} query`);
      if (error) throw new Error(`Query on ${table} failed: ${error.message}`);

      return {
        success: true,
        table,
        count: data?.length || 0,
        rows: data || [],
      };
    },
  },
];
