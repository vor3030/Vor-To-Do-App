/* =====================================================================
   Vor-To-Do App — script.js
   Real accounts & cloud sync via Supabase (Auth + Postgres with RLS).
   Falls back to local-only "Guest" mode when Supabase isn't configured
   or the user isn't signed in.
   Setup: see README.md and config.js.
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

// ---------------- Supabase ----------------
let sb = null;           // Supabase client (null = not configured)
let cloudMode = false;   // true once a Supabase user is signed in

function initSupabase() {
    const cfg = window.SUPABASE_CONFIG || {};
    const ready = cfg.url && cfg.anonKey &&
        !String(cfg.url).includes('YOUR_') && !String(cfg.anonKey).includes('YOUR_');
    if (ready && window.supabase && window.supabase.createClient) {
        sb = window.supabase.createClient(cfg.url, cfg.anonKey);
    }
    if (!sb) $('configBanner').classList.remove('hidden');
}

// ---------------- Local storage (Guest mode + settings) ----------------
const LOCAL_TASKS_KEY = 'vtdLocalTasks';      // guest-mode tasks
const LEGACY_TASKS_KEY = 'rovDouphneTasks';   // tasks from the very first app version
const LEGACY_USERS_KEY = 'vtdUsers';          // old demo accounts — cleaned up on load

function loadLocalTasks() {
    // One-time migration from the old single-user version
    if (localStorage.getItem(LOCAL_TASKS_KEY) === null) {
        try {
            const legacy = JSON.parse(localStorage.getItem(LEGACY_TASKS_KEY)) || [];
            if (legacy.length > 0) localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(legacy));
        } catch { /* ignore corrupt legacy data */ }
    }
    try { return JSON.parse(localStorage.getItem(LOCAL_TASKS_KEY)) || []; }
    catch { return []; }
}

function saveLocalTasks() {
    localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks));
}

// ---------------- App state ----------------
let tasks = [];
let settings = { theme: 'light', filter: 'all', category: 'all', sort: 'default' };
let dragId = null;

function settingsKey() {
    return `vtdSettings_${currentUser ? currentUser.uid : 'anon'}`;
}

function loadSettings() {
    settings = { theme: 'light', filter: 'all', category: 'all', sort: 'default' };
    try {
        settings = Object.assign(settings, JSON.parse(localStorage.getItem(settingsKey())) || {});
    } catch { /* defaults */ }
}

function saveSettings() {
    if (currentUser) localStorage.setItem(settingsKey(), JSON.stringify(settings));
}

// ---------------- Auth UI ----------------
let currentUser = null; // { name, uid, email, guest }

function showAuthError(id, message) {
    const el = $(id);
    el.textContent = message;
    el.classList.remove('hidden');
}

function showAuthInfo(id, message) {
    const el = $(id);
    el.textContent = message;
    el.classList.remove('hidden');
}

function hideAuthMessages() {
    ['loginError', 'loginInfo', 'registerError', 'registerInfo']
        .forEach(id => $(id).classList.add('hidden'));
}

function switchAuthTab(tab) {
    hideAuthMessages();
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
const NOT_CONFIGURED_MSG = 'Cloud accounts aren\'t configured yet — add your Supabase keys to config.js (see README.md), or continue as Guest.';

async function register(event) {
    event.preventDefault();
    hideAuthMessages();

    const name = $('regName').value.trim();
    const email = $('regEmail').value.trim();
    const password = $('regPassword').value;
    const confirm = $('regConfirm').value;

    if (name.length < 2) return showAuthError('registerError', 'Please enter your full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return showAuthError('registerError', 'Please enter a valid email address.');
    }
    if (password.length < 6) return showAuthError('registerError', 'Password must be at least 6 characters.');
    if (password !== confirm) return showAuthError('registerError', 'Passwords do not match.');
    if (!sb) return showAuthError('registerError', NOT_CONFIGURED_MSG);

    const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
            data: { full_name: name },
            emailRedirectTo: location.origin + location.pathname
        }
    });

    if (error) return showAuthError('registerError', error.message);

    $('registerForm').reset();
    updateStrengthMeter();

    if (data.session && data.user) {
        // Email confirmation is disabled → signed in immediately
        // (the auth-state listener will start the app)
    } else {
        switchAuthTab('login');
        $('loginEmail').value = email;
        showAuthInfo('loginInfo', 'Account created! 📧 Check your email inbox and confirm your address, then log in here.');
    }
}

async function login(event) {
    event.preventDefault();
    hideAuthMessages();

    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;
    if (!email || !password) return showAuthError('loginError', 'Please enter your email and password.');
    if (!sb) return showAuthError('loginError', NOT_CONFIGURED_MSG);

    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return showAuthError('loginError', error.message);

    // Success → the auth-state listener starts the app
    $('loginForm').reset();
}

async function forgotPassword() {
    hideAuthMessages();
    if (!sb) return showAuthError('loginError', NOT_CONFIGURED_MSG);

    const email = $('loginEmail').value.trim();
    if (!email) return showAuthError('loginError', 'Type your email above first, then click "Forgot password?".');

    const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: location.origin + location.pathname
    });
    if (error) return showAuthError('loginError', error.message);

    showAuthInfo('loginInfo', `Password reset email sent to ${email}. 📬`);
}

