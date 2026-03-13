const API_URL = window.location.origin;

let boardData = null;
let editingTaskId = null;
let sortByPriority = false;

const priorityOrder = { high: 0, medium: 1, low: 2 };

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
  } catch (error) {
    console.error(error);
    alert('Failed to load dashboard');
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
}

function renderSummary() {
  const tasks = Object.values(boardData.tasks || {});
  const cards = [
    { label: 'Active work', value: tasks.filter(task => task.columnId === 'in-progress').length, tone: 'blue' },
    { label: 'Waiting on Eddie', value: tasks.filter(task => task.nextActionBy === 'Eddie' || task.columnId === 'waiting-on-eddie').length, tone: 'amber' },
    { label: 'Blocked', value: tasks.filter(task => task.status === 'blocked' || task.columnId === 'blocked').length, tone: 'red' },
    { label: 'Live projects', value: (boardData.projects || []).filter(project => project.status === 'live').length, tone: 'green' },
    { label: 'API spend', value: `$${Number(boardData.metrics?.apiUsage?.spendUsd || 0).toFixed(2)}`, tone: 'purple' },
    { label: 'Budget', value: `$${Number(boardData.metrics?.apiUsage?.budgetUsd || 0).toFixed(2)}`, tone: 'slate' }
  ];

  document.getElementById('summary-grid').innerHTML = cards.map(card => `
    <article class="summary-card ${card.tone}">
      <div class="summary-label">${card.label}</div>
      <div class="summary-value">${card.value}</div>
    </article>
  `).join('');
}

function renderAttentionPanel() {
  const attentionTasks = Object.values(boardData.tasks || {})
    .filter(task => task.nextActionBy === 'Eddie' || task.columnId === 'waiting-on-eddie' || task.priority === 'high')
    .sort((a, b) => priorityOrder[a.priority || 'medium'] - priorityOrder[b.priority || 'medium'])
    .slice(0, 4);

  document.getElementById('attention-panel').innerHTML = `
    <div class="section-header compact">
      <div>
        <p class="section-kicker">Needs attention</p>
        <h2>Things Eddie should see first</h2>
      </div>
    </div>
    <div class="attention-list">
      ${attentionTasks.length ? attentionTasks.map(task => `
        <div class="attention-item">
          <div>
            <strong>${escapeHtml(task.title)}</strong>
            <p>${escapeHtml(task.waitingReason || task.blockedReason || task.description || 'No note yet')}</p>
          </div>
          <div class="attention-meta">
            <span class="pill ${task.nextActionBy === 'Eddie' ? 'warn' : 'neutral'}">${escapeHtml(task.nextActionBy || 'Arlo')}</span>
            <span class="pill">${escapeHtml(task.dueText || 'No date')}</span>
          </div>
        </div>
      `).join('') : '<p class="empty-state">Nothing urgent right now.</p>'}
    </div>
  `;
}

function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = boardData.columns.map(column => createColumn(column)).join('');

  document.querySelectorAll('.status-select').forEach(select => {
    select.addEventListener('change', handleStatusChange);
  });
  document.querySelectorAll('.edit-btn').forEach(button => {
    button.addEventListener('click', () => openTaskModal(button.dataset.taskId));
  });
  document.querySelectorAll('.delete-btn').forEach(button => {
    button.addEventListener('click', () => openDeleteModal(button.dataset.taskId));
  });
}

