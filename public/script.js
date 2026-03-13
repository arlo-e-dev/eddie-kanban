const API_URL = window.location.origin;

let boardData = null;
let editingTaskId = null;
let sortByPriority = false;

const priorityOrder = { high: 0, medium: 1, low: 2 };
const liveDeployUrl = 'https://workspace-nyu2zhabv-eddiejordens-projects.vercel.app';

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadBoard();
});

function setupEventListeners() {
  document.getElementById('add-task-btn').addEventListener('click', () => openTaskModal());
  document.getElementById('refresh-btn').addEventListener('click', loadBoard);
  document.getElementById('close-modal').addEventListener('click', closeTaskModal);
  document.getElementById('cancel-btn').addEventListener('click', closeTaskModal);
  document.getElementById('task-form').addEventListener('submit', handleTaskSubmit);
  document.getElementById('cancel-delete').addEventListener('click', closeDeleteModal);
  document.getElementById('confirm-delete').addEventListener('click', handleDeleteConfirm);
  document.getElementById('sort-priority').addEventListener('change', event => {
    sortByPriority = event.target.checked;
    renderDashboard();
  });
  document.getElementById('task-modal').addEventListener('click', event => {
    if (event.target.id === 'task-modal') closeTaskModal();
  });
  document.getElementById('delete-modal').addEventListener('click', event => {
    if (event.target.id === 'delete-modal') closeDeleteModal();
  });
}

async function loadBoard() {
  try {
    const response = await fetch(`${API_URL}/api/board`);
    if (!response.ok) throw new Error('Failed to load dashboard');
    boardData = await response.json();
    renderDashboard();
    loadGithubData();
  } catch (error) {
    console.error(error);
    alert('Failed to load dashboard');
  }
}

async function loadGithubData(force = false) {
  try {
    const response = await fetch(`${API_URL}/api/github${force ? '?refresh=1' : ''}`);
    if (!response.ok) throw new Error('Failed to load GitHub data');
    const github = await response.json();
    boardData.github = github;
    renderGithub();
    bindDynamicEvents();
  } catch (error) {
    console.error(error);
  }
}

function renderDashboard() {
  if (!boardData) return;
  renderSummary();
  renderAttentionPanel();
  renderBoard();
  renderProjects();
  renderGithub();
  renderMetrics();
  renderActivity();
  bindDynamicEvents();
}

function bindDynamicEvents() {
  document.querySelectorAll('.status-select').forEach(select => select.addEventListener('change', handleStatusChange));
  document.querySelectorAll('.edit-btn').forEach(button => button.addEventListener('click', () => openTaskModal(button.dataset.taskId)));
  document.querySelectorAll('.delete-btn').forEach(button => button.addEventListener('click', () => openDeleteModal(button.dataset.taskId)));
  document.querySelectorAll('[data-action="mark-done"]').forEach(button => button.addEventListener('click', () => quickMoveTask(button.dataset.taskId, 'done')));
  document.querySelectorAll('[data-action="mark-waiting-eddie"]').forEach(button => button.addEventListener('click', () => quickMoveTask(button.dataset.taskId, 'waiting-on-eddie')));
  document.querySelectorAll('[data-action="mark-in-progress"]').forEach(button => button.addEventListener('click', () => quickMoveTask(button.dataset.taskId, 'in-progress')));
  document.querySelectorAll('[data-action="save-note"]').forEach(button => button.addEventListener('click', () => saveTaskNote(button.dataset.taskId)));
  document.querySelectorAll('.note-input').forEach(input => {
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        saveTaskNote(event.target.dataset.taskId);
      }
    });
  });
  const refreshGithubBtn = document.getElementById('refresh-github-btn');
  if (refreshGithubBtn) refreshGithubBtn.onclick = () => loadGithubData(true);
}

