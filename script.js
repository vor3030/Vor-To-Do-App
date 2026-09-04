/* =====================================================================
   Vor-To-Do App — script.js
   Features: register/login (client-side, demo-grade), guest mode,
   per-user tasks, priorities, categories, search/filter/sort,
   inline editing, drag & drop, undo delete, dark mode, JSON export.
   NOTE: Passwords are hashed client-side and stored in localStorage.
   This is a demo app — never use this pattern in production.
   ===================================================================== */

'use strict';

// ---------------- Helpers ----------------
const $ = (id) => document.getElementById(id);

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const PRIORITY_LABEL = { high: 'High', medium: 'Med', low: 'Low' };
const CATEGORY_LABEL = {
    personal: '🏠 Personal',
    work: '💼 Work',
    shopping: '🛒 Shopping',
    health: '💪 Health',
    other: '📌 Other'
};

const QUOTES = [
    'Small steps every day. 💪',
    'Focus on being productive, not busy. 🎯',
    'One task at a time. ✅',
    'Done is better than perfect. 🚀',
    'Your future is created by what you do today. 🌱',
    'Progress, not perfection. 📈',
    'Start where you are. Use what you have. ⭐'
];

/** Hash a password. Prefers SHA-256 (secure contexts); falls back to FNV. */
async function hashPassword(password) {
    const salted = 'vtd::' + password;
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
        try {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salted));
            return 'sha256:' + Array.from(new Uint8Array(buf))
                .map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) { /* fall through to FNV */ }
    }
    return 'fnv:' + fnvHash(salted);
}

function fnvHash(str) {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < str.length; i++) {
        h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619) >>> 0;
        h2 = Math.imul(h2 ^ str.charCodeAt(i), 2654435761) >>> 0;
    }
    return (h1.toString(16) + h2.toString(16)).padStart(16, '0');
}

// ---------------- Storage keys ----------------
const USERS_KEY = 'vtdUsers';
const SESSION_KEY = 'vtdSession';        // "remember me" (localStorage)
const SESSION_TMP_KEY = 'vtdSessionTmp'; // this-tab-only session (sessionStorage)
const LEGACY_TASKS_KEY = 'rovDouphneTasks';

function getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; }
    catch { return {}; }
}

function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function setSession(username, remember) {
    const payload = JSON.stringify({ username });
    if (remember) {
        localStorage.setItem(SESSION_KEY, payload);
        sessionStorage.removeItem(SESSION_TMP_KEY);
    } else {
        sessionStorage.setItem(SESSION_TMP_KEY, payload);
        localStorage.removeItem(SESSION_KEY);
    }
}

function getSession() {
    try {
        const raw = sessionStorage.getItem(SESSION_TMP_KEY) || localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_TMP_KEY);
}

// ---------------- Auth UI ----------------
let currentUser = null;

function showAuthError(id, message) {
    const el = $(id);
    el.textContent = message;
    el.classList.remove('hidden');
}

function hideAuthErrors() {
    ['loginError', 'registerError'].forEach(id => $(id).classList.add('hidden'));
}

function switchAuthTab(tab) {
    hideAuthErrors();
    const isLogin = tab === 'login';
    $('tabLogin').classList.toggle('active', isLogin);
    $('tabRegister').classList.toggle('active', !isLogin);
    $('loginForm').classList.toggle('hidden', !isLogin);
    $('registerForm').classList.toggle('hidden', isLogin);
}

function togglePasswordVisibility(btn) {
    const input = $(btn.dataset.target);
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? '👁' : '🙈';
}

function passwordStrength(pw) {
    let score = 0;
    if (pw.length >= 6) score++;
    if (pw.length >= 10) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return Math.min(score, 4); // 0..4
}

function updateStrengthMeter() {
    const pw = $('regPassword').value;
    const score = passwordStrength(pw);
    const labels = ['Enter a password', 'Weak', 'Fair', 'Good', 'Strong'];
    const colors = ['', 'var(--red)', '#fb8c00', '#f9a825', 'var(--green)'];
    $('pwBarFill').style.width = pw ? (score / 4) * 100 + '%' : '0';
    $('pwBarFill').style.background = colors[score] || 'var(--red)';
    $('pwStrengthLabel').textContent = pw ? labels[score] : 'Enter a password';
}