function loginAsGuest() {
    hideAuthMessages();
    cloudMode = false;
    currentUser = { name: 'Guest', uid: '__guest', email: null, guest: true };
    startApp();
}

async function logout() {
    if (sb && cloudMode) {
        await sb.auth.signOut(); // the auth-state listener shows the auth view
    } else {
        showAuth();
    }
}

function showAuth() {
    currentUser = null;
    cloudMode = false;
    $('appView').classList.add('hidden');
    $('authView').classList.remove('hidden');
    $('loginPassword').value = '';
    switchAuthTab('login');
    $('loginEmail').focus();
}

// ---------------- Session handling ----------------
async function handleSignedIn(user) {
    if (cloudMode && currentUser && currentUser.uid === user.id) return; // already running

    cloudMode = true;
    const meta = user.user_metadata || {};
    currentUser = {
        name: meta.full_name || (user.email || 'user').split('@')[0],
        uid: user.id,
        email: user.email,
        guest: false
    };

    try {
        await offerLocalTaskUpload();
        tasks = await loadCloudTasks();
    } catch (e) {
        tasks = [];
        showToast('Could not load tasks: ' + e.message);
    }
    startApp();
}

/**
 * First sign-in nicety: if the cloud account has no tasks yet but this
 * device has saved (guest/legacy) tasks, offer a one-click upload.
 */
async function offerLocalTaskUpload() {
    const localTasks = loadLocalTasks();
    if (localTasks.length === 0) return;

    const { data } = await sb.from('tasks').select('id').limit(1);
    if (data && data.length > 0) return; // account already has tasks

    showToast(`Found ${localTasks.length} task(s) saved on this device`, {
        duration: 10000,
        actionLabel: 'Upload',
        onAction: async () => {
            const rows = localTasks.map((t, i) => ({
                text: t.text,
                due_date: t.date || null,
                due_time: t.time || null,
                priority: t.priority || 'medium',
                category: t.category || 'personal',
                completed: !!t.completed,
                completed_at: t.completedAt || null,
                sort_order: i
            }));
            const { error } = await sb.from('tasks').insert(rows);
            if (error) return showToast('Upload failed: ' + error.message);
            localStorage.removeItem(LOCAL_TASKS_KEY);
            tasks = await loadCloudTasks();
            renderTasks();
            showToast('Tasks uploaded to your account ☁️');
        }
    });
}

// ---------------- Cloud data layer ----------------
const FIELD_MAP = {
    text: 'text',
    date: 'due_date',
    time: 'due_time',
    priority: 'priority',
    category: 'category',
    completed: 'completed',
    completedAt: 'completed_at'
};

function rowToTask(r) {
    return {
        id: r.id,
        text: r.text,
        date: r.due_date || '',
        time: (r.due_time || '').slice(0, 5),
        priority: r.priority || 'medium',
        category: r.category || 'personal',
        completed: !!r.completed,
        completedAt: r.completed_at || null,
        createdAt: r.created_at
    };
}

async function loadCloudTasks() {
    const { data, error } = await sb.from('tasks')
        .select('*')
        .eq('user_id', currentUser.uid)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(rowToTask);
}

async function cloudInsert(task, sortOrder) {
    const { data, error } = await sb.from('tasks').insert({
        user_id: currentUser.uid,
        text: task.text,
        due_date: task.date || null,
        due_time: task.time || null,
        priority: task.priority || 'medium',
        category: task.category || 'personal',
        completed: !!task.completed,
        completed_at: task.completedAt || null,
        sort_order: sortOrder
    }).select('id').single();
    if (error) { showToast('Sync failed: ' + error.message); return null; }
    return data.id;
}

async function cloudUpdate(taskId, changes) {
    const patch = {};
    for (const [key, value] of Object.entries(changes)) {
        const col = FIELD_MAP[key];
        if (!col) continue;
        patch[col] = (key === 'date' || key === 'time') ? (value || null) : value;
    }
    const { error } = await sb.from('tasks').update(patch).eq('id', taskId);
    if (error) showToast('Sync failed: ' + error.message);
}

