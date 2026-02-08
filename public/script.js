// API Configuration
const API_URL = window.location.origin;

// State
let boardData = null;
let editingTaskId = null;
let sortByPriority = false;

// Priority order for sorting
const priorityOrder = { high: 0, medium: 1, low: 2 };

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadBoard();
    setupEventListeners();
});

// Setup Event Listeners
function setupEventListeners() {
    document.getElementById('add-task-btn').addEventListener('click', () => openTaskModal());
    document.getElementById('close-modal').addEventListener('click', closeTaskModal);
    document.getElementById('cancel-btn').addEventListener('click', closeTaskModal);
    document.getElementById('task-form').addEventListener('submit', handleTaskSubmit);
    document.getElementById('cancel-delete').addEventListener('click', closeDeleteModal);
    document.getElementById('confirm-delete').addEventListener('click', handleDeleteConfirm);
    document.getElementById('sort-priority').addEventListener('change', (e) => {
        sortByPriority = e.target.checked;
        renderBoard();
    });
    
    // Close modals on backdrop click
    document.getElementById('task-modal').addEventListener('click', (e) => {
        if (e.target.id === 'task-modal') closeTaskModal();
    });
    document.getElementById('delete-modal').addEventListener('click', (e) => {
        if (e.target.id === 'delete-modal') closeDeleteModal();
    });
}

// Load Board Data
async function loadBoard() {
    try {
        const response = await fetch(`${API_URL}/api/board`);
        if (!response.ok) throw new Error('Failed to load board');
        boardData = await response.json();
        renderBoard();
    } catch (error) {
        console.error('Error loading board:', error);
        alert('Failed to load board data');
    }
}

// Render Board
function renderBoard() {
    if (!boardData) return;
    
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';
    
    boardData.columns.forEach(column => {
        const columnEl = createColumnElement(column);
        boardEl.appendChild(columnEl);
    });
}

// Create Column Element
function createColumnElement(column) {
    const columnEl = document.createElement('div');
    columnEl.className = 'column';
    columnEl.dataset.columnId = column.id;
    
    // Get tasks for this column
    let tasks = column.taskIds.map(id => boardData.tasks[id]).filter(task => task);
    
    // Sort by priority if enabled
    if (sortByPriority) {
        tasks.sort((a, b) => {
            const priorityA = priorityOrder[a.priority || 'medium'];
            const priorityB = priorityOrder[b.priority || 'medium'];
            return priorityA - priorityB;
        });
    }
    
    columnEl.innerHTML = `
        <div class="column-header">
            <h2 class="column-title">${column.title}</h2>
            <span class="task-count">${tasks.length}</span>
        </div>
        <div class="tasks-container" data-column-id="${column.id}">
            ${tasks.length > 0 
                ? tasks.map(task => createTaskCard(task)).join('') 
                : '<div class="empty-state">No tasks</div>'}
        </div>
    `;
    
    // Setup drag and drop
    const tasksContainer = columnEl.querySelector('.tasks-container');
    setupDragAndDrop(tasksContainer);
    
    return columnEl;
}