// ---------------- Auth actions ----------------
async function register(event) {
    event.preventDefault();
    hideAuthErrors();

    const name = $('regName').value.trim();
    const username = $('regUsername').value.trim().toLowerCase();
    const email = $('regEmail').value.trim().toLowerCase();
    const password = $('regPassword').value;
    const confirm = $('regConfirm').value;
    const users = getUsers();

    if (name.length < 2) return showAuthError('registerError', 'Please enter your full name.');
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
        return showAuthError('registerError', 'Username must be 3–20 characters: letters, numbers or underscore.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return showAuthError('registerError', 'Please enter a valid email address.');
    }
    if (password.length < 6) return showAuthError('registerError', 'Password must be at least 6 characters.');
    if (password !== confirm) return showAuthError('registerError', 'Passwords do not match.');
    if (users[username]) return showAuthError('registerError', 'That username is already taken.');
    if (Object.values(users).some(u => u.email === email)) {
        return showAuthError('registerError', 'That email is already registered.');
    }

    const hash = await hashPassword(password);
    users[username] = { name, username, email, hash, createdAt: new Date().toISOString() };
    saveUsers(users);

    $('registerForm').reset();
    updateStrengthMeter();
    setSession(username, true);
    startApp(users[username]);
}

async function login(event) {
    event.preventDefault();
    hideAuthErrors();

    const identifier = $('loginIdentifier').value.trim().toLowerCase();
    const password = $('loginPassword').value;
    const users = getUsers();

    const user = Object.values(users).find(
        u => u.username === identifier || u.email === identifier
    );

    if (!user) return showAuthError('loginError', 'No account found with that username or email.');

    const hash = await hashPassword(password);
    if (hash !== user.hash) return showAuthError('loginError', 'Incorrect password. Please try again.');

    $('loginForm').reset();
    setSession(user.username, $('rememberMe').checked);
    startApp(user);
}

function loginAsGuest() {
    hideAuthErrors();

    // One-time migration: adopt tasks from the old single-user version.
    if (loadUserTasks('__guest').length === 0) {
        try {
            const legacy = JSON.parse(localStorage.getItem(LEGACY_TASKS_KEY)) || [];
            if (legacy.length > 0) saveUserTasks('__guest', legacy);
        } catch { /* ignore corrupt legacy data */ }
    }

    const guest = { name: 'Guest', username: '__guest', isGuest: true };
    setSession('__guest', true);
    startApp(guest);
}

function logout() {
    clearSession();
    currentUser = null;
    $('appView').classList.add('hidden');
    $('authView').classList.remove('hidden');
    $('loginPassword').value = '';
    switchAuthTab('login');
    $('loginIdentifier').focus();
}

// ---------------- Task data (per user) ----------------
const tasksKey = (username) => `vtdTasks_${username}`;
const settingsKey = (username) => `vtdSettings_${username}`;

let tasks = [];
let settings = { theme: 'light', filter: 'all', category: 'all', sort: 'default' };
let dragId = null;
let lastDeleted = null; // { task, index } for undo

function loadUserTasks(username) {
    try { return JSON.parse(localStorage.getItem(tasksKey(username))) || []; }
    catch { return []; }
}

function saveUserTasks(username, userTasks) {
    localStorage.setItem(tasksKey(username), JSON.stringify(userTasks));
}

function saveTasks() {
    if (currentUser) saveUserTasks(currentUser.username, tasks);
}

function saveSettings() {
    if (currentUser && !currentUser.isGuest) {
        localStorage.setItem(settingsKey(currentUser.username), JSON.stringify(settings));
    }
}