function createColumn(column) {
  let tasks = (column.taskIds || []).map(id => boardData.tasks[id]).filter(Boolean);
  if (sortByPriority) {
    tasks = tasks.sort((a, b) => priorityOrder[a.priority || 'medium'] - priorityOrder[b.priority || 'medium']);
  }

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
    <article class="task-card ${task.columnId === 'waiting-on-eddie' ? 'waiting' : ''} ${task.status === 'blocked' ? 'blocked' : ''}">
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

      ${historyItems ? `<ul class="history-snippet">${historyItems}</ul>` : ''}

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

function renderProjects() {
  const projects = boardData.projects || [];
  document.getElementById('projects-panel').innerHTML = `
    <div class="section-header compact">
      <div>
        <p class="section-kicker">Hosted projects</p>
        <h2>What is live or in motion</h2>
      </div>
    </div>
    <div class="stack-list">
      ${projects.map(project => `
        <article class="list-card">
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
            ${project.url ? `<a href="${escapeAttribute(project.url)}" target="_blank" rel="noreferrer">Open app</a>` : ''}
            ${project.repoUrl ? `<a href="${escapeAttribute(project.repoUrl)}" target="_blank" rel="noreferrer">Repo</a>` : ''}
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function renderGithub() {
  const github = boardData.github || { repos: [], recentActivity: [] };
  document.getElementById('github-panel').innerHTML = `
    <div class="section-header compact">
      <div>
        <p class="section-kicker">GitHub</p>
        <h2>Repos + recent activity</h2>
      </div>
    </div>
    <div class="stack-list compact-list">
      ${github.repos.map(repo => `
        <article class="list-card">
          <div class="list-card-header">
            <strong>${escapeHtml(repo.owner)}/${escapeHtml(repo.name)}</strong>
            <span class="pill">${escapeHtml(repo.branch || 'main')}</span>
          </div>
          <p>${escapeHtml(repo.notes || '')}</p>
          <div class="link-list">
            ${repo.repoUrl ? `<a href="${escapeAttribute(repo.repoUrl)}" target="_blank" rel="noreferrer">Repo</a>` : ''}
            ${repo.deployUrl ? `<a href="${escapeAttribute(repo.deployUrl)}" target="_blank" rel="noreferrer">Deploy</a>` : ''}
          </div>
        </article>
      `).join('')}
    </div>
    <div class="subsection">
      <h3>Recent history</h3>
      <ul class="activity-list">
        ${github.recentActivity.map(item => `
          <li>
            <span class="activity-title">${escapeHtml(item.title)}</span>
            <a href="${escapeAttribute(item.url || '#')}" target="_blank" rel="noreferrer">${escapeHtml(item.repo || 'link')}</a>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

function renderMetrics() {
  const apiUsage = boardData.metrics?.apiUsage || {};
  const hosted = boardData.metrics?.hostedProjects || {};
  document.getElementById('metrics-panel').innerHTML = `
    <div class="section-header compact">
      <div>
        <p class="section-kicker">Ops metrics</p>
        <h2>Usage + infrastructure snapshot</h2>
      </div>
    </div>
    <div class="metrics-grid">
      <div class="metric-box">
        <span>Period</span>
        <strong>${escapeHtml(apiUsage.periodLabel || 'Today')}</strong>
      </div>
      <div class="metric-box">
        <span>Spend</span>
        <strong>$${Number(apiUsage.spendUsd || 0).toFixed(2)}</strong>
      </div>
      <div class="metric-box">
        <span>Budget</span>
        <strong>$${Number(apiUsage.budgetUsd || 0).toFixed(2)}</strong>
      </div>
      <div class="metric-box">
        <span>Live apps</span>
        <strong>${Number(hosted.live || 0)}</strong>
      </div>
      <div class="metric-box">
        <span>Building</span>
        <strong>${Number(hosted.building || 0)}</strong>
      </div>
      <div class="metric-box">
        <span>Issues</span>
        <strong>${Number(hosted.issues || 0)}</strong>
      </div>
    </div>
    <p class="panel-note">${escapeHtml(apiUsage.note || '')}</p>
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

async function handleStatusChange(event) {
  const taskId = event.target.dataset.taskId;
  const toColumn = event.target.value;
  event.target.value = '';
  if (!taskId || !toColumn) return;

  try {
    const response = await fetch(`${API_URL}/api/tasks/${taskId}/move`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toColumn })
    });
    if (!response.ok) throw new Error('Failed to move task');
    await loadBoard();
  } catch (error) {
    console.error(error);
    alert('Failed to move task');
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

function closeTaskModal() {
  document.getElementById('task-modal').classList.remove('active');
  editingTaskId = null;
}

function openDeleteModal(taskId) {
  const task = boardData.tasks[taskId];
  document.getElementById('delete-task-name').textContent = task ? task.title : '';
  document.getElementById('delete-modal').dataset.taskId = taskId;
  document.getElementById('delete-modal').classList.add('active');
}

function closeDeleteModal() {
  document.getElementById('delete-modal').classList.remove('active');
}

async function handleTaskSubmit(event) {
  event.preventDefault();

  const columnId = document.getElementById('task-column').value;
  const statusMap = {
    todo: 'pending',
    'waiting-on-eddie': 'waiting',
    'in-progress': 'active',
    blocked: 'blocked',
    done: 'completed'
  };

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
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData)
    });

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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function escapeAttribute(text) {
  return String(text ?? '').replace(/"/g, '&quot;');
}

setInterval(() => {
  if (!document.getElementById('task-modal').classList.contains('active')) {
    loadBoard();
  }
}, 30000);
