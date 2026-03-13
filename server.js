const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

const DATA_DIR = process.env.NODE_ENV === 'production' ? '/data' : __dirname;
const DATA_FILE = path.join(DATA_DIR, 'board-data.json');
const FRONTEND_PATH = path.join(__dirname, 'public');

app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND_PATH));

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

function nowIso() {
  return new Date().toISOString();
}

function createHistoryEvent(type, message, meta = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type,
    message,
    meta,
    createdAt: nowIso()
  };
}

function normalizeTextList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
}

function seedTask({
  id,
  title,
  description,
  priority = 'medium',
  assignee = '',
  nextActionBy = 'Arlo',
  columnId = 'todo',
  status = 'pending',
  waitingReason = '',
  blockedReason = '',
  dueText = '',
  tags = [],
  links = [],
  createdBy = 'Arlo',
  history = []
}) {
  const createdAt = nowIso();
  return {
    id,
    title,
    description,
    priority,
    assignee,
    nextActionBy,
    columnId,
    status,
    waitingReason,
    blockedReason,
    dueText,
    tags,
    links,
    createdBy,
    createdAt,
    updatedAt: createdAt,
    completedAt: status === 'completed' ? createdAt : null,
    history: [
      createHistoryEvent('created', `Task created: ${title}`, { createdBy }),
      ...history
    ]
  };
}