// ---------------- Date helpers ----------------
function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function taskDueDate(task) {
    if (!task.date) return null;
    const [y, m, d] = task.date.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function isOverdue(task) {
    if (!task.date || task.completed) return false;
    return taskDueDate(task) < startOfToday();
}

function isDueToday(task) {
    if (!task.date || task.completed) return false;
    return taskDueDate(task).getTime() === startOfToday().getTime();
}

function formatDate(dateString) {
    if (!dateString) return '';
    const [y, m, d] = dateString.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(timeVal) {
    if (!timeVal) return '';
    const [h, m] = timeVal.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ---------------- App start / stop ----------------
function startApp(user) {
    currentUser = user;
    $('authView').classList.add('hidden');
    $('appView').classList.remove('hidden');

    // Per-user settings (start from defaults, then load saved ones)
    settings = { theme: 'light', filter: 'all', category: 'all', sort: 'default' };
    if (!user.isGuest) {
        try {
            settings = Object.assign(settings, JSON.parse(localStorage.getItem(settingsKey(user.username))) || {});
        } catch { /* defaults */ }
    }

    applyTheme(settings.theme);
    $('themeToggle').textContent = settings.theme === 'dark' ? '☀️' : '🌙';

    tasks = loadUserTasks(user.username);

    // Greeting + avatar
    const hour = new Date().getHours();
    const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    $('greeting').textContent = `${part}, ${user.name}!`;
    $('userName').textContent = user.isGuest ? 'Guest' : user.name;
    $('userAvatar').textContent = user.name.trim().charAt(0).toUpperCase() || 'V';

    // Motivational quote (rotates daily)
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    $('motivation').textContent = QUOTES[dayOfYear % QUOTES.length];

    // Restore toolbar state from settings
    $('sortSelect').value = settings.sort;
    $('categoryFilter').value = settings.category;
    document.querySelectorAll('.filter-tab').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.filter === settings.filter));

    renderTasks();
    $('taskInput').focus();
}

function applyTheme(theme) {
    if (theme === 'dark') document.body.dataset.theme = 'dark';
    else delete document.body.dataset.theme;
}


// ---------------- Rendering ----------------
function getVisibleTasks() {
    let list = [...tasks];

    if (settings.filter === 'active') list = list.filter(t => !t.completed);
    if (settings.filter === 'done') list = list.filter(t => t.completed);

    if (settings.category !== 'all') {
        list = list.filter(t => (t.category || 'other') === settings.category);
    }

    const q = $('searchInput').value.trim().toLowerCase();
    if (q) list = list.filter(t => t.text.toLowerCase().includes(q));

    switch (settings.sort) {
        case 'due':
            list.sort((a, b) => (a.date ? a.date + (a.time || '23:59') : '9999')
                .localeCompare(b.date ? b.date + (b.time || '23:59') : '9999'));
            break;
        case 'priority':
            list.sort((a, b) => PRIORITY_ORDER[a.priority || 'medium'] - PRIORITY_ORDER[b.priority || 'medium']);
            break;
        case 'alpha':
            list.sort((a, b) => a.text.localeCompare(b.text));
            break;
        // 'default' keeps manual (drag & drop) order
    }
    return list;
}

function createChip(className, text) {
    const chip = document.createElement('span');
    chip.className = 'chip ' + className;
    chip.textContent = text;
    return chip;
}

function buildTaskMeta(task) {
    const meta = document.createElement('div');
    meta.className = 'task-meta';

    meta.appendChild(createChip(`chip-priority-${task.priority || 'medium'}`,
        '⚑ ' + PRIORITY_LABEL[task.priority || 'medium']));
    meta.appendChild(createChip('chip-category', CATEGORY_LABEL[task.category] || CATEGORY_LABEL.other));

    if (isOverdue(task)) {
        meta.appendChild(createChip('chip-overdue', `⚠ Overdue · ${formatDate(task.date)}`));
    } else if (isDueToday(task)) {
        meta.appendChild(createChip('chip-due-today', `Today${task.time ? ' · ' + formatTime(task.time) : ''}`));
    } else if (task.date || task.time) {
        let label = task.date ? formatDate(task.date) : '';
        if (task.time) label += (label ? ' · ' : '') + formatTime(task.time);
        meta.appendChild(createChip('chip-due', '📅 ' + label));
    }
    return meta;
}

function renderTask(task) {
    const li = document.createElement('li');
    li.dataset.id = task.id;
    li.draggable = true;
    if (task.completed) li.classList.add('completed');

    // Complete toggle
    const completeBtn = document.createElement('button');
    completeBtn.innerHTML = '✓';
    completeBtn.className = 'complete-btn' + (task.completed ? ' active' : '');
    completeBtn.setAttribute('aria-label', 'Mark task complete');
    completeBtn.onclick = () => {
        task.completed = !task.completed;
        if (task.completed) {
            task.completedAt = new Date().toISOString();
            showToast('Task completed! 🎉');
        }
        saveTasks();
        renderTasks();
    };

    // Main column: text + meta chips
    const main = document.createElement('div');
    main.className = 'task-main';

    const textSpan = document.createElement('span');
    textSpan.className = 'task-text';
    textSpan.textContent = task.text;
    textSpan.title = 'Double-click to edit';
    textSpan.ondblclick = () => startEdit(task, textSpan);

    main.appendChild(textSpan);
    main.appendChild(buildTaskMeta(task));

    // Actions
    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const editBtn = document.createElement('button');
    editBtn.textContent = '✎';
    editBtn.className = 'task-action-btn edit-btn';
    editBtn.title = 'Edit task';
    editBtn.onclick = () => startEdit(task, textSpan);

    const delBtn = document.createElement('button');
    delBtn.textContent = '🗑';
    delBtn.className = 'task-action-btn del-btn';
    delBtn.title = 'Delete task';
    delBtn.onclick = () => deleteTask(task.id);

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    // Drag & drop reordering
    li.addEventListener('dragstart', () => { dragId = task.id; li.classList.add('dragging'); });
    li.addEventListener('dragend', () => { li.classList.remove('dragging'); dragId = null; });
    li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('drag-over'); });
    li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
    li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('drag-over');
        if (dragId === null || dragId === task.id) return;
        const from = tasks.findIndex(t => t.id === dragId);
        const to = tasks.findIndex(t => t.id === task.id);
        if (from === -1 || to === -1) return;
        const [moved] = tasks.splice(from, 1);
        tasks.splice(to, 0, moved);
        dragId = null;
        saveTasks();
        renderTasks();
    });

    li.appendChild(completeBtn);
    li.appendChild(main);
    li.appendChild(actions);
    return li;
}

