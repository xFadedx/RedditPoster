# Marketing Automation Tool

A local browser-based marketing assistant for generating product-first launch copy, reviewing it, and posting through official platform APIs where available.

## What it does

- Generates Reddit posts, X threads, Discord announcements, and SEO descriptions from one product brief
- Lets you rewrite content in different tones before posting
- Supports manual approval or scheduled posting through a lightweight queue
- Connects real Reddit and X accounts with OAuth
- Posts to Discord by webhook if you choose to use it

## Project structure

- `public/` - browser dashboard UI
- `src/app.js` - Express app wiring
- `src/server.js` - server bootstrap and scheduler startup
- `src/routes/authRoutes.js` - OAuth and integration status endpoints
- `src/routes/generateRoutes.js` - content generation and rewrite endpoints
- `src/routes/draftRoutes.js` - drafts, approvals, posting, and jobs
- `src/services/authService.js` - Reddit/X OAuth, token refresh, and connection state
- `src/services/integrationStorageService.js` - JSON storage for connected accounts
- `src/services/contentService.js` - product-first content templates
- `src/services/postService.js` - platform dispatch and delay handling
- `src/providers/redditProvider.js` - live Reddit posting
- `src/providers/twitterProvider.js` - live X posting
- `src/providers/discordProvider.js` - Discord webhook posting
- `data/` - JSON persistence for drafts, jobs, and integrations

## Environment variables

Copy `.env.example` to `.env` and fill in what you want to use.

- `PORT` - defaults to `3000`
- `APP_BASE_URL` - local app URL, usually `http://localhost:3000`
- `POST_DELAY_MS` - default delay between platform posts
- `SCHEDULER_POLL_MS` - how often scheduled jobs are checked
- `DISCORD_WEBHOOK_URL` - optional default Discord webhook
- `REDDIT_CLIENT_ID` - Reddit app client id
- `REDDIT_CLIENT_SECRET` - Reddit app client secret
- `REDDIT_USER_AGENT` - descriptive user agent string for Reddit API calls
- `X_CLIENT_ID` - X app client id
- `X_CLIENT_SECRET` - optional for public-client PKCE setups, recommended if your X app uses a confidential client

## OAuth callback URLs

Configure these exact callback URLs in the platform dashboards:

- Reddit: `http://localhost:3000/api/auth/reddit/callback`
- X: `http://localhost:3000/api/auth/twitter/callback`

If you run the app on another host or port, update `APP_BASE_URL` and the provider callbacks to match.

## Run locally

1. Install dependencies with `npm install`.
2. In PowerShell, use `npm.cmd install` if script policy blocks `npm`.
3. Start the server with `npm run dev` or `npm.cmd run dev`.
4. Open `http://localhost:3000`.
5. Click `Connect Reddit` and `Connect X` in the delivery panel.
6. Pick a subreddit before sending Reddit posts.

## Testing flow

- Generate a draft and confirm the content now markets your product, not the internal tool
- Connect Reddit/X and verify the account badges update in the sidebar
- Leave `Require manual approval before posting` on if you want a review step first
- Turn it off if you want the main button to send immediately
- For Reddit, choose a subreddit and then post
- For X, the thread posts as the connected account

## Notes

- Live Reddit and X posting depend on your own developer credentials and provider-side app permissions
- Scheduled jobs keep the subreddit and destination settings in the queue
- Discord is optional and disabled by default in the UI
- No browser automation is used for posting