function renderSummary() {
  const tasks = Object.values(boardData.tasks || {});
  const metrics = boardData.metrics || {};
  const cards = [
    { label: 'Waiting on Eddie', value: tasks.filter(task => task.nextActionBy === 'Eddie' || task.columnId === 'waiting-on-eddie').length, tone: 'amber', big: true, spark: [90, 70, 80, 60, 75, 55] },
    { label: 'Active work', value: tasks.filter(task => task.columnId === 'in-progress').length, tone: 'blue', spark: [40, 55, 60, 70, 75, 65] },
    { label: 'Blocked', value: tasks.filter(task => task.status === 'blocked' || task.columnId === 'blocked').length, tone: 'red', spark: [25, 45, 40, 35, 50, 30] },
    { label: 'Live projects', value: (boardData.projects || []).filter(project => project.status === 'live').length, tone: 'green', spark: [20, 30, 45, 50, 60, 70] },
    { label: 'Monthly AI burn', value: `$${Number(metrics.modelOps?.estimatedMonthlyUsd || 0).toFixed(0)}`, tone: 'purple', big: true, spark: [55, 58, 62, 70, 68, 73] },
    { label: 'Revenue target', value: `$${Number(metrics.revenue?.targetMonthlyUsd || 0).toFixed(0)}`, tone: 'slate', spark: [15, 18, 22, 30, 40, 50] }
  ];

  document.getElementById('summary-grid').innerHTML = cards.map(card => `
    <article class="summary-card ${card.tone} ${card.big ? 'big' : ''}">
      <div class="summary-label">${card.label}</div>
      <div class="summary-value">${card.value}</div>
      <div class="summary-spark">${card.spark.map(v => `<span style="height:${v}% ; background:${sparkColor(card.tone)}"></span>`).join('')}</div>
    </article>
  `).join('');
}

function renderAttentionPanel() {
  const attentionTasks = Object.values(boardData.tasks || {})
    .filter(task => task.nextActionBy === 'Eddie' || task.columnId === 'waiting-on-eddie' || task.priority === 'high' || task.status === 'blocked')
    .sort((a, b) => priorityOrder[a.priority || 'medium'] - priorityOrder[b.priority || 'medium'])
    .slice(0, 6);

  document.getElementById('attention-panel').innerHTML = `
    <div class="section-header compact">
      <div>
        <p class="section-kicker">Needs attention</p>
        <h2>Quick checkoffs + notes</h2>
      </div>
    </div>
    <div class="attention-list">
      ${attentionTasks.length ? attentionTasks.map(task => attentionCard(task)).join('') : '<p class="empty-state">Nothing urgent right now.</p>'}
    </div>
  `;
}

function attentionCard(task) {
  return `
    <div class="attention-item attention-card static-card">
      <div>
        <strong>${escapeHtml(task.title)}</strong>
        <p>${escapeHtml(task.waitingReason || task.blockedReason || task.description || 'No note yet')}</p>
      </div>
      <div class="attention-meta">
        <span class="pill ${task.nextActionBy === 'Eddie' ? 'warn' : 'neutral'}">next: ${escapeHtml(task.nextActionBy || 'Arlo')}</span>
        <span class="pill">${escapeHtml(task.dueText || 'No date')}</span>
      </div>
      ${(task.notes || []).length ? `<div class="notes-feed compact">${renderNotes(task.notes, 2)}</div>` : ''}
      <div class="quick-actions">
        <button class="mini-btn success" data-action="mark-done" data-task-id="${task.id}">✓ Done</button>
        <button class="mini-btn" data-action="mark-in-progress" data-task-id="${task.id}">↻ Arlo on it</button>
        <button class="mini-btn warn" data-action="mark-waiting-eddie" data-task-id="${task.id}">⏸ Waiting on Eddie</button>
      </div>
      <div class="note-composer">
        <textarea class="note-input" data-task-id="${task.id}" rows="2" placeholder="Leave a note for this item"></textarea>
        <button class="mini-btn primary" data-action="save-note" data-task-id="${task.id}">Add note</button>
      </div>
    </div>
  `;
}

function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = boardData.columns.map(column => createColumn(column)).join('');
}

function createColumn(column) {
  let tasks = (column.taskIds || []).map(id => boardData.tasks[id]).filter(Boolean);
  if (sortByPriority) tasks = tasks.sort((a, b) => priorityOrder[a.priority || 'medium'] - priorityOrder[b.priority || 'medium']);

  return `
    <section class="column" data-column-id="${column.id}">
      <div class="column-header">
        <h3>${column.title}</h3>
        <span class="task-count">${tasks.length}</span>
      </div>
      <div class="tasks-container">
        ${tasks.length ? tasks.map(createTaskCard).join('') : '<div class="empty-state">No tasks</div>'}
      </div>
    </section>
  `;
}

