# BroAI Server (Internal Product Documentation)

This is a private, internal README for documenting the BroAI server.
It is not intended as a public usage guide or onboarding material.

A personal assistant backend for a single user ("Sir").
This server hosts the chat API, orchestrates LangGraph, and exposes tools through MCP.
It also connects to Gmail, Google Calendar, LinkedIn, Supabase, and web search.

## Table of contents
- Internal use only
- Goals and scope
- Runtime overview
- High-level request flow
- LangGraph design
- Tool safety gate
- MCP architecture
- Tool catalog
- Tool descriptions (verbatim)
- Google integration
- LinkedIn integration
- Supabase integration
- Web search integration
- Memory system
- System prompt rules
- System prompt (verbatim)
- LLM strategy and fallback
- API endpoints
- Request authentication
- Error handling and logging
- Configuration and env vars
- Project structure
- Development workflow
- Test workflow
- Extending tools
- Troubleshooting

## Internal use only
- This document is meant to capture how the product works and why it was built this way.
- It includes internal tool descriptions and the full system prompt for traceability.
- If you share this externally, remove secrets, tool behavior rules, and prompt text.

## Goals and scope
- Provide a single, consistent chat endpoint for the BroAI client.
- Keep behavior deterministic and honest by forcing tool usage for real data.
- Centralize permissions for destructive actions (email, LinkedIn, deletes).
- Keep memory small and explicit (short chat history + persistent JSON memory).
- Support multiple LLM providers with fallback to reduce downtime.

## Runtime overview
- Express server handles /chat and /health.
- LangGraph orchestrates the agent, safety checks, and tools.
- MCP server runs as a child process through stdio.
- Tools reach external services (Google, LinkedIn, Supabase, search).
- All environment configuration is loaded from .env at runtime.

## High-level request flow
- Client sends POST /chat with a message.
- Server validates the optional Bearer token.
- Server builds context:
- System prompt (rules and behavior).
- Persistent memory snapshot.
- Current time context (Asia/Kolkata).
- Recent chat history (last 10 messages only).
- LangGraph executes:
- Agent node produces an LLM response or tool calls.
- Safety gate checks tool calls for destructive actions.
- Tool node executes MCP tools as needed.
- Agent node runs again with tool results.
- Server returns final reply with timing and model metadata.

## LangGraph design
- File: server/src/agent/graph.js
- Graph uses MessagesAnnotation from @langchain/langgraph.
- Nodes:
- agentNode: runs LLM with bound tools.
- safety_check: blocks destructive tools without explicit confirmation.
- tools: executes MCP tools and returns ToolMessage outputs.
- Routing:
- agentNode -> safety_check if tool calls exist.
- safety_check -> agentNode when blocked (ToolMessage error).
- safety_check -> tools when approved.
- tools -> agentNode to let LLM finalize response.
- End condition:
- No tool calls => graph ends.

## Tool safety gate
- Destructive tools are listed in graph.js:
- post_to_linkedin
- send_email
- delete_linkedin_post
- reply_to_linkedin_comment
- Logic:
- Look back over recent human messages.
- Block if user said "do not", "don't", or "just write".
- Require explicit confirmation like "yes", "confirm", "go ahead".
- When blocked, return a ToolMessage error so the LLM explains.

## MCP architecture
- MCP server entry: server/src/mcp_server/index.js
- MCP client: server/src/agent/mcpClient.js
- Transport:
- Client starts server via StdioClientTransport.
- Server listens via StdioServerTransport.
- This keeps tooling local and process isolated.
- Tool registration:
- Tools use JSON schema input definitions.
- Server converts JSON schema into a Zod raw shape.
- Client converts JSON schema into Zod for LangChain tool binding.
- The SDK requires structuredContent to be a record for tool results.
- Server always returns text content, and structuredContent when valid.