function renderTasks() {
    const taskList = $('taskList');
    const emptyState = $('emptyState');
    taskList.innerHTML = '';

    const visible = getVisibleTasks();
    visible.forEach(task => taskList.appendChild(renderTask(task)));

    const q = $('searchInput').value.trim();
    if (tasks.length === 0) {
        $('emptyText').textContent = 'No tasks here yet.';
    } else if (visible.length === 0) {
        $('emptyText').textContent = q
            ? `No tasks match "${q}".`
            : 'Nothing matches the current filters.';
    }
    updateDashboard();
}

// ---------------- Theme toggle ----------------
function toggleTheme() {
    settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
    applyTheme(settings.theme);
    $('themeToggle').textContent = settings.theme === 'dark' ? '☀️' : '🌙';
    saveSettings();
}

// ---------------- Task CRUD ----------------
function addTask() {
    const taskInput = $('taskInput');
    const text = taskInput.value.trim();
    if (!text) { taskInput.focus(); return; }

    tasks.push({
        id: Date.now() + Math.random().toString(16).slice(2, 6),
        text,
        date: $('taskDate').value,
        time: $('taskTime').value,
        priority: $('taskPriority').value,
        category: $('taskCategory').value,
        completed: false,
        createdAt: new Date().toISOString()
    });

    saveTasks();
    renderTasks();
    taskInput.value = '';
    taskInput.focus();
}

function deleteTask(id) {
    const index = tasks.findIndex(t => t.id === id);
    if (index === -1) return;

    lastDeleted = { task: tasks[index], index };
    tasks.splice(index, 1);
    saveTasks();
    renderTasks();
    showToast('Task deleted', {
        undo: () => {
            if (!lastDeleted) return;
            tasks.splice(Math.min(lastDeleted.index, tasks.length), 0, lastDeleted.task);
            lastDeleted = null;
            saveTasks();
            renderTasks();
        }
    });
}

function clearCompleted() {
    const count = tasks.filter(t => t.completed).length;
    if (count === 0) { showToast('No completed tasks to clear'); return; }

    const removed = tasks.filter(t => t.completed);
    const firstIndex = tasks.findIndex(t => t.completed);
    tasks = tasks.filter(t => !t.completed);
    saveTasks();
    renderTasks();
    showToast(`${count} completed task${count > 1 ? 's' : ''} cleared`, {
        undo: () => {
            tasks.splice(firstIndex, 0, ...removed);
            saveTasks();
            renderTasks();
        }
    });
}

