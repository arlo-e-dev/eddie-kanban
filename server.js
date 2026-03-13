const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cookie = require('cookie');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const isVercel = !!process.env.VERCEL;
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || '';
const AUTH_ENABLED = !!(SESSION_SECRET && DASHBOARD_PASSWORD);

const DATA_DIR = process.env.NODE_ENV === 'production' ? '/data' : __dirname;
const DATA_FILE = path.join(DATA_DIR, 'board-data.json');
const FRONTEND_PATH = path.join(__dirname, 'public');
const DB_ROW_ID = 'main';

app.use(cors());
app.use(express.json());

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySession(token) {
  if (!token || !SESSION_SECRET) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (payload.exp && Date.now() > payload.exp) return null;
  return payload;
}

function sessionCookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: isVercel,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(maxAgeMs / 1000)
  };
}

function parseCookies(req) {
  return cookie.parse(req.headers.cookie || '');
}

function authMiddleware(req, res, next) {
  if (!AUTH_ENABLED) return next();
  if (req.path === '/login' || req.path === '/auth/login' || req.path === '/auth/logout' || req.path.startsWith('/styles.css')) return next();
  if (req.path === '/script.js') return next();
  const cookies = parseCookies(req);
  const session = verifySession(cookies.dashboard_session);
  if (session) {
    req.session = session;
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.redirect('/login');
}

app.use(authMiddleware);
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

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'eddie-ops-dashboard'
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function githubJson(url) {
  const response = await fetch(url, { headers: githubHeaders() });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${response.status}: ${text}`);
  }
  return response.json();
}

async function refreshGitHubData(data, force = false) {
  const existing = data.github || { repos: [], recentActivity: [] };
  const lastFetched = existing.fetchedAt ? new Date(existing.fetchedAt).getTime() : 0;
  const staleMs = 15 * 60 * 1000;
  if (!force && lastFetched && Date.now() - lastFetched < staleMs) {
    return existing;
  }

  const repos = await Promise.all((existing.repos || []).map(async repo => {
    try {
      const full = `${repo.owner}/${repo.name}`;
      const repoMeta = await githubJson(`https://api.github.com/repos/${full}`);
      const prs = await githubJson(`https://api.github.com/repos/${full}/pulls?state=all&per_page=3`);
      const commits = await githubJson(`https://api.github.com/repos/${full}/commits?per_page=3`);

      const recentPrs = prs.map(pr => ({
        id: `pr-${repo.name}-${pr.number}`,
        type: 'pr',
        title: `PR #${pr.number}: ${pr.title}`,
        repo: repo.name,
        url: pr.html_url,
        updatedAt: pr.updated_at,
        state: pr.state,
        author: pr.user?.login || 'unknown'
      }));

      const recentCommits = commits.map(commit => ({
        id: `commit-${repo.name}-${commit.sha}`,
        type: 'commit',
        title: `${commit.sha.slice(0, 7)} · ${String(commit.commit?.message || '').split('\n')[0]}`,
        repo: repo.name,
        url: commit.html_url,
        updatedAt: commit.commit?.author?.date,
        author: commit.author?.login || commit.commit?.author?.name || 'unknown'
      }));

      return {
        ...repo,
        branch: repoMeta.default_branch,
        isPrivate: repoMeta.private,
        pushedAt: repoMeta.pushed_at,
        openIssues: repoMeta.open_issues_count,
        stars: repoMeta.stargazers_count,
        recentPrs,
        recentCommits
      };
    } catch (error) {
      return {
        ...repo,
        fetchError: error.message,
        recentPrs: repo.recentPrs || [],
        recentCommits: repo.recentCommits || []
      };
    }
  }));

  const recentActivity = repos
    .flatMap(repo => ([...(repo.recentPrs || []), ...(repo.recentCommits || [])]))
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, 12);

  data.github = {
    ...existing,
    repos,
    recentActivity,
    fetchedAt: nowIso()
  };

  return data.github;
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
  notes = [],
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
    notes,
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
        status: 'live',
        environment: 'Vercel',
        owner: 'Arlo',
        url: 'https://workspace-nine-lemon-81.vercel.app',
        repoUrl: 'https://github.com/arlo-e-dev/eddie-kanban',
        notes: 'Primary live dashboard. Use this dark-mode Vercel deployment only.',
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
          deployUrl: 'https://workspace-nine-lemon-81.vercel.app',
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
        periodLabel: 'Month (estimated)',
        spendUsd: 425,
        budgetUsd: 1000,
        status: 'estimated',
        note: 'Estimated monthly model/tooling burn. Replace with live telemetry next.'
      },
      hostedProjects: {
        total: 3,
        live: 3,
        building: 0,
        issues: 0
      },
      modelOps: {
        chatgptSubscriptionUsd: 200,
        anthropicApiEstimateUsd: 150,
        qwenEnergyEstimateUsd: 75,
        estimatedMonthlyUsd: 425,
        note: 'Current estimate: $200 ChatGPT subscription + ~$150 Anthropic/API usage + ~$75 Qwen cluster energy. These are editable estimates until live usage/power telemetry is wired in.'
      },
      revenue: {
        targetMonthlyUsd: 5000,
        collectedMonthlyUsd: 0,
        note: 'Initial target placeholder so investment burn can be compared against near-term business goals.'
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
    notes: Array.isArray(base.notes) ? base.notes : [],
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

function upgradeData(data) {
  const upgraded = { ...cloneDefaultState(), ...(data || {}) };
  upgraded.meta = { ...cloneDefaultState().meta, ...(data?.meta || {}) };
  upgraded.tasks = upgraded.tasks || {};
  Object.values(upgraded.tasks).forEach(task => {
    task.notes = Array.isArray(task.notes) ? task.notes : [];
    task.tags = Array.isArray(task.tags) ? task.tags : [];
    task.links = Array.isArray(task.links) ? task.links : [];
    task.history = Array.isArray(task.history) ? task.history : [];
  });

  upgraded.metrics = {
    ...cloneDefaultState().metrics,
    ...(data?.metrics || {}),
    apiUsage: { ...cloneDefaultState().metrics.apiUsage, ...(data?.metrics?.apiUsage || {}) },
    hostedProjects: { ...cloneDefaultState().metrics.hostedProjects, ...(data?.metrics?.hostedProjects || {}) },
    modelOps: { ...cloneDefaultState().metrics.modelOps, ...(data?.metrics?.modelOps || {}) },
    revenue: { ...cloneDefaultState().metrics.revenue, ...(data?.metrics?.revenue || {}) }
  };

  upgraded.projects = (data?.projects || cloneDefaultState().projects).map(project => {
    if (project.id === 'kanban-server' || project.name === 'Eddie Dashboard') {
      return {
        ...project,
        status: 'live',
        environment: 'Vercel',
        url: 'https://workspace-nine-lemon-81.vercel.app',
        notes: 'Primary live dashboard. Use this dark-mode Vercel deployment only.'
      };
    }
    return project;
  });

  upgraded.github = {
    ...cloneDefaultState().github,
    ...(data?.github || {}),
    repos: (data?.github?.repos || cloneDefaultState().github.repos).map(repo => {
      if (repo.name === 'eddie-kanban') {
        return { ...repo, deployUrl: 'https://workspace-nine-lemon-81.vercel.app' };
      }
      return repo;
    }),
    recentActivity: data?.github?.recentActivity || cloneDefaultState().github.recentActivity
  };

  upgraded.activity = Array.isArray(upgraded.activity) ? upgraded.activity : [];
  return upgraded;
}

async function loadData() {
  if (pool) {
    await ensureDb();
    const { rows } = await pool.query('select data from dashboard_state where id = $1 limit 1', [DB_ROW_ID]);
    if (rows.length && rows[0].data) return upgradeData(rows[0].data);
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
      return upgradeData(JSON.parse(raw));
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
    budgetUsd: data.metrics?.apiUsage?.budgetUsd || 0,
    estimatedMonthlyUsd: data.metrics?.modelOps?.estimatedMonthlyUsd || 0,
    revenueTargetUsd: data.metrics?.revenue?.targetMonthlyUsd || 0
  };
}

async function withBoard(mutator) {
  const data = await loadData();
  const result = await mutator(data);
  return result;
}

app.get('/login', (req, res) => {
  if (!AUTH_ENABLED) return res.redirect('/');
  const cookies = parseCookies(req);
  const session = verifySession(cookies.dashboard_session);
  if (session) return res.redirect('/');
  res.sendFile(path.join(FRONTEND_PATH, 'login.html'));
});

app.post('/auth/login', async (req, res) => {
  if (!AUTH_ENABLED) return res.json({ success: true, disabled: true });
  const { password, remember } = req.body || {};
  if (password !== DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const maxAgeMs = remember ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 12;
  const token = signSession({ sub: 'eddie', exp: Date.now() + maxAgeMs });
  res.setHeader('Set-Cookie', cookie.serialize('dashboard_session', token, sessionCookieOptions(maxAgeMs)));
  res.json({ success: true });
});

app.post('/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', cookie.serialize('dashboard_session', '', { httpOnly: true, secure: isVercel, sameSite: 'lax', path: '/', maxAge: 0 }));
  res.json({ success: true });
});