## Tool catalog (MCP)
- systemTools
- get_time: returns ISO + readable time data.
- memoryTools
- store_memory: persists key/value info to memory.json.
- searchTools
- web_search: Tavily search with Serper fallback.
- gmailTools
- get_emails: list emails by query or recent inbox.
- send_email: sends an email with explicit permission.
- reply_to_email: replies to a thread by messageId.
- calendarTools
- list_events: list events for a date range or relative day.
- create_event: add event with IST time handling.
- delete_event: delete event by eventId.
- linkedinTools
- list_my_recent_posts: fetch last 5 posts.
- get_post_comments: fetch comments for a post.
- post_to_linkedin: publish a post with explicit confirmation.
- delete_linkedin_post: delete a post with explicit confirmation.
- reply_to_linkedin_comment: reply with explicit confirmation.
- supabaseTools
- get_user_count, get_user_by_id, get_last_users
- search_users_by_name, get_jobs_by_user
- get_recent_ratings, query_table

## Tool descriptions (verbatim)

System tools
- get_time
- Description: Get current date and time.
- Inputs: none

Memory tools
- store_memory
- Description: Stores important information to remember for future sessions.
- Inputs:
- key (string): short label for what is being remembered
- value (string): the actual information to store

Search tools
- web_search
- Description: ALWAYS use this tool for any question about current events, recent news, latest updates, sports results, scores, today's information, or anything that requires up-to-date data. Your training data is outdated. Never answer news, sports, or current events questions from memory. Always call this tool first before answering.
- Inputs:
- query (string): the search query

Gmail tools
- send_email
- Description: Use this tool ONLY when Sir has explicitly said to send an email with a clear instruction like "send this email", "send it", or "go ahead and send". Do NOT call this tool just because Sir mentioned email in conversation, asked a question about email capability, or described a situation.
- Inputs:
- to (string): recipient email address
- subject (string): email subject line
- body (string): full email body content

- reply_to_email
- Description: Use this tool to reply to an existing email thread. Sir must provide the messageId of the email he wants to reply to. This tool automatically handles the threading, recipient, and "Re:" subject line. ALWAYS use this when Sir says "reply to this" or "tell them...".
- Inputs:
- messageId (string): the ID of the email message to reply to
- body (string): the content of your reply message

- get_emails
- Description: ALWAYS use this tool when Sir asks about emails, inbox, messages, mail, or anything email-related. You have NO knowledge of Sir's actual emails. Do not answer email questions from memory. Call this tool every single time Sir mentions emails, even if you think you already know the answer.
- Inputs:
- query (string): Gmail search query
- maxResults (number): maximum number of emails to return

Calendar tools
- create_event
- Description: Use this tool ONLY when Sir has explicitly said to add, create, or schedule a specific event with clear details. Do NOT call this if Sir just mentions something in passing or describes their schedule.
- Inputs:
- title (string): event title or name
- date (string): event date in ISO format YYYY-MM-DD
- startTime (string): start time in HH:MM 24-hour format
- endTime (string): end time in HH:MM 24-hour format
- description (string): optional event description or notes

- list_events
- Description: ALWAYS use this tool when Sir asks about schedule, calendar, events, meetings, tasks for today, tomorrow, or any date. You have NO knowledge of Sir's actual calendar. Never make up events. Call this tool every time.
- Inputs:
- start_date (string): start date in ISO format YYYY-MM-DD
- end_date (string): optional end date in ISO format YYYY-MM-DD

- delete_event
- Description: Use this tool ONLY when Sir has explicitly said to delete or cancel a specific event. Always confirm the event ID by calling list_events first to find the exact event. Never delete without explicit permission.
- Inputs:
- eventId (string): Google Calendar event ID to delete

LinkedIn tools
- post_to_linkedin
- Description: Publishes a new post to Sir's LinkedIn feed. Use this tool ONLY when Sir has explicitly given a final "yes" to a specific draft or said "post it".
- Inputs:
- content (string): the text content to post

- delete_linkedin_post
- Description: Deletes a specific post from LinkedIn. Use this ONLY when Sir has explicitly asked to remove or delete a post.
- Inputs:
- postId (string): the URN/ID of the post to delete

- list_my_recent_posts
- Description: Retrieves the 5 most recent posts Sir has published on LinkedIn. Use this to find the ID of a post Sir wants to discuss or check comments for.
- Inputs: none

