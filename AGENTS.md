# Disaster Comms Agent

## Purpose
Provide critical disaster information via SMS when power and signal are limited. Enables response and recovery coordination by SMS access to community-reported information from subreddit megathreads.

## Use Case
During hurricanes, ice storms, and other disasters where power and cellular service are disrupted, community members often use local subreddits to share critical information about:
- Where to get help/supplies
- Road conditions
- Shelter locations
- Emergency services availability
- Recovery resources

This application allows users to SMS a question and receive a summarized answer from the most relevant information available in community megathreads.

## Architecture

### Components
1. **SMS Receiver** - Incoming message gateway
2. **AI Agent Loop** - Crawls subreddit megathreads, queries content, summarizes findings to SMS character limits
3. **SMS Sender** - Replies to the original sender

### Flow
1. User sends SMS question to application
2. Application receives message
3. AI agent crawls relevant subreddit megathreads
4. Agent extracts and summarizes critical information
5. Agent formats response to fit within SMS character limits
6. Application replies to user with summarized information

## Key Requirements
- Efficient content extraction from large megathread archives
- AI-driven summarization to fit SMS constraints (~160 characters or multi-message segments)
- Focus on actionable, time-sensitive information
- Handle multiple concurrent SMS requests

## Development Rules

### Package Management
**Only use `bun` for all package operations.** This is a Bun-only project.

- **Install packages:** `bun add <package>` or `bun install`
- **Never use npm:** Do not run `npm install` or `npm add`
- **No package-lock.json:** Delete if it exists - Bun uses bun.lockb
- **Running scripts:** Use `bun run` or `bun <script>` directly

**Example:**
```sh
# Correct
bun add @effect/ai-openrouter
bun install

# Incorrect - never run
npm install
npm add <package>
```