function persistOrder() {
    if (cloudMode) {
        tasks.forEach((t, i) => sb.from('tasks').update({ sort_order: i }).eq('id', t.id));
    } else {
        saveLocalTasks();
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

// ---------------- App start ----------------
function startApp() {
    $('authView').classList.add('hidden');
    $('appView').classList.remove('hidden');

    loadSettings();
    applyTheme(settings.theme);
    $('themeToggle').textContent = settings.theme === 'dark' ? '☀️' : '🌙';

    if (!cloudMode) tasks = loadLocalTasks();

    // Greeting + avatar
    const hour = new Date().getHours();
    const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    $('greeting').textContent = `${part}, ${currentUser.name}!`;
    $('userName').textContent = currentUser.guest ? 'Guest' : currentUser.name;
    $('userAvatar').textContent = currentUser.name.trim().charAt(0).toUpperCase() || 'V';

    // Motivational quote (rotates daily)
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    $('motivation').textContent = QUOTES[dayOfYear % QUOTES.length];

    // Restore toolbar state
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

function toggleTheme() {
    settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
    applyTheme(settings.theme);
    $('themeToggle').textContent = settings.theme === 'dark' ? '☀️' : '🌙';
    saveSettings();
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
    completeBtn.onclick = async () => {
        task.completed = !task.completed;
        if (task.completed) task.completedAt = new Date().toISOString();
        else task.completedAt = null;
        if (cloudMode) await cloudUpdate(task.id, { completed: task.completed, completedAt: task.completedAt });
        else saveLocalTasks();
        if (task.completed) showToast('Task completed! 🎉');
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
        persistOrder();
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
    emptyState.classList.toggle('hidden', visible.length > 0);

    updateDashboard();
}

// ---------------- Task CRUD ----------------
async function addTask() {
    const taskInput = $('taskInput');
    const text = taskInput.value.trim();
    if (!text) { taskInput.focus(); return; }

    const task = {
        text,
        date: $('taskDate').value,
        time: $('taskTime').value,
        priority: $('taskPriority').value,
        category: $('taskCategory').value,
        completed: false,
        completedAt: null,
        createdAt: new Date().toISOString()
    };

    if (cloudMode) {
        const id = await cloudInsert(task, tasks.length);
        if (!id) return; // sync failed — don't add a ghost row
        task.id = id;
        tasks.push(task);
    } else {
        task.id = Date.now() + Math.random().toString(16).slice(2, 6);
        tasks.push(task);
        saveLocalTasks();
    }
    renderTasks();
    taskInput.value = '';
    taskInput.focus();
}

async function deleteTask(id) {
    const index = tasks.findIndex(t => t.id === id);
    if (index === -1) return;

    const removed = tasks[index];
    tasks.splice(index, 1);

    if (cloudMode) {
        const { error } = await sb.from('tasks').delete().eq('id', id);
        if (error) showToast('Sync failed: ' + error.message);
    } else {
        saveLocalTasks();
    }

    renderTasks();
    showToast('Task deleted', {
        undo: () => restoreTask(removed, index)
    });
}

async function restoreTask(task, index) {
    if (cloudMode) {
        const id = await cloudInsert(task, index);
        if (id) task.id = id;
    } else {
        saveLocalTasks();
    }
    tasks.splice(Math.min(index, tasks.length), 0, task);
    persistOrder();
    renderTasks();
}

async function clearCompleted() {
    const removed = tasks.filter(t => t.completed);
    if (removed.length === 0) { showToast('No completed tasks to clear'); return; }

    const firstIndex = tasks.findIndex(t => t.completed);
    tasks = tasks.filter(t => !t.completed);

    if (cloudMode) {
        const { error } = await sb.from('tasks').delete().in('id', removed.map(t => t.id));
        if (error) showToast('Sync failed: ' + error.message);
    } else {
        saveLocalTasks();
    }

    renderTasks();
    showToast(`${removed.length} completed task${removed.length > 1 ? 's' : ''} cleared`, {
        undo: async () => {
            for (const t of removed) {
                if (cloudMode) {
                    const id = await cloudInsert(t, tasks.length);
                    if (id) t.id = id;
                }
                tasks.push(t);
            }
            persistOrder();
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
        const value = input.value.trim();
        if (save && value && value !== task.text) {
            task.text = value;
            if (cloudMode) cloudUpdate(task.id, { text: value });
            else saveLocalTasks();
        }
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
    const actionBtn = $('toastAction');

    if (opts.undo) {
        undoBtn.classList.remove('hidden');
        undoBtn.onclick = () => { hideToast(); opts.undo(); };
    } else {
        undoBtn.classList.add('hidden');
    }

    if (opts.actionLabel && opts.onAction) {
        actionBtn.textContent = opts.actionLabel;
        actionBtn.classList.remove('hidden');
        actionBtn.onclick = () => { hideToast(); opts.onAction(); };
    } else {
        actionBtn.classList.add('hidden');
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
        user: currentUser ? (currentUser.email || currentUser.name) : 'unknown',
        exportedAt: new Date().toISOString(),
        tasks
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vortodo-tasks-${new Date().toISOString().slice(0, 10)}.json`;
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
    $('forgotBtn').addEventListener('click', forgotPassword);
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
(async function init() {
    // Clean up storage from the old demo version
    localStorage.removeItem(LEGACY_USERS_KEY);

    initSupabase();
    bindEvents();

    if (!sb) return; // Guest-only mode until Supabase is configured

    try {
        // Restore an existing session (stays signed in across visits)
        const { data } = await sb.auth.getSession();
        if (data && data.session && data.session.user) {
            await handleSignedIn(data.session.user);
        }
    } catch (e) {
        console.error('Session restore failed:', e);
    }

    // React to sign-in / sign-out in any tab or after email confirmation
    sb.auth.onAuthStateChange((event, session) => {
        if (session && session.user) {
            handleSignedIn(session.user);
        } else if (event === 'SIGNED_OUT') {
            showAuth();
        }
    });
})();
