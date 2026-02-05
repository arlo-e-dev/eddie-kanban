const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

// Send Slack notification
async function notifySlack(message) {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message })
    });
  } catch (err) {
    console.error('Slack notification failed:', err.message);
  }
}
// Use /data (Fly volume) if available, otherwise local
const DATA_DIR = process.env.NODE_ENV === 'production' ? '/data' : __dirname;
const DATA_FILE = path.join(DATA_DIR, 'board-data.json');
const FRONTEND_PATH = path.join(__dirname, 'public');

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(FRONTEND_PATH));

// Default board state
const defaultState = {
  tasks: {
    '1': { 
      id: '1', 
      title: 'Setup browser extension', 
      description: 'Install and configure OpenClaw browser relay',
      status: 'pending',
      assignee: 'Eddie',
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    '2': { 
      id: '2', 
      title: 'Create GitHub account', 
      description: 'Setup arlo-e-dev GitHub for projects',
      status: 'completed',
      assignee: 'Eddie',
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    '3': { 
      id: '3', 
      title: 'Build Kanban MVP', 
      description: 'React app with drag-drop functionality',
      status: 'completed',
      assignee: 'Arlo',
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    '4': { 
      id: '4', 
      title: 'Setup Slack integration', 
      description: 'OpenClaw connected to #arlo-e channel',
      status: 'completed',
      assignee: 'Arlo',
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
  },
  columns: [
    { id: 'todo', title: 'To Do', taskIds: ['1'] },
    { id: 'in-progress', title: 'In Progress', taskIds: [] },
    { id: 'done', title: 'Done', taskIds: ['2', '3', '4'] },
  ],
};

// Load or initialize data
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error loading data:', err);
  }
  return defaultState;
}

// Save data to file
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Initialize
let boardData = loadData();

// GET - fetch entire board
app.get('/api/board', (req, res) => {
  res.json(boardData);
});

// PUT - update entire board
app.put('/api/board', (req, res) => {
  boardData = req.body;
  saveData(boardData);
  res.json({ success: true, data: boardData });
});

// POST - add a task
app.post('/api/tasks', (req, res) => {
  const task = {
    ...req.body,
    id: req.body.id || Date.now().toString(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: req.body.status || 'pending'
  };
  
  boardData.tasks[task.id] = task;
  
  // Add to todo column if not specified
  const targetColumn = req.body.columnId || 'todo';
  const column = boardData.columns.find(c => c.id === targetColumn);
  if (column && !column.taskIds.includes(task.id)) {
    column.taskIds.push(task.id);
  }
  
  saveData(boardData);
  
  // Notify Slack
  const assignee = task.assignee ? ` (assigned to ${task.assignee})` : '';
  notifySlack(`📋 *New task added:* ${task.title}${assignee}`);
  
  res.json({ success: true, task });
});

// PUT - update a task
app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  if (!boardData.tasks[id]) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  const oldTask = { ...boardData.tasks[id] };
  
  boardData.tasks[id] = {
    ...boardData.tasks[id],
    ...req.body,
    id, // ensure id doesn't change
    updatedAt: Date.now()
  };
  
  saveData(boardData);
  
  // Notify Slack if status changed to blocked
  const task = boardData.tasks[id];
  if (task.status === 'blocked' && oldTask.status !== 'blocked') {
    notifySlack(`🚫 *Task blocked:* "${task.title}" - ${task.blockedReason || 'No reason given'}`);
  }
  
  res.json({ success: true, task: boardData.tasks[id] });
});

// DELETE - remove a task
app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  if (!boardData.tasks[id]) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  delete boardData.tasks[id];
  
  // Remove from all columns
  boardData.columns.forEach(col => {
    col.taskIds = col.taskIds.filter(taskId => taskId !== id);
  });
  
  saveData(boardData);
  res.json({ success: true });
});

// PUT - move task between columns
app.put('/api/tasks/:id/move', (req, res) => {
  const { id } = req.params;
  const { fromColumn, toColumn } = req.body;
  
  if (!boardData.tasks[id]) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  // Remove from source column
  boardData.columns.forEach(col => {
    col.taskIds = col.taskIds.filter(taskId => taskId !== id);
  });
  
  // Add to target column
  const target = boardData.columns.find(c => c.id === toColumn);
  if (target) {
    target.taskIds.push(id);
  }
  
  // Update task status based on column
  let newStatus = boardData.tasks[id].status;
  if (toColumn === 'done') newStatus = 'completed';
  else if (toColumn === 'in-progress') newStatus = 'active';
  else if (toColumn === 'todo') newStatus = 'pending';
  
  boardData.tasks[id] = {
    ...boardData.tasks[id],
    status: newStatus,
    updatedAt: Date.now()
  };
  
  saveData(boardData);
  
  // Notify Slack
  const task = boardData.tasks[id];
  const statusEmoji = newStatus === 'completed' ? '✅' : newStatus === 'active' ? '🔄' : '📋';
  const colName = target ? target.title : toColumn;
  notifySlack(`${statusEmoji} *Task moved:* "${task.title}" → ${colName}`);
  
  res.json({ success: true, task: boardData.tasks[id] });
});

// POST - reset to default
app.post('/api/reset', (req, res) => {
  boardData = JSON.parse(JSON.stringify(defaultState));
  boardData.tasks['1'].createdAt = Date.now();
  boardData.tasks['1'].updatedAt = Date.now();
  boardData.tasks['2'].createdAt = Date.now();
  boardData.tasks['2'].updatedAt = Date.now();
  boardData.tasks['3'].createdAt = Date.now();
  boardData.tasks['3'].updatedAt = Date.now();
  boardData.tasks['4'].createdAt = Date.now();
  boardData.tasks['4'].updatedAt = Date.now();
  saveData(boardData);
  res.json({ success: true, data: boardData });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve React app for all other routes (SPA catch-all)
app.use((req, res, next) => {
  // Only handle GET requests that aren't API calls
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    res.sendFile(path.join(FRONTEND_PATH, 'index.html'));
  } else {
    next();
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🦞 Kanban server running on http://0.0.0.0:${PORT}`);
  console.log(`   Data file: ${DATA_FILE}`);
});
