# Admin Analytics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add built-in website and download analytics to the existing Codex admin system.

**Architecture:** Extend the current file-backed server state with `analytics_events`, record homepage views and download file requests on the server, record download button clicks from the landing page, and expose authenticated analytics summaries in the existing admin page.

**Tech Stack:** Node.js, Express, static HTML/CSS/JavaScript, Node test runner.

---

### Task 1: Analytics Storage Tests

**Files:**
- Modify: `server/tests/index.test.js`
- Modify: `server/src/db.js`

**Steps:**
1. Add failing tests for recording analytics events and summarizing today's totals, all-time totals, unique visitors, and daily trend rows.
2. Run `node --test server\tests\index.test.js` and verify analytics tests fail.
3. Implement `recordAnalyticsEvent` and `getAnalyticsSummary` in `server/src/db.js`.
4. Run `node --test server\tests\index.test.js` and verify the storage tests pass.

### Task 2: Server Routes and Middleware

**Files:**
- Modify: `server/src/index.js`
- Modify: `server/src/routes/admin.js`
- Create: `server/src/routes/analytics.js`
- Modify: `server/tests/index.test.js`

**Steps:**
1. Add failing tests for homepage page-view tracking, download-file tracking, public download-click tracking, and authenticated `/admin/api/analytics`.
2. Run `node --test server\tests\index.test.js` and verify the route tests fail.
3. Implement server helpers to hash visitors and record the three event types.
4. Add `/api/analytics/event` public route and `/admin/api/analytics` protected route.
5. Run `node --test server\tests\index.test.js` and verify the route tests pass.

### Task 3: Admin UI Integration

**Files:**
- Modify: `server/public/admin/messages.html`
- Modify: `server/public/admin/messages.css`
- Modify: `server/public/admin/messages.js`
- Modify: `server/public/site/index.html`
- Create: `server/public/site/site.js`
- Modify: `server/tests/index.test.js`

**Steps:**
1. Add failing tests that the admin HTML exposes the management-system title and analytics panel, and the landing page loads `site.js`.
2. Run `node --test server\tests\index.test.js` and verify UI tests fail.
3. Update admin HTML/CSS/JS to render the analytics dashboard and keep message management intact.
4. Update landing page download links and load `site.js` to send download-click events.
5. Run `node --test server\tests\index.test.js` and verify UI tests pass.

### Task 4: Verification, Commit, Deploy

**Files:**
- All changed files

**Steps:**
1. Run `npm test` in `server`.
2. Check `git diff --stat` and review changed files.
3. Commit the implementation.
4. Push `main` to GitHub.
5. Package and deploy server files to `/opt/codex-extension-server`.
6. Verify `https://codex.passionapi.com/`, `/healthz`, `/admin/messages`, and download URL.