function createTaskCard(task) {
  const priorityEmoji = { high: '🔴', medium: '🟡', low: '🟢' }[task.priority || 'medium'];
  const historyItems = (task.history || []).slice(0, 2).map(item => `<li>${escapeHtml(item.message)}</li>`).join('');

  return `
    <article class="task-card static-card ${task.columnId === 'waiting-on-eddie' ? 'waiting' : ''} ${task.status === 'blocked' ? 'blocked' : ''}">
      <div class="task-header">
        <div>
          <h4>${escapeHtml(task.title)}</h4>
          <div class="task-subline">${priorityEmoji} ${escapeHtml(task.priority || 'medium')} · next: ${escapeHtml(task.nextActionBy || 'Arlo')}</div>
        </div>
        <span class="pill ${task.nextActionBy === 'Eddie' ? 'warn' : 'neutral'}">${escapeHtml(task.assignee || 'Unassigned')}</span>
      </div>
      ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ''}
      ${task.waitingReason ? `<div class="info-strip amber">⏸ ${escapeHtml(task.waitingReason)}</div>` : ''}
      ${task.blockedReason ? `<div class="info-strip red">🚫 ${escapeHtml(task.blockedReason)}</div>` : ''}
      <div class="task-meta">
        ${task.dueText ? `<span class="meta-tag">🗓 ${escapeHtml(task.dueText)}</span>` : ''}
        ${task.tags?.map(tag => `<span class="meta-tag">#${escapeHtml(tag)}</span>`).join('') || ''}
      </div>
      ${task.links?.length ? `<div class="link-list">${task.links.map(link => `<a href="${escapeAttribute(link)}" target="_blank" rel="noreferrer">${escapeHtml(link)}</a>`).join('')}</div>` : ''}
      ${(task.notes || []).length ? `<div class="notes-feed">${renderNotes(task.notes, 2)}</div>` : ''}
      ${historyItems ? `<ul class="history-snippet">${historyItems}</ul>` : ''}
      <div class="note-composer compact">
        <textarea class="note-input" data-task-id="${task.id}" rows="2" placeholder="Add note"></textarea>
        <button class="mini-btn primary" data-action="save-note" data-task-id="${task.id}">Add note</button>
      </div>
      <div class="task-controls">
        <select class="status-select" data-task-id="${task.id}">
          <option value="">Move to...</option>
          ${boardData.columns.map(column => `<option value="${column.id}" ${column.id === task.columnId ? 'disabled' : ''}>${column.title}</option>`).join('')}
        </select>
        <button class="task-btn edit-btn" data-task-id="${task.id}" title="Edit">✏️</button>
        <button class="task-btn delete-btn" data-task-id="${task.id}" title="Delete">🗑️</button>
      </div>
    </article>
  `;
}

function renderNotes(notes, limit = 3) {
  return notes.slice(0, limit).map(note => `
    <div class="note-item">
      <div class="note-meta">${escapeHtml(note.author || 'Unknown')} · ${formatDate(note.createdAt)}</div>
      <div class="note-body">${escapeHtml(note.text || '')}</div>
    </div>
  `).join('');
}

function renderProjects() {
  const projects = (boardData.projects || []).map(project => project.id === 'kanban-server' || project.name === 'Eddie Dashboard'
    ? { ...project, status: 'live', url: liveDeployUrl, notes: 'Primary live dashboard. Dark-mode Vercel deployment only.' }
    : project);

  const liveCount = projects.filter(p => p.status === 'live').length;
  const buildingCount = projects.filter(p => p.status === 'building').length;
  const projectRows = projects.map(project => {
    const tone = project.status === 'live' ? 'green' : project.status === 'building' ? 'blue' : 'amber';
    return `
      <a class="list-card clickable-card" href="${escapeAttribute(project.url || project.repoUrl || '#')}" target="_blank" rel="noreferrer">
        <div class="list-card-header">
          <strong>${escapeHtml(project.name)}</strong>
          <span class="pill ${project.status === 'live' ? 'success' : project.status === 'building' ? 'info' : 'neutral'}">${escapeHtml(project.status)}</span>
        </div>
        <p>${escapeHtml(project.notes || '')}</p>
        <div class="mini-meta">
          <span>${escapeHtml(project.environment || '')}</span>
          <span>${escapeHtml(project.owner || '')}</span>
        </div>
        <div class="link-list">
          ${project.url ? `<span class="project-card-link">Open app</span>` : ''}
          ${project.repoUrl ? `<span class="project-card-link">Repo</span>` : ''}
        </div>
      </a>
    `;
  }).join('');

  document.getElementById('projects-panel').innerHTML = `
    <div class="section-header compact">
      <div>
        <p class="section-kicker">Hosted projects</p>
        <h2>What is live or in motion</h2>
      </div>
    </div>
    <div class="section-visual">
      <div class="graph-card">
        <div class="graph-caption">Project status split</div>
        <div class="bar-graph">
          ${barRow('Live', liveCount, projects.length || 1, 'green')}
          ${barRow('Building', buildingCount, projects.length || 1, 'blue')}
          ${barRow('Tracked', projects.length, projects.length || 1, 'amber')}
        </div>
      </div>
    </div>
    <div class="stack-list">${projectRows}</div>
  `;
}

function renderGithub() {
  const github = boardData.github || { repos: [], recentActivity: [] };
  const repoRows = (github.repos || []).map(repo => {
    const deployUrl = repo.name === 'eddie-kanban' ? liveDeployUrl : repo.deployUrl;
    return `
      <article class="list-card static-card">
        <div class="list-card-header">
          <strong>${escapeHtml(repo.owner)}/${escapeHtml(repo.name)}</strong>
          <span class="pill">${escapeHtml(repo.branch || 'main')}</span>
        </div>
        <p>${escapeHtml(repo.notes || '')}</p>
        <div class="mini-meta">
          <span>updated ${escapeHtml(formatDate(repo.pushedAt))}</span>
          <span>${Number(repo.openIssues || 0)} open issues</span>
          <span>${Number(repo.stars || 0)} ★</span>
        </div>
        ${repo.fetchError ? `<div class="info-strip red">GitHub fetch error: ${escapeHtml(repo.fetchError)}</div>` : ''}
        <div class="link-list">
          ${repo.repoUrl ? `<a href="${escapeAttribute(repo.repoUrl)}" target="_blank" rel="noreferrer">Repo</a>` : ''}
          ${deployUrl ? `<a href="${escapeAttribute(deployUrl)}" target="_blank" rel="noreferrer">Deploy</a>` : ''}
        </div>
      </article>
    `;
  }).join('');

  document.getElementById('github-panel').innerHTML = `
    <div class="section-header compact">
      <div>
        <p class="section-kicker">GitHub</p>
        <h2>Repos + recent activity</h2>
      </div>
      <button class="mini-btn" id="refresh-github-btn">Refresh GitHub</button>
    </div>
    <div class="section-visual">
      <div class="graph-card">
        <div class="graph-caption">Recent GitHub activity</div>
        <div class="bar-graph">
          ${barRow('Repos', (github.repos || []).length, 6, 'blue')}
          ${barRow('Activity', (github.recentActivity || []).length, 12, 'purple')}
          ${barRow('PRs', (github.recentActivity || []).filter(x => x.type === 'pr').length, 8, 'green')}
          ${barRow('Commits', (github.recentActivity || []).filter(x => x.type === 'commit').length, 8, 'amber')}
        </div>
      </div>
    </div>
    <div class="stack-list compact-list">${repoRows}</div>
    <div class="subsection">
      <h3>Recent history</h3>
      <ul class="activity-list">
        ${(github.recentActivity || []).map(item => `
          <li>
            <span class="activity-title">${escapeHtml(item.title)}</span>
            <span class="activity-time">${escapeHtml(item.repo || '')} · ${escapeHtml(formatDate(item.updatedAt))}</span>
            <a href="${escapeAttribute(item.url || '#')}" target="_blank" rel="noreferrer">Open</a>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

function renderMetrics() {
  const metrics = boardData.metrics || {};
  const hosted = metrics.hostedProjects || {};
  const modelOps = metrics.modelOps || {};
  const revenue = metrics.revenue || {};
  const burn = Number(modelOps.estimatedMonthlyUsd || 0);
  const target = Number(revenue.targetMonthlyUsd || 0);

  document.getElementById('metrics-panel').innerHTML = `
    <div class="section-header compact">
      <div>
        <p class="section-kicker">Ops metrics</p>
        <h2>Costs + targets</h2>
      </div>
    </div>
    <div class="ring-grid">
      <div class="ring-stat"><div class="ring-value">$${Number(modelOps.chatgptSubscriptionUsd || 0).toFixed(0)}</div><div class="ring-label">ChatGPT</div></div>
      <div class="ring-stat"><div class="ring-value">$${Number(modelOps.anthropicApiEstimateUsd || 0).toFixed(0)}</div><div class="ring-label">Anthropic/API</div></div>
      <div class="ring-stat"><div class="ring-value">$${Number(modelOps.qwenEnergyEstimateUsd || 0).toFixed(0)}</div><div class="ring-label">Qwen energy</div></div>
    </div>
    <div class="section-visual">
      <div class="graph-card">
        <div class="graph-caption">Burn vs target</div>
        <div class="bar-graph">
          ${barRow('AI burn', burn, Math.max(target, burn, 1), 'purple')}
          ${barRow('Revenue goal', target, Math.max(target, burn, 1), 'green')}
          ${barRow('Live apps', Number(hosted.live || 0), Math.max(Number(hosted.total || 1), 1), 'blue')}
        </div>
      </div>
    </div>
    <div class="metrics-grid">
      <div class="metric-box"><span>Total monthly AI burn</span><strong>$${burn.toFixed(0)}</strong></div>
      <div class="metric-box"><span>Revenue target</span><strong>$${target.toFixed(0)}</strong></div>
      <div class="metric-box"><span>Live apps</span><strong>${Number(hosted.live || 0)}</strong></div>
      <div class="metric-box"><span>Tracked apps</span><strong>${Number(hosted.total || 0)}</strong></div>
    </div>
    <p class="panel-note">${escapeHtml(modelOps.note || '')}</p>
  `;
}

function renderActivity() {
  const activity = boardData.activity || [];
  document.getElementById('activity-panel').innerHTML = `
    <div class="section-header compact">
      <div>
        <p class="section-kicker">History</p>
        <h2>Recent activity feed</h2>
      </div>
    </div>
    <div class="section-visual">
      <div class="graph-card">
        <div class="graph-caption">Latest pulses</div>
        <div class="bar-graph">
          ${barRow('Tasks', activity.filter(x => x.type === 'task').length, 12, 'blue')}
          ${barRow('Notes', activity.filter(x => x.type === 'note').length, 12, 'amber')}
          ${barRow('GitHub', activity.filter(x => x.type === 'github').length, 12, 'purple')}
        </div>
      </div>
    </div>
    <ul class="activity-list">
      ${activity.slice(0, 8).map(item => `
        <li>
          <span class="activity-title">${escapeHtml(item.message)}</span>
          <span class="activity-time">${formatDate(item.createdAt)}</span>
        </li>
      `).join('')}
    </ul>
  `;
}

function barRow(label, value, max, tone) {
  const pct = Math.max(6, Math.min(100, Math.round((Number(value || 0) / Math.max(Number(max || 1), 1)) * 100)));
  return `<div class="bar-row"><span class="bar-label">${escapeHtml(String(label))}</span><div class="bar-track"><div class="bar-fill ${tone}" style="width:${pct}%"></div></div><span class="bar-value">${escapeHtml(String(value))}</span></div>`;
}

function sparkColor(tone) {
  return ({ blue: '#4f8cff', amber: '#f59e0b', red: '#ef4444', green: '#22c55e', purple: '#8b5cf6', slate: '#64748b' }[tone] || '#4f8cff');
}

async function handleStatusChange(event) {
  const taskId = event.target.dataset.taskId;
  const toColumn = event.target.value;
  event.target.value = '';
  if (!taskId || !toColumn) return;
  await quickMoveTask(taskId, toColumn);
}

async function quickMoveTask(taskId, toColumn) {
  try {
    const response = await fetch(`${API_URL}/api/tasks/${taskId}/move`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toColumn })
    });
    if (!response.ok) throw new Error('Failed to move task');
    await loadBoard();
  } catch (error) {
    console.error(error);
    alert('Failed to move task');
  }
}

async function saveTaskNote(taskId) {
  const input = document.querySelector(`.note-input[data-task-id="${taskId}"]`);
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  try {
    const response = await fetch(`${API_URL}/api/tasks/${taskId}/notes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, author: 'Eddie' })
    });
    if (!response.ok) throw new Error('Failed to save note');
    input.value = '';
    await loadBoard();
  } catch (error) {
    console.error(error);
    alert('Failed to save note');
  }
}