- get_post_comments
- Description: Fetches all comments on a specific LinkedIn post. Use this to see what people are saying to Sir.
- Inputs:
- postId (string): the URN/ID of the post

- reply_to_linkedin_comment
- Description: Posts a reply to a specific comment on LinkedIn. Use this ONLY when Sir has explicitly said "yes" to a specific reply draft.
- Inputs:
- postId (string): the URN/ID of the post where the comment is located
- commentId (string): the ID of the comment to reply to
- text (string): the text of your reply

Supabase tools
- get_user_count
- Description: Returns total number of registered users.
- Inputs: none

- get_user_by_id
- Description: Fetch full user details by ID.
- Inputs:
- userId (string): the user's ID (UUID or numeric string)

- get_last_users
- Description: Returns the N most recently registered users (newest first).
- Inputs:
- limit (number): how many recent users to return

- search_users_by_name
- Description: Search for users by username (partial match).
- Inputs:
- username (string): the username or partial name to search for

- get_jobs_by_user
- Description: Returns all jobs and usage stats for a specific user ID.
- Inputs:
- userId (string): the user's ID to look up jobs and usage for
- limit (number): max job rows to return

- get_recent_ratings
- Description: Returns the most recent job ratings/feedback.
- Inputs:
- limit (number): number of ratings to return
- minScore (number): filter to only ratings with score >= this value

- query_table
- Description: Query any allowed database table (User, Resume, Job, JobUsage, Rating).
- Inputs:
- table (string): exact table name to query
- limit (number): rows to return
- userId (string): optional filter by userId
- orderBy (string): column to sort by
- ascending (boolean): sort ascending if true

## Google integration
- Auth helper: server/src/google/auth.js
- Uses OAuth2 with refresh token.
- Required env vars:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_REDIRECT_URI
- GOOGLE_REFRESH_TOKEN
- Gmail:
- server/src/google/gmail.js
- getEmails: metadata only, no body.
- sendEmail and replyToEmail use raw RFC 822 base64.
- Calendar:
- server/src/google/calendar.js
- listEvents supports relative ranges (today, tomorrow, past N days).
- createEvent accepts ISO or simple time input.

## LinkedIn integration
- Tools: server/src/mcp_server/tools/linkedin.js
- Uses LinkedIn UGC Posts API.
- Supports token auto-refresh if refresh token is configured.
- Updates .env with new tokens when refreshed.
- Helper script:
- server/getLinkedInRefreshToken.mjs
- Runs a local server on port 8181.
- Opens OAuth flow and writes tokens + person ID to .env.

## Supabase integration
- Client: server/src/supabase/client.js
- Requires SUPABASE_URL and SUPABASE_ANON_KEY.
- Tools query these tables:
- User
- Resume
- Job
- JobUsage
- Rating
- Timeouts are enforced to avoid hanging requests.

## Web search integration
- Tool: server/src/mcp_server/tools/search.js
- Primary provider: Tavily
- Fallback provider: Serper
- Returns structured results and a short answer when available.

## Memory system
- File: server/src/memory/memory.json
- Read/write helpers: server/src/memory/memory.js
- readMemory loads JSON or returns a default empty structure.
- saveMemory writes pretty JSON with two-space indent.
- Used in the chat prompt as a "persistent memory context".
- Chat history is separate from memory:
- In-memory array only.
- Last 10 messages are kept.

## System prompt rules
- File: server/src/agent/prompts/system.js
- Key rules:
- Must use tools for real data (emails, calendar, LinkedIn, Supabase).
- Must use web search for current information.
- Must not perform destructive actions without explicit confirmation.
- Must never fabricate data or tool results.
- Must be honest about tool usage.
- Response style:
- Address user as "Sir".
- Concise, direct, professional tone.

## System prompt (verbatim)
You are BroAI, a personal AI assistant serving one person exclusively.
Always address them as "Sir". You are sharp, concise, and always honest.

## ABSOLUTE RULES -- NEVER BREAK THESE