const defaultState = (() => {
  const tasks = {
    'task-workspace-dashboard': seedTask({
      id: 'task-workspace-dashboard',
      title: 'Build org dashboard on top of kanban-server',
      description: 'Upgrade the current board into a mobile-friendly operations dashboard for tasks, projects, repos, and usage tracking.',
      priority: 'high',
      assignee: 'Arlo',
      nextActionBy: 'Arlo',
      columnId: 'in-progress',
      status: 'active',
      dueText: 'Today',
      tags: ['dashboard', 'kanban', 'eddiemoger.com'],
      links: ['https://kanban-server.fly.dev'],
      createdBy: 'Eddie'
    }),
    'task-approve-workspace-flow': seedTask({
      id: 'task-approve-workspace-flow',
      title: 'Click through workspace flow and confirm blockers',
      description: 'Need Eddie to complete the screen flow so we can capture what should be represented as a blocked/waiting task in the dashboard.',
      priority: 'high',
      assignee: 'Eddie',
      nextActionBy: 'Eddie',
      columnId: 'waiting-on-eddie',
      status: 'waiting',
      waitingReason: 'Waiting for Eddie to click through the workspace flow on screen.',
      dueText: 'When available',
      tags: ['waiting-on-eddie', 'workspace'],
      createdBy: 'Arlo'
    }),
    'task-sync-hosted-projects': seedTask({
      id: 'task-sync-hosted-projects',
      title: 'Add hosted projects inventory',
      description: 'Seed the dashboard with current live apps, deploy targets, and quick links.',
      priority: 'medium',
      assignee: 'Arlo',
      nextActionBy: 'Arlo',
      columnId: 'todo',
      status: 'pending',
      dueText: 'This week',
      tags: ['ops', 'inventory'],
      createdBy: 'Arlo'
    }),
    'task-loopbox-llc': seedTask({
      id: 'task-loopbox-llc',
      title: 'LoopBox: wait for LLC + accounts',
      description: 'Build plan is ready, but product execution is blocked on business setup items from Shane.',
      priority: 'medium',
      assignee: 'External',
      nextActionBy: 'Eddie',
      columnId: 'blocked',
      status: 'blocked',
      blockedReason: 'Need LLC/EIN and platform accounts before implementation starts.',
      dueText: 'Follow up next week',
      tags: ['loopbox', 'blocked'],
      createdBy: 'Arlo'
    }),
    'task-review-api-costs': seedTask({
      id: 'task-review-api-costs',
      title: 'Review API spend tracking layout',
      description: 'Define which usage/cost metrics matter most for the dashboard glance view.',
      priority: 'low',
      assignee: 'Eddie',
      nextActionBy: 'Eddie',
      columnId: 'todo',
      status: 'pending',
      dueText: 'Later',
      tags: ['api-usage', 'metrics'],
      createdBy: 'Arlo'
    })
  };

  const columns = [
    { id: 'todo', title: 'Queued', taskIds: ['task-sync-hosted-projects', 'task-review-api-costs'] },
    { id: 'waiting-on-eddie', title: 'Waiting on Eddie', taskIds: ['task-approve-workspace-flow'] },
    { id: 'in-progress', title: 'In Progress', taskIds: ['task-workspace-dashboard'] },
    { id: 'blocked', title: 'Blocked', taskIds: ['task-loopbox-llc'] },
    { id: 'done', title: 'Done', taskIds: [] }
  ];

  const activity = [
    createHistoryEvent('system', 'Dashboard seeded with org-level sections for tasks, projects, GitHub, and API metrics.'),
    createHistoryEvent('task', 'Waiting on Eddie lane added for clear handoffs.'),
    createHistoryEvent('task', 'Dashboard build task moved into progress.')
  ];

  return {
    meta: {
      name: 'Eddie Ops Dashboard',
      version: 1,
      lastUpdatedAt: nowIso()
    },
    tasks,
    columns,
    projects: [
      {
        id: 'edi-crm',
        name: 'EDI CRM',
        status: 'live',
        environment: 'Production',
        owner: 'Eddie + Arlo',
        url: 'https://edi-crm.com',
        repoUrl: 'https://github.com/EddieJorden/edi-crm',
        notes: 'Production app. Deploys require explicit Vercel deploy + alias workflow.',
        updatedAt: nowIso()
      },
      {
        id: 'kanban-server',
        name: 'Eddie Dashboard',
        status: 'building',
        environment: 'Fly.io',
        owner: 'Arlo',
        url: 'https://kanban-server.fly.dev',
        repoUrl: 'https://github.com/arlo-e-dev/eddie-kanban',
        notes: 'Being upgraded from a simple board into the org dashboard.',
        updatedAt: nowIso()
      },
      {
        id: 'loopbox-landing',
        name: 'LoopBox Landing',
        status: 'live',
        environment: 'GitHub Pages',
        owner: 'Arlo',
        url: 'https://arlo-e-dev.github.io/swingby-landing/',
        repoUrl: 'https://github.com/arlo-e-dev/swingby-landing',
        notes: 'Static landing site live; product build not started.',
        updatedAt: nowIso()
      }
    ],
    github: {
      repos: [
        {
          id: 'repo-eddie-kanban',
          name: 'eddie-kanban',
          owner: 'arlo-e-dev',
          branch: 'main',
          repoUrl: 'https://github.com/arlo-e-dev/eddie-kanban',
          deployUrl: 'https://kanban-server.fly.dev',
          notes: 'Ops dashboard repo'
        },
        {
          id: 'repo-edi-crm',
          name: 'edi-crm',
          owner: 'EddieJorden',
          branch: 'develop',
          repoUrl: 'https://github.com/EddieJorden/edi-crm',
          deployUrl: 'https://edi-crm.com',
          notes: 'Production CRM'
        },
        {
          id: 'repo-loopbox-landing',
          name: 'swingby-landing',
          owner: 'arlo-e-dev',
          branch: 'main',
          repoUrl: 'https://github.com/arlo-e-dev/swingby-landing',
          deployUrl: 'https://arlo-e-dev.github.io/swingby-landing/',
          notes: 'LoopBox landing page'
        }
      ],
      recentActivity: [
        {
          id: 'gh-1',
          type: 'pr',
          title: 'Placeholder: show latest PRs here next',
          repo: 'eddie-kanban',
          url: 'https://github.com/arlo-e-dev/eddie-kanban',
          updatedAt: nowIso()
        },
        {
          id: 'gh-2',
          type: 'commit',
          title: 'Placeholder: recent commit history will show here',
          repo: 'edi-crm',
          url: 'https://github.com/EddieJorden/edi-crm',
          updatedAt: nowIso()
        }
      ]
    },
    metrics: {
      apiUsage: {
        periodLabel: 'Today',
        spendUsd: 0,
        budgetUsd: 10,
        status: 'tracking-soon',
        note: 'Layout ready. Hook real usage source into this section next.'
      },
      hostedProjects: {
        total: 3,
        live: 2,
        building: 1,
        issues: 0
      }
    },
    activity
  };
})();

function normalizeTaskInput(input = {}, existingTask = null) {
  const base = existingTask || {};
  const columnId = input.columnId || base.columnId || 'todo';
  const status = input.status || base.status || 'pending';
  return {
    ...base,
    ...input,
    title: (input.title ?? base.title ?? '').trim(),
    description: input.description ?? base.description ?? '',
    priority: input.priority || base.priority || 'medium',
    assignee: input.assignee ?? base.assignee ?? '',
    nextActionBy: input.nextActionBy || base.nextActionBy || 'Arlo',
    columnId,
    status,
    waitingReason: input.waitingReason ?? base.waitingReason ?? '',
    blockedReason: input.blockedReason ?? base.blockedReason ?? '',
    dueText: input.dueText ?? base.dueText ?? '',
    tags: normalizeTextList(input.tags ?? base.tags),
    links: normalizeTextList(input.links ?? base.links),
    history: Array.isArray(base.history) ? base.history : []
  };
}

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