function openTaskModal(taskId = null) {
  const form = document.getElementById('task-form');
  form.reset();
  editingTaskId = taskId;
  document.getElementById('modal-title').textContent = taskId ? 'Edit Task' : 'Add Task';
  if (taskId) {
    const task = boardData.tasks[taskId];
    document.getElementById('task-title').value = task.title || '';
    document.getElementById('task-description').value = task.description || '';
    document.getElementById('task-column').value = task.columnId || 'todo';
    document.getElementById('task-priority').value = task.priority || 'medium';
    document.getElementById('task-assignee').value = task.assignee || '';
    document.getElementById('task-next-action').value = task.nextActionBy || 'Arlo';
    document.getElementById('task-due-text').value = task.dueText || '';
    document.getElementById('task-tags').value = (task.tags || []).join(', ');
    document.getElementById('task-links').value = (task.links || []).join(', ');
    document.getElementById('task-waiting-reason').value = task.waitingReason || '';
    document.getElementById('task-blocked-reason').value = task.blockedReason || '';
  }
  document.getElementById('task-modal').classList.add('active');
}

function closeTaskModal() { document.getElementById('task-modal').classList.remove('active'); editingTaskId = null; }
function openDeleteModal(taskId) {
  const task = boardData.tasks[taskId];
  document.getElementById('delete-task-name').textContent = task ? task.title : '';
  document.getElementById('delete-modal').dataset.taskId = taskId;
  document.getElementById('delete-modal').classList.add('active');
}
function closeDeleteModal() { document.getElementById('delete-modal').classList.remove('active'); }