### RULE 1 -- ALWAYS USE TOOLS FOR REAL DATA
You have ZERO knowledge of Sir's personal data. You do not know:
- Sir's emails (you must call get_emails tool EVERY time)
- Sir's calendar events (you must call list_events tool EVERY time)
- Sir's LinkedIn activity (you must call linkedin tools EVERY time)
- Sir's COREsume user count (you must call supabase tool EVERY time)

If Sir asks ANYTHING about his emails, calendar, LinkedIn, or COREsume data:
STOP. Do NOT answer from memory. Call the tool first. Then answer.

Saying "Sir, I've checked your calendar" without calling the tool is LYING.
Saying "Sir, here are your emails" without calling get_emails is LYING.
Never lie to Sir.

### RULE 2 -- ALWAYS USE WEB SEARCH FOR CURRENT INFORMATION
You do not know current news, recent events, today's prices, or anything
that happened after your training. Your training data is STALE.

If Sir asks about:
- News, current events, latest updates on any topic
- Recent developments in any field
- Today's prices, scores, weather
- Anything with words like "latest", "recent", "now", "today", "current"

You MUST call the web_search tool first. Do not answer from memory.
Do not pretend you searched. Actually call the tool.

### RULE 3 -- NEVER TAKE DESTRUCTIVE ACTIONS WITHOUT EXPLICIT PERMISSION
Destructive actions are: sending emails, posting on LinkedIn, replying to LinkedIn comments,
deleting calendar events, or any action that cannot be undone.

MANDATORY TWO-STEP CONFIRMATION FOR LINKEDIN:
1. Draft: If Sir asks to post or reply, you must first present a draft of the content.
2. Ask: You must ask explicitly: "Sir, shall I go ahead and post/reply? (Yes/No)"
3. Execute: You are ONLY permitted to call the tool after Sir says "Yes", "Do it", "Confirm", or "Execute".

NEVER perform a destructive action unless Sir says one of these explicitly:
- "Send the email" / "Send it" / "Go ahead and send"
- "Post it" / "Post this on LinkedIn" / "Post on Reddit"
- "Reply to it" / "Yes reply" / "Go ahead and reply"
- "Delete the event" / "Delete it" / "Yes delete"
- "Confirm" / "Do it" / "Execute"

If Sir asks a QUESTION like "Can you send an email?" or "Can you post on LinkedIn?" --
that is a QUESTION about your capability, NOT a command to execute.
Answer: "Yes Sir, I can do that. Would you like me to go ahead?"

If Sir describes a situation like his fitness or a problem --
DO NOT send emails, create events, or post anything.
Just respond conversationally. Wait for an explicit command.

### RULE 4 -- NEVER FABRICATE DATA
If a tool returns empty results, say: "Sir, I found nothing matching that."
Never invent emails, events, names, dates, or any data.
Never say "Here are your emails" and then list fake ones.

### RULE 5 -- BE HONEST ABOUT TOOL USAGE
If Sir asks "did you use the web search tool?" -- answer honestly yes or no.
If you did not use the tool, say "Sir, I answered from memory. Let me search now."
Then actually search.

## HOW TO RESPOND

Format: Clean, readable, Sir-addressed.
Length: Concise. No fluff. No unnecessary disclaimers.
Tone: Sharp executive assistant. Professional but not robotic.

When listing emails: show From, Subject, brief summary. Ask if Sir wants full body.
When listing events: show Title, Time, Duration. Clean list format.
When reporting tool results: present the data cleanly, do not dump raw API response.

## WHAT YOU NEVER DO
- Never output raw function call syntax in your response text
- Never use emojis excessively
- Never say "As an AI language model"
- Never take actions Sir didn't explicitly request
- Never answer personal data questions from memory
- Never pretend to have called a tool when you didn't

## LLM strategy and fallback
- File: server/src/llm/groq.js
- Provider order:
- Groq primary (GROQ_API_KEY)
- Groq backup (GROQ_API_KEY_2)
- NVIDIA OpenAI compatible endpoint (NVIDIA_API_KEY + NVIDIA_BASE_URL)
- On rate limit errors, try next candidate.
- If all candidates fail, raise a rate limit error.
- Model used is stored in global.__last_model_used for response metadata.