app.get('/api/session', (req, res) => {
  res.json({ authenticated: !!req.session, authEnabled: AUTH_ENABLED });
});

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
  try {
    const github = await refreshGitHubData(data, req.query.refresh === '1');
    await saveData(data);
    res.json(github || {});
  } catch (error) {
    res.status(500).json({ error: error.message, github: data.github || {} });
  }
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
    hostedProjects: { ...(data.metrics?.hostedProjects || {}), ...(req.body.hostedProjects || {}) },
    modelOps: { ...(data.metrics?.modelOps || {}), ...(req.body.modelOps || {}) },
    revenue: { ...(data.metrics?.revenue || {}), ...(req.body.revenue || {}) }
  };
  pushActivity(data, 'Metrics updated.', 'metric');
  await saveData(data);
  res.json({ success: true, metrics: data.metrics });
});

app.get('/api/activity', async (req, res) => {
  const data = await loadData();
  res.json(data.activity || []);
});

app.post('/api/tasks/:id/notes', async (req, res) => {
  const data = await loadData();
  const { id } = req.params;
  const task = data.tasks[id];
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Note text is required' });
  if (/api[_ -]?key|token|secret|password/i.test(text)) {
    return res.status(400).json({ error: 'Do not store secrets or tokens in dashboard notes' });
  }

  const note = {
    id: `note-${Date.now()}`,
    text,
    author: req.body.author || 'Unknown',
    createdAt: nowIso()
  };

  task.notes = [note, ...(task.notes || [])].slice(0, 20);
  task.updatedAt = nowIso();
  task.history = [createHistoryEvent('note', `Note added by ${note.author}`, { noteId: note.id }), ...(task.history || [])].slice(0, 30);
  pushActivity(data, `Note added to task: ${task.title}`, 'note', { taskId: id, author: note.author });
  await saveData(data);
  await notifySlack(`📝 Dashboard note on "${task.title}" from ${note.author}`);

  res.json({ success: true, task, note });
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
