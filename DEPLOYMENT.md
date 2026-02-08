# Kanban Board Deployment Guide

## Recent Changes (Feb 7, 2026)

### ✨ New Features Added:

1. **Task Priority System**
   - Priority levels: High (🔴), Medium (🟡), Low (🟢)
   - Click priority badge to change priority
   - Tasks auto-sort by priority within columns
   - Visual color indicators on task borders

2. **Task Status Tracking**
   - "📊 Status" button on each task
   - Shows completion time, time elapsed, agent assignment
   - Displays model being used (e.g., "Sonnet 4.5")
   - Shows active agent sessions
   - Completion timestamps tracked

3. **Model/Agent Display**
   - Shows which AI model is working on task
   - Displays agent session ID if active
   - "🤖 Agent" badge for Arlo's tasks
   - "📡 Active" indicator for running sessions

4. **Mobile-Friendly Move Buttons**
   - Touch-friendly buttons (44px+ targets)
   - Move left/right between columns
   - Works alongside existing drag-and-drop
   - Responsive design for mobile devices

### 🔧 Backend Changes:

- Added `PATCH /api/tasks/:id` endpoint for partial updates
- New task fields:
  - `priority`: 'high' | 'medium' | 'low'
  - `columnId`: current column ID
  - `modelUsed`: AI model name
  - `agentSession`: session identifier
  - `completedAt`: completion timestamp
- Enhanced move endpoint to track columnId and completion time
- Slack notifications for priority changes

### 📱 Frontend Changes:

- Priority selector dropdown (click emoji to change)
- Status check modal with detailed task info
- Agent/model info display
- Mobile move buttons as drag-and-drop alternative
- Priority-based sorting within columns
- Completion time formatting
- Enhanced task metadata display

## Deployment Steps

### 1. Prerequisites

Make sure you have:
- Node.js installed
- Fly.io CLI installed (`curl -L https://fly.io/install.sh | sh`)
- Authenticated with Fly.io (`flyctl auth login`)
- Access to the kanban-server app on Fly.io

### 2. Build Frontend

```bash
cd /home/arlo/.openclaw/workspace/kanban-app
npm install  # if needed
npm run build
```

### 3. Copy Build to Server

```bash
cd /home/arlo/.openclaw/workspace/kanban-server
rm -rf public/*
cp -r ../kanban-app/build/* public/
```

### 4. Test Locally (Optional)

```bash
cd /home/arlo/.openclaw/workspace/kanban-server
PORT=3001 node server.js

# In another terminal:
curl http://localhost:3001/api/health
```

### 5. Deploy to Fly.io

```bash
cd /home/arlo/.openclaw/workspace/kanban-server
flyctl deploy
```

Wait for deployment to complete (~1-2 minutes).

### 6. Verify Deployment

```bash
flyctl status
curl https://kanban-server.fly.dev/api/health
```

Open browser: https://kanban-server.fly.dev

### 7. Reset Board (Optional)

If you want to populate the board with updated default tasks:

```bash
curl -X POST https://kanban-server.fly.dev/api/reset
```

This will add the new fields (priority, columnId, etc.) to all tasks.

## Quick Deploy Script

Create a file `deploy.sh`:

```bash
#!/bin/bash
set -e

echo "🦞 Building Kanban Board..."
cd /home/arlo/.openclaw/workspace/kanban-app
npm run build

echo "📦 Copying build to server..."
cd /home/arlo/.openclaw/workspace/kanban-server
rm -rf public/*
cp -r ../kanban-app/build/* public/

echo "🚀 Deploying to Fly.io..."
flyctl deploy

echo "✅ Deployment complete!"
echo "🌐 Live at: https://kanban-server.fly.dev"
```

Then run:
```bash
chmod +x deploy.sh
./deploy.sh
```

## Troubleshooting

### "No access token available"
Run: `flyctl auth login` and follow the prompts

### Build fails
- Check Node.js version: `node --version` (should be v16+)
- Clear cache: `rm -rf node_modules package-lock.json && npm install`

### Deploy fails
- Check Fly.io status: `flyctl status`
- View logs: `flyctl logs`
- Check app info: `flyctl apps list`

### API not responding
- Check deployment: `flyctl status`
- View logs: `flyctl logs -a kanban-server`
- Restart app: `flyctl apps restart kanban-server`

## Environment Variables

Set via Fly.io secrets:

```bash
flyctl secrets set SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
```

## Data Backup

The board data is stored in `/data/board-data.json` on the Fly.io volume.

To backup:
```bash
flyctl ssh console -a kanban-server
cat /data/board-data.json
```

## Git Workflow

Always commit changes before deploying:

```bash
# In kanban-app
cd /home/arlo/.openclaw/workspace/kanban-app
git add src/App.tsx src/App.css
git commit -m "Add task management features"
git push

# In kanban-server
cd /home/arlo/.openclaw/workspace/kanban-server
git add server.js public/
git commit -m "Update server with new endpoints and frontend build"
git push
```

## API Reference

### New Endpoints:

**PATCH /api/tasks/:id**
Partially update a task (priority, status, etc.)

```bash
curl -X PATCH https://kanban-server.fly.dev/api/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"priority": "high"}'
```

**PUT /api/tasks/:id/move**
Move task between columns (enhanced)

```bash
curl -X PUT https://kanban-server.fly.dev/api/tasks/1/move \
  -H "Content-Type: application/json" \
  -d '{"fromColumn": "todo", "toColumn": "in-progress"}'
```

## Features Usage

### For Eddie:

1. **Set Priority**: Click the priority emoji (🔴/🟡/🟢) on any task
2. **Check Status**: Click "📊 Status" button to see task details
3. **Move Tasks**: 
   - Drag and drop (desktop)
   - Use arrow buttons (mobile/touch)
4. **Track Progress**: Status modal shows time elapsed and completion info

### For Arlo:

When creating tasks via API, include:
```json
{
  "title": "Task name",
  "description": "Details",
  "assignee": "Arlo",
  "priority": "high",
  "modelUsed": "Sonnet 4.5",
  "agentSession": "agent:main:subagent:abc123"
}
```

---

**Last Updated**: Feb 7, 2026
**Version**: 2.0 (Task Management Enhanced)