// Create Task Card HTML
function createTaskCard(task) {
    const priorityEmoji = {
        high: '🔴',
        medium: '🟡',
        low: '🟢'
    }[task.priority || 'medium'];
    
    const statusEmoji = {
        pending: '⏳',
        'in-progress': '🔄',
        completed: '✅',
        blocked: '🚫'
    };
    
    // Calculate ETA display
    let etaDisplay = '';
    if (task.eta && task.requestStatus === 'in-progress') {
        const minutesLeft = task.eta;
        etaDisplay = `<div class="eta">⏱️ ETA: ~${minutesLeft} min</div>`;
    }
    
    // Sub-agent progress section
    let subagentSection = '';
    if (task.subagentId || task.requestStatus) {
        const statusIcon = statusEmoji[task.requestStatus] || '○';
        const statusText = task.requestStatus ? task.requestStatus.replace('-', ' ') : 'Not started';
        
        let progressBar = '';
        if (task.requestStatus === 'in-progress') {
            // Indeterminate progress bar
            progressBar = `
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 60%"></div>
                </div>
            `;
        } else if (task.requestStatus === 'completed') {
            progressBar = `
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 100%; background: #10b981;"></div>
                </div>
            `;
        }
        
        subagentSection = `
            <div class="subagent-progress">
                <div class="status-row">
                    <span class="status-icon">${statusIcon}</span>
                    <strong>${statusText.toUpperCase()}</strong>
                </div>
                ${task.subagentId ? `<div style="font-size: 0.75rem; color: #666;">🤖 ${task.subagentId.substring(0, 8)}...</div>` : ''}
                ${etaDisplay}
                ${progressBar}
            </div>
        `;
    }
    
    return `
        <div class="task-card" draggable="true" data-task-id="${task.id}">
            <div class="task-header">
                <div class="task-title">${escapeHtml(task.title)}</div>
                <div class="priority-badge">${priorityEmoji}</div>
            </div>
            
            ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}
            
            <div class="task-meta">
                ${task.assignee ? `<span class="meta-tag">👤 ${escapeHtml(task.assignee)}</span>` : ''}
                ${task.modelUsed ? `<span class="meta-tag">🤖 ${escapeHtml(task.modelUsed)}</span>` : ''}
                ${task.agentType ? `<span class="meta-tag">⚙️ ${escapeHtml(task.agentType)}</span>` : ''}
            </div>
            
            ${subagentSection}
            
            <div class="task-controls">
                <select class="status-select" data-task-id="${task.id}">
                    <option value="" disabled selected>Move to...</option>
                    <option value="todo" ${task.columnId === 'todo' ? 'disabled' : ''}>📋 To Do</option>
                    <option value="in-progress" ${task.columnId === 'in-progress' ? 'disabled' : ''}>🔄 In Progress</option>
                    <option value="done" ${task.columnId === 'done' ? 'disabled' : ''}>✅ Done</option>
                </select>
                <button class="task-btn edit-btn" data-task-id="${task.id}" title="Edit">✏️</button>
                <button class="task-btn delete-btn" data-task-id="${task.id}" title="Delete">🗑️</button>
            </div>
        </div>
    `;
}

// Setup Drag and Drop
function setupDragAndDrop(container) {
    const taskCards = container.querySelectorAll('.task-card');
    
    taskCards.forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
        card.addEventListener('dragover', handleDragOver);
        card.addEventListener('drop', handleDrop);
    });
    
    container.addEventListener('dragover', handleContainerDragOver);
    container.addEventListener('drop', handleContainerDrop);
    container.addEventListener('dragleave', handleDragLeave);
    
    // Setup status change select
    const statusSelects = container.querySelectorAll('.status-select');
    statusSelects.forEach(select => {
        select.addEventListener('change', handleStatusChange);
    });
    
    // Setup edit/delete buttons
    const editBtns = container.querySelectorAll('.edit-btn');
    const deleteBtns = container.querySelectorAll('.delete-btn');
    
    editBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const taskId = btn.dataset.taskId;
            openTaskModal(taskId);
        });
    });
    
    deleteBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const taskId = btn.dataset.taskId;
            openDeleteModal(taskId);
        });
    });
}

let draggedElement = null;
let draggedTaskId = null;

function handleDragStart(e) {
    draggedElement = e.target;
    draggedTaskId = e.target.dataset.taskId;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.innerHTML);
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const afterElement = getDragAfterElement(e.currentTarget.closest('.tasks-container'), e.clientY);
    if (afterElement == null) {
        e.currentTarget.closest('.tasks-container').classList.add('drag-over');
    } else {
        afterElement.classList.add('drag-over');
    }
    
    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    return false;
}

function handleContainerDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
    return false;
}

function handleContainerDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    e.preventDefault();
    
    const targetContainer = e.currentTarget;
    const targetColumnId = targetContainer.dataset.columnId;
    const fromColumn = draggedElement.closest('.tasks-container').dataset.columnId;
    
    targetContainer.classList.remove('drag-over');
    
    if (draggedTaskId && targetColumnId) {
        moveTask(draggedTaskId, fromColumn, targetColumnId);
    }
    
    return false;
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.task-card:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Handle Status Change via Select
async function handleStatusChange(e) {
    const taskId = e.target.dataset.taskId;
    const newColumnId = e.target.value;
    const currentColumn = e.target.closest('.tasks-container').dataset.columnId;
    
    e.target.value = ''; // Reset select
    
    if (newColumnId && taskId) {
        await moveTask(taskId, currentColumn, newColumnId);
    }
}

