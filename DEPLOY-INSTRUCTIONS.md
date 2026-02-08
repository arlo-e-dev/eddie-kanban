# 🚀 Quick Deployment Instructions

## Your Code is Ready! ✅

All enhancements have been implemented and pushed to GitHub:
- Repository: https://github.com/arlo-e-dev/eddie-kanban
- Branch: `main`
- Commit: `50b6cae` - "Enhanced kanban board with all 5 features"

---

## To Deploy to Fly.io

### Option 1: One-Line Deploy (If Already Authenticated)

```bash
cd /home/arlo/.openclaw/workspace/kanban-server && ~/.fly/bin/flyctl deploy
```

### Option 2: Authenticate First (If Needed)

```bash
# 1. Login to Fly.io
~/.fly/bin/flyctl auth login

# 2. Deploy
cd /home/arlo/.openclaw/workspace/kanban-server
~/.fly/bin/flyctl deploy
```

**Expected output:**
```
==> Verifying app config
--> Verified app config
==> Building image
...
==> Pushing image to fly
...
==> Monitoring deployment
 1 desired, 1 placed, 1 healthy, 0 unhealthy
--> v10 deployed successfully
```

### Option 3: Check Current Deployment

Your previous version may still be live. To verify:

```bash
# Check status
~/.fly/bin/flyctl status

# View current version
curl https://kanban-server.fly.dev/api/health
```

---

## What Was Changed

### Files Created/Modified:
```
✅ public/index.html    - New enhanced UI (5.5 KB)
✅ public/styles.css    - Mobile-first responsive styles (8.9 KB)
✅ public/script.js     - All interactive features (16.4 KB)
✅ FEATURES.md          - Complete feature documentation
✅ DEPLOY-INSTRUCTIONS.md - This file
```

### Files Removed:
```
❌ public/asset-manifest.json
❌ public/static/js/*.js
❌ public/static/css/*.css
❌ public/logo*.png
❌ public/favicon.ico
(All React build artifacts)
```

**Why?** Replaced React build with simpler vanilla JS implementation. No build process needed!

---

## Test Locally First (Optional)

```bash
# Start server
cd /home/arlo/.openclaw/workspace/kanban-server
PORT=3001 node server.js

# In browser, open:
http://localhost:3001

# Test API:
curl http://localhost:3001/api/board | jq
```

---

## After Deployment

### 1. Verify it's live
```bash
curl https://kanban-server.fly.dev/api/health
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "2026-02-08T..."
}
```

### 2. Test in browser
Open: https://kanban-server.fly.dev/

You should see:
- ✅ 3 columns (To Do, In Progress, Done)
- ✅ Existing tasks with new priority badges
- ✅ "➕ Add Task" button
- ✅ "Sort by Priority" checkbox
- ✅ Responsive layout

### 3. Test new features

**Create a test task with all new fields:**
```bash
curl -X POST https://kanban-server.fly.dev/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Enhanced Features",
    "description": "Verify all 5 features work",
    "priority": "high",
    "assignee": "Test User",
    "modelUsed": "Sonnet 4.5",
    "agentType": "subagent",
    "subagentId": "abc123-test-xyz789",
    "requestStatus": "in-progress",
    "eta": 30
  }'
```

**Expected result in UI:**
- Task appears in "To Do" column
- Shows 🔴 (high priority badge)
- Displays sub-agent progress section with:
  - 🔄 IN PROGRESS status
  - 🤖 abc123... sub-agent ID
  - ⏱️ ETA: ~30 min
  - Animated progress bar
- Meta tags show: 👤 Test User, 🤖 Sonnet 4.5, ⚙️ subagent

### 4. Test drag-and-drop
- Drag the task to "In Progress" column
- Should animate smoothly and update server

### 5. Test mobile view
- Open browser DevTools (F12)
- Toggle device toolbar (Ctrl+Shift+M)
- Select "iPhone SE" or "iPhone 12"
- Verify all buttons are easy to tap

---

## Troubleshooting

### "No access token available"
**Solution:**
```bash
~/.fly/bin/flyctl auth login
```

This opens a browser to authenticate. Once done, re-run deploy.

### "Error: Could not find App"
**Check app name in fly.toml:**
```bash
cat fly.toml | grep app
```

Should be: `app = "kanban-server"`

If different, update or specify:
```bash
~/.fly/bin/flyctl deploy -a kanban-server
```

### Deployment hangs
**Check logs in another terminal:**
```bash
~/.fly/bin/flyctl logs -a kanban-server
```

### Old version still showing
**Hard refresh browser:**
- Chrome/Edge: Ctrl+Shift+R
- Firefox: Ctrl+F5
- Safari: Cmd+Shift+R

Or check server timestamp:
```bash
curl -s https://kanban-server.fly.dev/api/health | jq .timestamp
```

### Task data looks wrong
**Reset to defaults:**
```bash
curl -X POST https://kanban-server.fly.dev/api/reset
```

---

## Rollback (If Needed)

If something breaks, rollback to previous version:

```bash
# List recent deployments
~/.fly/bin/flyctl releases -a kanban-server

# Rollback to previous
~/.fly/bin/flyctl releases rollback -a kanban-server
```

Or restore React version:
```bash
cd /home/arlo/.openclaw/workspace/kanban-server
mv public public-new
mv public-react-backup public
~/.fly/bin/flyctl deploy
```

---

## Questions?

**What changed?**
Read [FEATURES.md](./FEATURES.md) for complete documentation.

**How to use new features?**
See "User Guide" section in FEATURES.md.

**Need help?**
Check Fly.io logs:
```bash
~/.fly/bin/flyctl logs -a kanban-server
```

---

## Summary

✅ **Code Status**: Ready to deploy  
✅ **Git Status**: Pushed to `main` branch  
✅ **Backend**: Fully supports new fields  
✅ **Frontend**: Enhanced with all 5 features  
✅ **Mobile**: Optimized for 375px+ screens  
✅ **Documentation**: Complete in FEATURES.md  

**Next Step**: Run `~/.fly/bin/flyctl deploy` 🚀
