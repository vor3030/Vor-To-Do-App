let tasks = JSON.parse(localStorage.getItem('rovDouphneTasks')) || [];

function saveTasks() {
    localStorage.setItem('rovDouphneTasks', JSON.stringify(tasks));
}

function updateDashboard() {
    const total = tasks.length;
    const completed = tasks.filter(task => task.completed).length;
    const pending = total - completed;

    document.getElementById('totalTasks').textContent = total;
    document.getElementById('completedTasks').textContent = completed;
    document.getElementById('pendingTasks').textContent = pending;
}

// Helper function to format date (e.g., "2023-10-31" -> "Oct 31")
function formatDate(dateString) {
    if (!dateString) return "";
    const [year, month, day] = dateString.split('-');
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(timeVal) {
    if (!timeVal) return "";
    const [hours, minutes] = timeVal.split(':');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    return `${formattedHours}:${minutes} ${ampm}`;
}

function renderTask(task) {
    const taskList = document.getElementById("taskList");
    const li = document.createElement("li");
    
    if (task.completed) {
        li.classList.add("completed");
    }

    const taskContent = document.createElement("div");
    taskContent.className = "task-content";

    const completeBtn = document.createElement("button");
    completeBtn.innerHTML = "✓";
    completeBtn.className = "complete-btn";
    completeBtn.setAttribute("aria-label", "Mark task complete");
    if (task.completed) completeBtn.classList.add("active");
    
    completeBtn.onclick = function() {
        li.classList.toggle("completed");
        completeBtn.classList.toggle("active");
        
        task.completed = !task.completed;
        saveTasks();
        updateDashboard();
    };

    const textSpan = document.createElement("span");
    textSpan.className = "task-text";
    textSpan.textContent = task.text;

    taskContent.appendChild(completeBtn);
    taskContent.appendChild(textSpan);

    // Combine Date and Time nicely
    let dateTimeStr = "";
    if (task.date) {
        dateTimeStr += formatDate(task.date);
    }
    if (task.time) {
        if (dateTimeStr !== "") dateTimeStr += " @ ";
        dateTimeStr += formatTime(task.time);
    }

    if (dateTimeStr !== "") {
        const timeSpan = document.createElement("span");
        timeSpan.className = "task-time";
        timeSpan.textContent = dateTimeStr;
        taskContent.appendChild(timeSpan);
    }

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove";
    removeBtn.className = "remove-btn";
    
    removeBtn.onclick = function() {
        taskList.removeChild(li);
        tasks = tasks.filter(t => t.id !== task.id);
        saveTasks();
        updateDashboard();
    };

    li.appendChild(taskContent);
    li.appendChild(removeBtn);
    taskList.appendChild(li);
}

function addTask() {
    const taskInput = document.getElementById("taskInput");
    const dateInput = document.getElementById("taskDate");
    const timeInput = document.getElementById("taskTime");
    
    const taskText = taskInput.value.trim();
    const taskDateVal = dateInput.value;
    const taskTimeVal = timeInput.value;

    if (taskText === "") return;

    const newTask = {
        id: Date.now(), 
        text: taskText,
        date: taskDateVal,
        time: taskTimeVal,
        completed: false
    };

    tasks.push(newTask);
    saveTasks();
    renderTask(newTask);
    updateDashboard();
    
    taskInput.value = "";
    dateInput.value = "";
    timeInput.value = "";
}

document.getElementById("taskInput").addEventListener("keypress", function(event) {
    if (event.key === "Enter") {
        addTask();
    }
});

function init() {
    tasks.forEach(task => renderTask(task));
    updateDashboard();
}

init();