# Eddie Ops Dashboard

A mobile-friendly operations dashboard built on top of the original `kanban-server`.

It keeps the simple stack and persistent JSON storage, but expands the product into a glanceable command center for:

- persistent task tracking
- a dedicated **Waiting on Eddie** lane
- assignee + `nextActionBy` handoffs
- hosted project inventory
- GitHub repo / recent activity sections
- API usage / budget placeholders
- lightweight activity history

**Live URL:** https://kanban-server.fly.dev  
**Repository:** https://github.com/arlo-e-dev/eddie-kanban

## Stack

- Express backend
- Vanilla HTML/CSS/JS frontend
- JSON file persistence (`board-data.json` locally, `/data/board-data.json` on Fly.io)
- Optional Slack notifications for notable task changes

## What changed from the old Kanban app

### 1. Richer task model
Tasks now support:

- `title`, `description`
- `priority`
- `assignee`
- `nextActionBy` (`Eddie`, `Arlo`, `External`)
- `columnId`, `status`
- `waitingReason`, `blockedReason`
- `dueText`
- `tags`
- `links`
- per-task `history`

### 2. More useful lanes
Current lanes:

- `Queued`
- `Waiting on Eddie`
- `In Progress`
- `Blocked`
- `Done`

### 3. Org dashboard sections
The same backend now stores and serves:

- `projects` — hosted apps / environments / links
- `github` — repos + recent activity placeholders
- `metrics` — API usage + hosted project counts
- `activity` — recent dashboard events

### 4. Mobile-first glance view
Top-level summary cards make it easy to quickly see:

- active work
- tasks waiting on Eddie
- blocked tasks
- live projects
- spend vs budget

## API

### Core
- `GET /api/board`
- `PUT /api/board`
- `GET /api/summary`
- `GET /api/health`
- `POST /api/reset`

### Tasks
- `POST /api/tasks`
- `PUT /api/tasks/:id`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `PUT /api/tasks/:id/move`

### Dashboard sections
- `GET /api/projects`
- `PATCH /api/projects/:id`
- `GET /api/github`
- `PATCH /api/github`
- `GET /api/metrics`
- `PATCH /api/metrics`
- `GET /api/activity`

## Local run

```bash
cd /Users/arlospc/.openclaw/workspace/kanban-server
npm install
PORT=3001 node server.js
```

Then open: <http://localhost:3001>

## Deployment notes

This app is already designed for Fly.io persistence:

- local dev uses `kanban-server/board-data.json`
- production uses `/data/board-data.json`

So the dashboard remains persistent across restarts as long as the Fly volume is attached.

## Next logical upgrades

- real GitHub sync via `gh` or GitHub API
- real API spend ingestion
- project uptime/deploy health checks
- agent-created tasks from OpenClaw automations
- auth if the dashboard ever becomes public-facing