## API endpoints
- POST /chat
- Body: { "message": "..." }
- Response: { "reply": "..." }
- Adds runtime metadata: time taken + model used.
- GET /health
- Response: { status: "ok", timestamp: "..." }

## Request authentication
- Uses optional header check in server/src/index.js.
- If BRO_AI_SECRET_TOKEN is set:
- Client must send Authorization: Bearer <token>.
- If not set:
- Server accepts unauthenticated requests.

## Error handling and logging
- Server logs errors to server/src/error.log.
- Error response contains the exact error message.
- Rate limit errors return HTTP 429 with friendly message.
- Aborts long-running LLM calls if the client disconnects.

## Configuration and env vars
- Core server
- BRO_AI_SECRET_TOKEN
- GROQ_API_KEY
- GROQ_API_KEY_2
- NVIDIA_API_KEY
- NVIDIA_BASE_URL
- Tooling
- TAVILY_API_KEY
- SERPER_API_KEY
- Google
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_REDIRECT_URI
- GOOGLE_REFRESH_TOKEN
- LinkedIn
- LINKEDIN_ACCESS_TOKEN
- LINKEDIN_REFRESH_TOKEN
- LINKEDIN_CLIENT_ID
- LINKEDIN_CLIENT_SECRET
- LINKEDIN_PERSON_ID
- LINKEDIN_REDIRECT_URI
- Supabase
- SUPABASE_URL
- SUPABASE_ANON_KEY

## Project structure
- server/src/index.js
- Express server + chat entrypoint.
- server/src/agent/graph.js
- LangGraph orchestration, safety gate, and tool execution.
- server/src/agent/mcpClient.js
- MCP client that launches the MCP server and binds tools to the LLM.
- server/src/agent/prompts/system.js
- System prompt and behavioral rules.
- server/src/llm/groq.js
- LLM configuration and fallback sequence.
- server/src/mcp_server/index.js
- MCP server, tool registration, and schema handling.
- server/src/mcp_server/tools
- Gmail, Calendar, LinkedIn, Search, Memory, System, Supabase tools.
- server/src/google
- Gmail and Calendar API adapters.
- server/src/memory
- Persistent memory store and helpers.
- server/src/supabase
- Supabase client singleton.
- server/getLinkedInRefreshToken.mjs
- LinkedIn OAuth helper to refresh tokens.
- server/test.js
- Simple local chat test script.

## Development workflow
- Install deps:
- npm install
- Run dev server with auto-reload:
- npm run dev
- Run production server:
- npm run start
- Logs are printed to the console and error.log.

## Test workflow
- Quick API test:
- node test.js
- This calls http://localhost:3000/chat with a sample message.
- You can also curl:
- curl -X POST http://localhost:3000/chat -H "Content-Type: application/json" -d '{"message":"hello"}'

## Extending tools
- Add a new tool file under server/src/mcp_server/tools.
- Export tool definition with name, description, inputSchema, execute.
- Add it to the allTools array in server/src/mcp_server/index.js.
- Ensure JSON schema is compatible with raw shape conversion.
- If tool returns non-object, it will be returned as text only.
- Use structuredContent only for plain objects.

## Troubleshooting
- If /chat returns 401, verify BRO_AI_SECRET_TOKEN and header.
- If tools do not show up, restart the server (MCP client caches tools).
- If Gmail or Calendar fails, verify Google OAuth env vars.
- If LinkedIn fails with 401, refresh tokens using getLinkedInRefreshToken.mjs.
- If web_search fails, confirm TAVILY_API_KEY or SERPER_API_KEY.
- If Supabase fails, confirm URL and ANON key.
- If rate limits occur, add backup LLM keys or NVIDIA endpoint.

## Notes for future improvements
- Persist chat history to disk if you want longer memory.
- Add structured tool result formatting per tool for better summaries.
- Consider per-tool audit logging for destructive actions.
- Add tests around safety gate and tool routing.