async function handleTaskSubmit(event) {
  event.preventDefault();
  const columnId = document.getElementById('task-column').value;
  const statusMap = { todo: 'pending', 'waiting-on-eddie': 'waiting', 'in-progress': 'active', blocked: 'blocked', done: 'completed' };
  const taskData = {
    title: document.getElementById('task-title').value.trim(),
    description: document.getElementById('task-description').value.trim(),
    columnId,
    status: statusMap[columnId],
    priority: document.getElementById('task-priority').value,
    assignee: document.getElementById('task-assignee').value.trim(),
    nextActionBy: document.getElementById('task-next-action').value,
    dueText: document.getElementById('task-due-text').value.trim(),
    tags: document.getElementById('task-tags').value,
    links: document.getElementById('task-links').value,
    waitingReason: document.getElementById('task-waiting-reason').value.trim(),
    blockedReason: document.getElementById('task-blocked-reason').value.trim()
  };
  try {
    const url = editingTaskId ? `${API_URL}/api/tasks/${editingTaskId}` : `${API_URL}/api/tasks`;
    const method = editingTaskId ? 'PUT' : 'POST';
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(taskData) });
    if (!response.ok) throw new Error('Failed to save task');
    closeTaskModal();
    await loadBoard();
  } catch (error) {
    console.error(error);
    alert('Failed to save task');
  }
}

async function handleDeleteConfirm() {
  const taskId = document.getElementById('delete-modal').dataset.taskId;
  try {
    const response = await fetch(`${API_URL}/api/tasks/${taskId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete task');
    closeDeleteModal();
    await loadBoard();
  } catch (error) {
    console.error(error);
    alert('Failed to delete task');
  }
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text ?? ''; return div.innerHTML; }
function escapeAttribute(text) { return String(text ?? '').replace(/"/g, '&quot;'); }

setInterval(() => {
  if (!document.getElementById('task-modal').classList.contains('active')) loadBoard();
}, 30000);
