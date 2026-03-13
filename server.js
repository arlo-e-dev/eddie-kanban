const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const isVercel = !!process.env.VERCEL;

const DATA_DIR = process.env.NODE_ENV === 'production' ? '/data' : __dirname;
const DATA_FILE = path.join(DATA_DIR, 'board-data.json');
const FRONTEND_PATH = path.join(__dirname, 'public');
const DB_ROW_ID = 'main';

app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND_PATH));

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('supabase.com') ? { rejectUnauthorized: false } : undefined
    })
  : null;

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
    return value.split(',').map(item => item.trim()).filter(Boolean);
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
      version: 2,
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
        environment: 'Vercel',
        owner: 'Arlo',
        url: '',
        repoUrl: 'https://github.com/arlo-e-dev/eddie-kanban',
        notes: 'Upgraded from simple board into org dashboard.',
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
          deployUrl: '',
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

async function ensureDb() {
  if (!pool) return;
  await pool.query(`
    create table if not exists dashboard_state (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);
}

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

async function loadData() {
  if (pool) {
    await ensureDb();
    const { rows } = await pool.query('select data from dashboard_state where id = $1 limit 1', [DB_ROW_ID]);
    if (rows.length && rows[0].data) return rows[0].data;
    const seeded = cloneDefaultState();
    await pool.query(
      'insert into dashboard_state (id, data, updated_at) values ($1, $2::jsonb, now()) on conflict (id) do update set data = excluded.data, updated_at = now()',
      [DB_ROW_ID, JSON.stringify(seeded)]
    );
    return seeded;
  }

  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error loading data:', err);
  }
  return cloneDefaultState();
}

async function saveData(data) {
  data.meta = {
    ...(data.meta || {}),
    lastUpdatedAt: nowIso()
  };

  if (pool) {
    await ensureDb();
    await pool.query(
      'insert into dashboard_state (id, data, updated_at) values ($1, $2::jsonb, now()) on conflict (id) do update set data = excluded.data, updated_at = now()',
      [DB_ROW_ID, JSON.stringify(data)]
    );
    return;
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function pushActivity(data, message, type = 'system', meta = {}) {
  data.activity = data.activity || [];
  data.activity.unshift(createHistoryEvent(type, message, meta));
  data.activity = data.activity.slice(0, 50);
}

function ensureColumnTaskMembership(data, taskId, toColumn) {
  data.columns.forEach(column => {
    column.taskIds = column.taskIds.filter(id => id !== taskId);
  });

  const target = data.columns.find(column => column.id === toColumn);
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
    liveProjects: (data.projects || []).filter(project => project.status === 'live').length,
    totalProjects: (data.projects || []).length,
    spendUsd: data.metrics?.apiUsage?.spendUsd || 0,
    budgetUsd: data.metrics?.apiUsage?.budgetUsd || 0
  };
}

async function withBoard(mutator) {
  const data = await loadData();
  const result = await mutator(data);
  return result;
}

app.get('/api/board', async (req, res) => {
  res.json(await loadData());
});

app.get('/api/summary', async (req, res) => {
  const data = await loadData();
  res.json(summaryFromBoard(data));
});

app.put('/api/board', async (req, res) => {
  const data = req.body;
  pushActivity(data, 'Board was replaced via API.', 'system');
  await saveData(data);
  res.json({ success: true, data });
});

app.post('/api/tasks', async (req, res) => {
  const data = await loadData();
  const id = req.body.id || `task-${Date.now()}`;
  const task = normalizeTaskInput({ ...req.body, id });
  task.id = id;
  task.createdAt = nowIso();
  task.updatedAt = task.createdAt;
  task.completedAt = task.status === 'completed' ? task.createdAt : null;
  task.createdBy = req.body.createdBy || 'Dashboard';
  task.history = [createHistoryEvent('created', `Task created: ${task.title}`, { createdBy: task.createdBy })];

  if (!task.title) return res.status(400).json({ error: 'Task title is required' });

  data.tasks[id] = task;
  ensureColumnTaskMembership(data, id, task.columnId);
  pushActivity(data, `Task added: ${task.title}`, 'task', { taskId: id });
  await saveData(data);

  const priorityEmoji = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';
  await notifySlack(`📋 New dashboard task: ${task.title} ${priorityEmoji}`);

  res.json({ success: true, task });
});

app.put('/api/tasks/:id', async (req, res) => {
  const data = await loadData();
  const { id } = req.params;
  const existing = data.tasks[id];
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  const task = normalizeTaskInput(req.body, existing);
  task.id = id;
  task.createdAt = existing.createdAt;
  task.updatedAt = nowIso();
  task.completedAt = task.status === 'completed' ? (existing.completedAt || nowIso()) : null;
  task.history = [createHistoryEvent('updated', `Task updated: ${task.title}`), ...(existing.history || [])].slice(0, 30);

  data.tasks[id] = task;
  ensureColumnTaskMembership(data, id, task.columnId);
  pushActivity(data, `Task updated: ${task.title}`, 'task', { taskId: id });
  await saveData(data);

  res.json({ success: true, task });
});

app.patch('/api/tasks/:id', async (req, res) => {
  const data = await loadData();
  const { id } = req.params;
  const existing = data.tasks[id];
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  const before = { ...existing };
  const task = normalizeTaskInput(req.body, existing);
  task.id = id;
  task.createdAt = existing.createdAt;
  task.updatedAt = nowIso();
  task.completedAt = task.status === 'completed' ? (existing.completedAt || nowIso()) : null;

  const changes = Object.keys(req.body).filter(key => JSON.stringify(before[key]) !== JSON.stringify(task[key]));
  task.history = changes.length
    ? [createHistoryEvent('updated', `Updated ${changes.join(', ')}`, { changes }), ...(existing.history || [])].slice(0, 30)
    : existing.history || [];

  data.tasks[id] = task;
  ensureColumnTaskMembership(data, id, task.columnId);
  pushActivity(data, `Task changed: ${task.title}`, 'task', { taskId: id, changes });
  await saveData(data);

  if (task.columnId === 'waiting-on-eddie' && before.columnId !== 'waiting-on-eddie') {
    await notifySlack(`🛎️ Waiting on Eddie: ${task.title}`);
  }
  if (task.status === 'blocked' && before.status !== 'blocked') {
    await notifySlack(`🚫 Task blocked: ${task.title}`);
  }

  res.json({ success: true, task });
});

app.delete('/api/tasks/:id', async (req, res) => {
  const data = await loadData();
  const { id } = req.params;
  const existing = data.tasks[id];
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  delete data.tasks[id];
  data.columns.forEach(column => {
    column.taskIds = column.taskIds.filter(taskId => taskId !== id);
  });
  pushActivity(data, `Task deleted: ${existing.title}`, 'task', { taskId: id });
  await saveData(data);

  res.json({ success: true });
});

app.put('/api/tasks/:id/move', async (req, res) => {
  const data = await loadData();
  const { id } = req.params;
  const { toColumn } = req.body;
  const task = data.tasks[id];
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const target = data.columns.find(column => column.id === toColumn);
  if (!target) return res.status(400).json({ error: 'Invalid target column' });

  let status = task.status;
  if (toColumn === 'todo') status = 'pending';
  if (toColumn === 'waiting-on-eddie') status = 'waiting';
  if (toColumn === 'in-progress') status = 'active';
  if (toColumn === 'blocked') status = 'blocked';
  if (toColumn === 'done') status = 'completed';

  const nextActionBy = toColumn === 'waiting-on-eddie' ? 'Eddie' : task.nextActionBy || 'Arlo';

  data.tasks[id] = {
    ...task,
    columnId: toColumn,
    status,
    nextActionBy,
    completedAt: toColumn === 'done' ? (task.completedAt || nowIso()) : null,
    updatedAt: nowIso(),
    history: [createHistoryEvent('moved', `Moved to ${target.title}`, { toColumn }), ...(task.history || [])].slice(0, 30)
  };

  ensureColumnTaskMembership(data, id, toColumn);
  pushActivity(data, `Task moved: ${task.title} → ${target.title}`, 'task', { taskId: id, toColumn });
  await saveData(data);

  res.json({ success: true, task: data.tasks[id] });
});

app.get('/api/projects', async (req, res) => {
  const data = await loadData();
  res.json(data.projects || []);
});

app.patch('/api/projects/:id', async (req, res) => {
  const data = await loadData();
  const project = (data.projects || []).find(item => item.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  Object.assign(project, req.body, { updatedAt: nowIso() });
  pushActivity(data, `Project updated: ${project.name}`, 'project', { projectId: project.id });
  await saveData(data);
  res.json({ success: true, project });
});

app.get('/api/github', async (req, res) => {
  const data = await loadData();
  res.json(data.github || {});
});

app.patch('/api/github', async (req, res) => {
  const data = await loadData();
  data.github = { ...data.github, ...req.body };
  pushActivity(data, 'GitHub section updated.', 'github');
  await saveData(data);
  res.json({ success: true, github: data.github });
});

app.get('/api/metrics', async (req, res) => {
  const data = await loadData();
  res.json(data.metrics || {});
});

app.patch('/api/metrics', async (req, res) => {
  const data = await loadData();
  data.metrics = {
    ...data.metrics,
    ...req.body,
    apiUsage: { ...(data.metrics?.apiUsage || {}), ...(req.body.apiUsage || {}) },
    hostedProjects: { ...(data.metrics?.hostedProjects || {}), ...(req.body.hostedProjects || {}) }
  };
  pushActivity(data, 'Metrics updated.', 'metric');
  await saveData(data);
  res.json({ success: true, metrics: data.metrics });
});

app.get('/api/activity', async (req, res) => {
  const data = await loadData();
  res.json(data.activity || []);
});

app.post('/api/reset', async (req, res) => {
  const data = cloneDefaultState();
  await saveData(data);
  res.json({ success: true, data });
});

app.get('/api/health', async (req, res) => {
  res.json({ status: 'ok', timestamp: nowIso(), storage: pool ? 'postgres' : 'json-file', platform: isVercel ? 'vercel' : 'local-or-fly' });
});

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    res.sendFile(path.join(FRONTEND_PATH, 'index.html'));
  } else {
    next();
  }
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dashboard server running on http://0.0.0.0:${PORT}`);
    console.log(`Storage: ${pool ? 'postgres' : DATA_FILE}`);
  });
}

module.exports = app;