// Move Task Between Columns
async function moveTask(taskId, fromColumn, toColumn) {
    try {
        const response = await fetch(`${API_URL}/api/tasks/${taskId}/move`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fromColumn, toColumn })
        });
        
        if (!response.ok) throw new Error('Failed to move task');
        
        const result = await response.json();
        
        // Update local state
        boardData.tasks[taskId] = result.task;
        
        // Update column task IDs
        boardData.columns.forEach(col => {
            col.taskIds = col.taskIds.filter(id => id !== taskId);
            if (col.id === toColumn) {
                col.taskIds.push(taskId);
            }
        });
        
        renderBoard();
    } catch (error) {
        console.error('Error moving task:', error);
        alert('Failed to move task');
        loadBoard(); // Reload to sync state
    }
}

// Modal Management
function openTaskModal(taskId = null) {
    const modal = document.getElementById('task-modal');
    const modalTitle = document.getElementById('modal-title');
    const form = document.getElementById('task-form');
    
    form.reset();
    editingTaskId = taskId;
    
    if (taskId) {
        modalTitle.textContent = 'Edit Task';
        const task = boardData.tasks[taskId];
        
        document.getElementById('task-id').value = task.id;
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-description').value = task.description || '';
        document.getElementById('task-priority').value = task.priority || 'medium';
        document.getElementById('task-assignee').value = task.assignee || '';
        document.getElementById('task-model').value = task.modelUsed || '';
        document.getElementById('task-agent-type').value = task.agentType || '';
        document.getElementById('task-subagent-id').value = task.subagentId || '';
        document.getElementById('task-request-status').value = task.requestStatus || '';
        document.getElementById('task-eta').value = task.eta || '';
    } else {
        modalTitle.textContent = 'Add New Task';
        editingTaskId = null;
    }
    
    modal.classList.add('active');
}

function closeTaskModal() {
    document.getElementById('task-modal').classList.remove('active');
    editingTaskId = null;
}

function openDeleteModal(taskId) {
    const task = boardData.tasks[taskId];
    document.getElementById('delete-task-name').textContent = `"${task.title}"`;
    document.getElementById('delete-modal').classList.add('active');
    document.getElementById('delete-modal').dataset.taskId = taskId;
}

function closeDeleteModal() {
    document.getElementById('delete-modal').classList.remove('active');
}

// Handle Task Form Submit
async function handleTaskSubmit(e) {
    e.preventDefault();
    
    const taskData = {
        title: document.getElementById('task-title').value,
        description: document.getElementById('task-description').value,
        priority: document.getElementById('task-priority').value,
        assignee: document.getElementById('task-assignee').value,
        modelUsed: document.getElementById('task-model').value,
        agentType: document.getElementById('task-agent-type').value,
        subagentId: document.getElementById('task-subagent-id').value,
        requestStatus: document.getElementById('task-request-status').value,
        eta: parseInt(document.getElementById('task-eta').value) || null
    };
    
    try {
        let response;
        if (editingTaskId) {
            // Update existing task
            response = await fetch(`${API_URL}/api/tasks/${editingTaskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData)
            });
        } else {
            // Create new task
            response = await fetch(`${API_URL}/api/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData)
            });
        }
        
        if (!response.ok) throw new Error('Failed to save task');
        
        closeTaskModal();
        loadBoard();
    } catch (error) {
        console.error('Error saving task:', error);
        alert('Failed to save task');
    }
}

// Handle Delete Confirmation
async function handleDeleteConfirm() {
    const taskId = document.getElementById('delete-modal').dataset.taskId;
    
    try {
        const response = await fetch(`${API_URL}/api/tasks/${taskId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Failed to delete task');
        
        closeDeleteModal();
        loadBoard();
    } catch (error) {
        console.error('Error deleting task:', error);
        alert('Failed to delete task');
    }
}

// Utility Functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Auto-refresh every 30 seconds to catch updates from other clients
setInterval(() => {
    if (!document.getElementById('task-modal').classList.contains('active')) {
        loadBoard();
    }
}, 30000);