function saveData(data) {
  data.meta = {
    ...(data.meta || {}),
    lastUpdatedAt: nowIso()
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function pushActivity(message, type = 'system', meta = {}) {
  boardData.activity.unshift(createHistoryEvent(type, message, meta));
  boardData.activity = boardData.activity.slice(0, 50);
}

function ensureColumnTaskMembership(taskId, toColumn) {
  boardData.columns.forEach(column => {
    column.taskIds = column.taskIds.filter(id => id !== taskId);
  });

  const target = boardData.columns.find(column => column.id === toColumn);
  if (target && !target.taskIds.includes(taskId)) {
    target.taskIds.push(taskId);
  }
}

function summaryFromBoard(data) {
  const tasks = Object.values(data.tasks || {});
  const waitingOnEddie = tasks.filter(task => task.nextActionBy === 'Eddie' || task.columnId === 'waiting-on-eddie').length;
  const blocked = tasks.filter(task => task.status === 'blocked' || task.columnId === 'blocked').length;
  const inProgress = tasks.filter(task => task.columnId === 'in-progress').length;
  const highPriority = tasks.filter(task => task.priority === 'high' && task.status !== 'completed').length;

  return {
    totalTasks: tasks.length,
    waitingOnEddie,
    blocked,
    inProgress,
    highPriority,
    liveProjects: data.projects.filter(project => project.status === 'live').length,
    totalProjects: data.projects.length,
    spendUsd: data.metrics?.apiUsage?.spendUsd || 0,
    budgetUsd: data.metrics?.apiUsage?.budgetUsd || 0
  };
}

let boardData = loadData();

app.get('/api/board', (req, res) => {
  res.json(boardData);
});

app.get('/api/summary', (req, res) => {
  res.json(summaryFromBoard(boardData));
});

app.put('/api/board', (req, res) => {
  boardData = req.body;
  pushActivity('Board was replaced via API.', 'system');
  saveData(boardData);
  res.json({ success: true, data: boardData });
});

app.post('/api/tasks', (req, res) => {
  const id = req.body.id || `task-${Date.now()}`;
  const task = normalizeTaskInput({ ...req.body, id });
  task.id = id;
  task.createdAt = nowIso();
  task.updatedAt = task.createdAt;
  task.completedAt = task.status === 'completed' ? task.createdAt : null;
  task.createdBy = req.body.createdBy || 'Dashboard';
  task.history = [createHistoryEvent('created', `Task created: ${task.title}`, { createdBy: task.createdBy })];

  if (!task.title) {
    return res.status(400).json({ error: 'Task title is required' });
  }

  boardData.tasks[id] = task;
  ensureColumnTaskMembership(id, task.columnId);
  pushActivity(`Task added: ${task.title}`, 'task', { taskId: id });
  saveData(boardData);

  const priorityEmoji = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';
  notifySlack(`📋 New dashboard task: ${task.title} ${priorityEmoji}`);

  res.json({ success: true, task });
});

app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const existing = boardData.tasks[id];
  if (!existing) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const task = normalizeTaskInput(req.body, existing);
  task.id = id;
  task.createdAt = existing.createdAt;
  task.updatedAt = nowIso();
  task.completedAt = task.status === 'completed' ? (existing.completedAt || nowIso()) : null;
  task.history = [
    createHistoryEvent('updated', `Task updated: ${task.title}`),
    ...(existing.history || [])
  ].slice(0, 30);

  boardData.tasks[id] = task;
  ensureColumnTaskMembership(id, task.columnId);
  pushActivity(`Task updated: ${task.title}`, 'task', { taskId: id });
  saveData(boardData);

  res.json({ success: true, task });
});