function startEdit(task, textSpan) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = task.text;
    input.className = 'edit-input';
    textSpan.replaceWith(input);
    input.focus();
    input.select();

    let finished = false;
    const finish = (save) => {
        if (finished) return;
        finished = true;
        if (save) {
            const v = input.value.trim();
            if (v) task.text = v;
        }
        saveTasks();
        renderTasks();
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
}

// ---------------- Dashboard ----------------
function updateDashboard() {
    const total = tasks.length;
    const done = tasks.filter(t => t.completed).length;
    const pending = total - done;
    const overdue = tasks.filter(isOverdue).length;

    $('totalTasks').textContent = total;
    $('completedTasks').textContent = done;
    $('pendingTasks').textContent = pending;
    $('overdueTasks').textContent = overdue;

    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    $('progressFill').style.width = pct + '%';
    $('progressLabel').textContent =
        total === 0 ? 'Add your first task to see progress' : `${pct}% complete`;
}

// ---------------- Toast ----------------
let toastTimer = null;

function showToast(message, opts = {}) {
    $('toastMsg').textContent = message;
    const undoBtn = $('toastUndo');
    if (opts.undo) {
        undoBtn.classList.remove('hidden');
        undoBtn.onclick = () => { hideToast(); opts.undo(); };
    } else {
        undoBtn.classList.add('hidden');
    }
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, opts.duration || 5000);
}

function hideToast() {
    $('toast').classList.remove('show');
}

// ---------------- Export ----------------
function exportTasks() {
    if (tasks.length === 0) { showToast('No tasks to export yet'); return; }
    const data = {
        app: 'Vor-To-Do',
        user: currentUser ? currentUser.name : 'unknown',
        exportedAt: new Date().toISOString(),
        tasks
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vortodo-${currentUser.username}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Tasks exported as JSON 📄');
}

// ---------------- Event wiring ----------------
function bindEvents() {
    // Auth
    $('tabLogin').addEventListener('click', () => switchAuthTab('login'));
    $('tabRegister').addEventListener('click', () => switchAuthTab('register'));
    $('loginForm').addEventListener('submit', login);
    $('registerForm').addEventListener('submit', register);
    $('guestBtn').addEventListener('click', loginAsGuest);
    $('regPassword').addEventListener('input', updateStrengthMeter);
    document.querySelectorAll('.pw-toggle').forEach(btn =>
        btn.addEventListener('click', () => togglePasswordVisibility(btn)));

    // Tasks & app controls
    $('addBtn').addEventListener('click', addTask);
    $('taskInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') addTask(); });
    $('logoutBtn').addEventListener('click', logout);
    $('themeToggle').addEventListener('click', toggleTheme);
    $('exportBtn').addEventListener('click', exportTasks);
    $('clearDoneBtn').addEventListener('click', clearCompleted);

    // Toolbar
    $('searchInput').addEventListener('input', renderTasks);
    document.querySelectorAll('.filter-tab').forEach(btn =>
        btn.addEventListener('click', () => {
            settings.filter = btn.dataset.filter;
            document.querySelectorAll('.filter-tab').forEach(b => b.classList.toggle('active', b === btn));
            saveSettings();
            renderTasks();
        }));
    $('categoryFilter').addEventListener('change', (e) => {
        settings.category = e.target.value;
        saveSettings();
        renderTasks();
    });
    $('sortSelect').addEventListener('change', (e) => {
        settings.sort = e.target.value;
        saveSettings();
        renderTasks();
    });

    // Keyboard shortcut: "/" focuses the search box
    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== $('searchInput')
            && !document.activeElement.matches('input, textarea, select')
            && !$('appView').classList.contains('hidden')) {
            e.preventDefault();
            $('searchInput').focus();
        }
    });
}

// ---------------- Init ----------------
(function init() {
    bindEvents();
    const session = getSession();
    if (!session) return;
    if (session.username === '__guest') {
        startApp({ name: 'Guest', username: '__guest', isGuest: true });
    } else {
        const user = getUsers()[session.username];
        if (user) startApp(user);
        else clearSession();
    }
})();
