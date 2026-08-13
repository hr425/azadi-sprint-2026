const socket = io();

const $ = id => document.getElementById(id);

let role = null;
let currentQuestion = -1;
let timerInterval = null;
let answerLocked = false;
let hostAnswers = {};

const screens = {
  home: $("homeScreen"),
  host: $("hostScreen"),
  participant: $("participantScreen")
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
}

$("hostLoginBtn").onclick = () => {
  const name = $("hostName").value;
  socket.emit("hostLogin", { name });
};

$("participantLoginBtn").onclick = () => {
  const name = $("participantName").value.trim();
  if (!name) return toast("Please enter your name.");
  socket.emit("participantLogin", { name });
};

$("startBtn").onclick = () => {
  socket.emit("startSession");
  $("startBtn").disabled = true;
};

$("hostLogoutBtn").onclick = () => location.reload();
$("participantLogoutBtn").onclick = () => location.reload();

$("submitBtn").onclick = submitAnswer;
$("answerInput").addEventListener("keydown", e => {
  if (e.key === "Enter") submitAnswer();
});

function submitAnswer() {
  if (answerLocked) return;
  const input = $("answerInput");
  const answer = input.value.trim();
  if (!answer) return toast("Type an answer first.");
  answerLocked = true;
  $("submitBtn").disabled = true;
  socket.emit("submitAnswer", { answer });
}

socket.on("loginError", data => toast(data.message));

socket.on("hostLoggedIn", data => {
  role = "host";
  $("hostWelcome").textContent = `Logged in as ${data.name}`;
  showScreen("host");
});

socket.on("participantLoggedIn", data => {
  role = "participant";
  $("participantWelcome").textContent = `Welcome, ${data.name}`;
  showScreen("participant");
});

socket.on("state", state => {
  if (role === "host") {
    $("hostStatus").textContent =
      state.status === "running" ? `Question ${state.questionIndex + 1} is live` :
      state.status === "finished" ? "Quiz finished" : "Waiting to start";
    if (state.status === "finished") {
      $("startBtn").disabled = true;
    }
  }

  if (role === "participant") {
    if (state.status === "waiting") {
      $("waitingPanel").classList.remove("hidden");
      $("questionPanel").classList.add("hidden");
      $("finishPanel").classList.add("hidden");
    }
  }
});

socket.on("question", q => {
  if (role !== "participant") return;

  currentQuestion = q.index;
  answerLocked = false;
  $("waitingPanel").classList.add("hidden");
  $("finishPanel").classList.add("hidden");
  $("questionPanel").classList.remove("hidden");
  $("questionNumber").textContent = `QUESTION ${q.index + 1} / ${q.total}`;
  $("questionText").textContent = q.text;
  $("answerInput").value = "";
  $("answerInput").disabled = false;
  $("submitBtn").disabled = false;
  $("answerMessage").textContent = "";
  startTimer(q.startedAt, q.durationMs);
  setTimeout(() => $("answerInput").focus(), 50);
});

function startTimer(startedAt, durationMs) {
  clearInterval(timerInterval);
  const tick = () => {
    const remaining = Math.max(0, durationMs - (Date.now() - startedAt));
    $("timer").textContent = Math.ceil(remaining / 1000);
    if (remaining <= 0) {
      clearInterval(timerInterval);
      answerLocked = true;
      $("answerInput").disabled = true;
      $("submitBtn").disabled = true;
      $("answerMessage").textContent = "Time's up!";
    }
  };
  tick();
  timerInterval = setInterval(tick, 100);
}

socket.on("answerAccepted", data => {
  $("answerMessage").textContent = data.message;
});

socket.on("answerRejected", data => {
  answerLocked = true;
  $("answerMessage").textContent = data.message;
});

socket.on("questionClosed", () => {
  if (role === "participant") {
    answerLocked = true;
    $("answerInput").disabled = true;
    $("submitBtn").disabled = true;
  }
});

socket.on("liveAnswer", data => {
  if (role !== "host") return;
  const idx = data.questionIndex;
  hostAnswers[idx] ||= [];
  hostAnswers[idx].push(data.record);
  renderLiveAnswers(idx);
});

function renderLiveAnswers(idx) {
  $("hostQuestionLabel").textContent = `Question ${idx + 1} — First to last`;
  const list = $("liveAnswers");
  const records = hostAnswers[idx] || [];
  list.classList.remove("empty");
  list.innerHTML = records.length
    ? records.map(r => `
      <div class="answer-item">
        <div class="rank">#${r.rank}</div>
        <div>
          <div class="answer-name">${escapeHtml(r.participantName)}</div>
          <div class="answer-text">${escapeHtml(r.answer)}</div>
        </div>
        <div class="answer-time">${new Date(r.answeredAt).toLocaleTimeString()}</div>
      </div>
    `).join("")
    : "No answers yet.";
}

socket.on("quizFinished", () => {
  if (role === "participant") {
    clearInterval(timerInterval);
    $("questionPanel").classList.add("hidden");
    $("waitingPanel").classList.add("hidden");
    $("finishPanel").classList.remove("hidden");
  }
  if (role === "host") {
    $("hostStatus").textContent = "Quiz finished — results ready";
  }
});

socket.on("results", data => {
  if (role !== "host") return;
  $("resultsPanel").classList.remove("hidden");
  const container = $("finalResults");

  container.innerHTML = data.questions.map((q, i) => {
    const records = data.answers[i] || [];
    return `
      <div class="question-result">
        <h3>Q${i + 1}. ${escapeHtml(q.text)}</h3>
        <p><b>Reference answer:</b> ${escapeHtml(q.answer)}</p>
        <table class="results-table">
          <thead><tr><th>Rank</th><th>Participant</th><th>Answer</th><th>Time</th></tr></thead>
          <tbody>
            ${records.length ? records.map(r => `
              <tr>
                <td>#${r.rank}</td>
                <td>${escapeHtml(r.participantName)}</td>
                <td>${escapeHtml(r.answer)}</td>
                <td>${new Date(r.answeredAt).toLocaleTimeString()}</td>
              </tr>`).join("") :
              `<tr><td colspan="4">No answers.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }).join("");
});

$("printBtn").onclick = () => window.print();

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}