app.patch('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const existing = boardData.tasks[id];
  if (!existing) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const before = { ...existing };
  const task = normalizeTaskInput(req.body, existing);
  task.id = id;
  task.createdAt = existing.createdAt;
  task.updatedAt = nowIso();
  task.completedAt = task.status === 'completed' ? (existing.completedAt || nowIso()) : null;

  const changes = Object.keys(req.body).filter(key => JSON.stringify(before[key]) !== JSON.stringify(task[key]));
  if (changes.length) {
    task.history = [
      createHistoryEvent('updated', `Updated ${changes.join(', ')}`, { changes }),
      ...(existing.history || [])
    ].slice(0, 30);
  } else {
    task.history = existing.history || [];
  }

  boardData.tasks[id] = task;
  ensureColumnTaskMembership(id, task.columnId);
  pushActivity(`Task changed: ${task.title}`, 'task', { taskId: id, changes });
  saveData(boardData);

  if (task.columnId === 'waiting-on-eddie' && before.columnId !== 'waiting-on-eddie') {
    notifySlack(`🛎️ Waiting on Eddie: ${task.title}`);
  }

  if (task.status === 'blocked' && before.status !== 'blocked') {
    notifySlack(`🚫 Task blocked: ${task.title}`);
  }

  res.json({ success: true, task });
});

app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const existing = boardData.tasks[id];
  if (!existing) {
    return res.status(404).json({ error: 'Task not found' });
  }

  delete boardData.tasks[id];
  boardData.columns.forEach(column => {
    column.taskIds = column.taskIds.filter(taskId => taskId !== id);
  });
  pushActivity(`Task deleted: ${existing.title}`, 'task', { taskId: id });
  saveData(boardData);

  res.json({ success: true });
});

app.put('/api/tasks/:id/move', (req, res) => {
  const { id } = req.params;
  const { toColumn } = req.body;
  const task = boardData.tasks[id];

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const target = boardData.columns.find(column => column.id === toColumn);
  if (!target) {
    return res.status(400).json({ error: 'Invalid target column' });
  }

  let status = task.status;
  if (toColumn === 'todo') status = 'pending';
  if (toColumn === 'waiting-on-eddie') status = 'waiting';
  if (toColumn === 'in-progress') status = 'active';
  if (toColumn === 'blocked') status = 'blocked';
  if (toColumn === 'done') status = 'completed';

  const nextActionBy = toColumn === 'waiting-on-eddie' ? 'Eddie' : task.nextActionBy || 'Arlo';

  boardData.tasks[id] = {
    ...task,
    columnId: toColumn,
    status,
    nextActionBy,
    completedAt: toColumn === 'done' ? (task.completedAt || nowIso()) : null,
    updatedAt: nowIso(),
    history: [
      createHistoryEvent('moved', `Moved to ${target.title}`, { toColumn }),
      ...(task.history || [])
    ].slice(0, 30)
  };

  ensureColumnTaskMembership(id, toColumn);
  pushActivity(`Task moved: ${task.title} → ${target.title}`, 'task', { taskId: id, toColumn });
  saveData(boardData);

  res.json({ success: true, task: boardData.tasks[id] });
});

app.get('/api/projects', (req, res) => {
  res.json(boardData.projects);
});

app.patch('/api/projects/:id', (req, res) => {
  const project = boardData.projects.find(item => item.id === req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  Object.assign(project, req.body, { updatedAt: nowIso() });
  pushActivity(`Project updated: ${project.name}`, 'project', { projectId: project.id });
  saveData(boardData);
  res.json({ success: true, project });
});

app.get('/api/github', (req, res) => {
  res.json(boardData.github);
});

app.patch('/api/github', (req, res) => {
  boardData.github = {
    ...boardData.github,
    ...req.body
  };
  pushActivity('GitHub section updated.', 'github');
  saveData(boardData);
  res.json({ success: true, github: boardData.github });
});

app.get('/api/metrics', (req, res) => {
  res.json(boardData.metrics);
});

app.patch('/api/metrics', (req, res) => {
  boardData.metrics = {
    ...boardData.metrics,
    ...req.body,
    apiUsage: {
      ...boardData.metrics.apiUsage,
      ...(req.body.apiUsage || {})
    },
    hostedProjects: {
      ...boardData.metrics.hostedProjects,
      ...(req.body.hostedProjects || {})
    }
  };
  pushActivity('Metrics updated.', 'metric');
  saveData(boardData);
  res.json({ success: true, metrics: boardData.metrics });
});

app.get('/api/activity', (req, res) => {
  res.json(boardData.activity || []);
});

app.post('/api/reset', (req, res) => {
  boardData = JSON.parse(JSON.stringify(defaultState));
  saveData(boardData);
  res.json({ success: true, data: boardData });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: nowIso() });
});

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    res.sendFile(path.join(FRONTEND_PATH, 'index.html'));
  } else {
    next();
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard server running on http://0.0.0.0:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});
