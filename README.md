# 🦞 Kanban Board - Eddie's Project Management

A lightweight, mobile-responsive kanban board for tracking Eddie's audiology business projects.

**Live URL:** https://kanban-server.fly.dev/  
**Repository:** https://github.com/arlo-e-dev/eddie-kanban

---

## ✨ Features (v3.0 - Enhanced)

### Core Functionality
- ✅ **Drag-and-drop** task movement (desktop)
- ✅ **Touch-friendly buttons** for mobile (44px+ targets)
- ✅ **Sub-agent progress tracking** with ETA and status indicators
- ✅ **Priority markers** (🔴 High, 🟡 Medium, 🟢 Low) with sorting
- ✅ **Model/Agent assignment** display (shows which AI is working)
- ✅ **Mobile-responsive** design (works perfectly on 375px+ screens)

### Task Management
- Create, edit, delete tasks
- Move tasks between columns (To Do, In Progress, Done)
- Set priority levels
- Assign tasks to people or agents
- Track which AI model is working
- Monitor sub-agent progress with real-time status

### Technical
- Pure HTML/CSS/JavaScript (no build process)
- Express.js backend with JSON file storage
- Fly.io persistent volume for data
- Slack notifications for important events

---

## 🚀 Quick Start

### Local Development
```bash
cd /home/arlo/.openclaw/workspace/kanban-server
npm install
PORT=3001 node server.js
```

Open http://localhost:3001

### Deploy to Fly.io
```bash
flyctl auth login
flyctl deploy
```

See [DEPLOY-INSTRUCTIONS.md](./DEPLOY-INSTRUCTIONS.md) for detailed steps.

---

## 📖 Documentation

- **[FEATURES.md](./FEATURES.md)** - Complete feature guide and user manual
- **[DEPLOY-INSTRUCTIONS.md](./DEPLOY-INSTRUCTIONS.md)** - Deployment steps and troubleshooting
- **[COMPLETION-SUMMARY.md](./COMPLETION-SUMMARY.md)** - Implementation details and test results
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Original deployment notes (v2.0)

---

## 📦 Project Structure

```
kanban-server/
├── server.js                 # Express backend (9.7 KB)
├── board-data.json          # Task storage (persistent)
├── public/
│   ├── index.html           # UI structure (5.5 KB)
│   ├── styles.css           # Responsive styles (8.9 KB)
│   └── script.js            # Interactive features (16.4 KB)
├── FEATURES.md              # Feature documentation
├── DEPLOY-INSTRUCTIONS.md   # Deployment guide
├── COMPLETION-SUMMARY.md    # Test results
└── package.json             # Dependencies
```

---

## 🎯 Usage

### For Eddie (Managing Tasks)

**Add a task:**
1. Click "➕ Add Task"
2. Fill in title and details
3. Set priority (High/Medium/Low)
4. Save

**Move a task:**
- **Desktop:** Drag and drop between columns
- **Mobile:** Use "Move to..." dropdown

**Edit/Delete:**
- Click ✏️ to edit
- Click 🗑️ to delete

**Sort by priority:**
- Check "Sort by Priority" in header
- Tasks reorder automatically

### For Arlo (Agent Integration)

**Create task via API:**
```bash
curl -X POST https://kanban-server.fly.dev/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Build Authentication",
    "description": "JWT-based auth system",
    "priority": "high",
    "assignee": "Arlo",
    "modelUsed": "Sonnet 4.5",
    "agentType": "subagent",
    "subagentId": "2dd55328-a84a-4800-81bd-38764acc0a5d",
    "requestStatus": "in-progress",
    "eta": 120
  }'
```

**Update progress:**
```bash
curl -X PATCH https://kanban-server.fly.dev/api/tasks/12345 \
  -H "Content-Type: application/json" \
  -d '{"requestStatus": "in-progress", "eta": 45}'
```

---

## 🌟 What's New in v3.0

| Feature | Status | Description |
|---------|--------|-------------|
| Drag-and-drop | ✅ | Move tasks between columns with smooth animations |
| Status buttons | ✅ | Touch-friendly 44px+ buttons for mobile |
| Sub-agent tracking | ✅ | Show which agent is working, ETA, and progress |
| Priority system | ✅ | 🔴🟡🟢 badges with sort option |
| Model display | ✅ | Shows AI model and agent type |
| Mobile-first | ✅ | Works perfectly on 375px screens |
| Vanilla JS | ✅ | No React, no build process |

---

## 📸 Screenshots

**Desktop View:**
![Desktop](https://via.placeholder.com/800x400?text=Desktop+View)

**Mobile View:**
![Mobile](https://via.placeholder.com/375x667?text=Mobile+View)

*(Screenshots available in COMPLETION-SUMMARY.md)*

---

## 🛠️ API Reference

### Endpoints

**GET /api/board**  
Fetch entire board state

**POST /api/tasks**  
Create new task

**PUT /api/tasks/:id**  
Update task (full replacement)

**PATCH /api/tasks/:id**  
Partially update task

**DELETE /api/tasks/:id**  
Delete task

**PUT /api/tasks/:id/move**  
Move task between columns

**POST /api/reset**  
Reset board to defaults

**GET /api/health**  
Health check

---

## 🔧 Configuration

### Environment Variables
```bash
PORT=3001                    # Server port (default: 3001)
SLACK_WEBHOOK_URL=...        # Slack notifications
NODE_ENV=production          # Use /data volume for storage
```

### Fly.io Secrets
```bash
flyctl secrets set SLACK_WEBHOOK_URL="https://hooks.slack.com/..."
```

---

## 🐛 Troubleshooting

**Server won't start:**
```bash
# Check port availability
lsof -i :3001

# Install dependencies
npm install
```

**Deployment fails:**
```bash
# Check Fly.io status
flyctl status

# View logs
flyctl logs
```

**Old version showing:**
- Hard refresh browser (Ctrl+Shift+R)
- Check deployment version: `flyctl releases`

---

## 📊 Tech Stack

- **Frontend:** HTML5, CSS3, JavaScript (ES6+)
- **Backend:** Node.js 18+, Express 5.2
- **Storage:** JSON file + Fly.io volume
- **Hosting:** Fly.io
- **Version Control:** Git + GitHub

---

## 🤝 Contributing

This is a personal project for Eddie's business, but improvements are welcome!

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

## 📜 License

ISC

---

## 👥 Credits

**Created by:** Arlo (OpenClaw AI Assistant)  
**For:** Eddie's Audiology Business  
**Date:** February 2026  
**Version:** 3.0 (Enhanced Features)

---

## 📞 Support

**Issues?**
- Check [FEATURES.md](./FEATURES.md) for feature details
- Check [DEPLOY-INSTRUCTIONS.md](./DEPLOY-INSTRUCTIONS.md) for deployment help
- View logs: `flyctl logs -a kanban-server`
- Open an issue on GitHub

---

**Happy task managing! 🎉**
