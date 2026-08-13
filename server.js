const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const HOSTS = new Set(["Sejal T", "Chandni M"]);

const QUESTIONS = [
  {
    text: "On which date was the Indian National Congress founded?",
    answer: "28 December 1885"
  },
  {
    text: "Who gave the slogan “Give me blood, and I will give you freedom”?",
    answer: "Subhas Chandra Bose"
  },
  {
    text: "Who designed the original flag of the Indian National Congress that inspired later national flag designs?",
    answer: "Pingali Venkayya"
  },
  {
    text: "Which movement was launched by Mahatma Gandhi in August 1942 demanding an end to British rule in India?",
    answer: "Quit India Movement"
  },
  {
    text: "Who was the first Indian woman president of the Indian National Congress?",
    answer: "Sarojini Naidu"
  },
  {
    text: "Who was the last Viceroy of British India?",
    answer: "Lord Mountbatten"
  },
  {
    text: "Who wrote the book “Discovery of India”?",
    answer: "Jawaharlal Nehru"
  },
  {
    text: "At what time was the Indian national flag hoisted by Jawaharlal Nehru on 15 August 1947 at the Red Fort?",
    answer: "Around 8:30 AM"
  }
];

let session = {
  status: "waiting",
  questionIndex: -1,
  questionStartedAt: null,
  participants: {},
  answers: Array.from({ length: QUESTIONS.length }, () => []),
  host: null
};

function publicState() {
  return {
    status: session.status,
    questionIndex: session.questionIndex,
    questionStartedAt: session.questionStartedAt,
    questionCount: QUESTIONS.length,
    participants: Object.values(session.participants).map(p => ({
      id: p.id,
      name: p.name
    }))
  };
}

function broadcastState() {
  io.emit("state", publicState());
}

function sendQuestion(socket) {
  if (session.questionIndex < 0 || session.questionIndex >= QUESTIONS.length) return;
  socket.emit("question", {
    index: session.questionIndex,
    total: QUESTIONS.length,
    text: QUESTIONS[session.questionIndex].text,
    startedAt: session.questionStartedAt,
    durationMs: 15000
  });
}

function startQuestion() {
  session.questionStartedAt = Date.now();
  io.emit("question", {
    index: session.questionIndex,
    total: QUESTIONS.length,
    text: QUESTIONS[session.questionIndex].text,
    startedAt: session.questionStartedAt,
    durationMs: 15000
  });

  setTimeout(() => {
    if (session.status !== "running") return;
    if (Date.now() - session.questionStartedAt >= 15000) {
      io.emit("questionClosed", { index: session.questionIndex });
      setTimeout(() => {
        if (session.status !== "running") return;
        if (session.questionIndex < QUESTIONS.length - 1) {
          session.questionIndex++;
          startQuestion();
          broadcastState();
        } else {
          session.status = "finished";
          session.questionStartedAt = null;
          io.emit("quizFinished", {
            message: "Jai Hind! Thank you for playing."
          });
          broadcastState();
          sendResultsToHosts();
        }
      }, 600);
    }
  }, 15100);
}

function sendResultsToHosts() {
  const sockets = io.sockets.sockets;
  for (const [, socket] of sockets) {
    if (socket.data.role === "host") {
      socket.emit("results", {
        questions: QUESTIONS,
        answers: session.answers
      });
    }
  }
}

app.use(express.static(path.join(__dirname, "public")));

io.on("connection", socket => {
  socket.emit("state", publicState());

  socket.on("hostLogin", ({ name }) => {
    const clean = String(name || "").trim();
    if (!HOSTS.has(clean)) {
      socket.emit("loginError", {
        message: "You are a participant, kindly log in through Participants Login."
      });
      return;
    }

    socket.data.role = "host";
    socket.data.name = clean;
    session.host = clean;

    socket.emit("hostLoggedIn", { name: clean });
    socket.emit("state", publicState());

    if (session.status === "running") sendQuestion(socket);
    if (session.status === "finished") sendResultsToHosts();
  });

  socket.on("participantLogin", ({ name }) => {
    const clean = String(name || "").trim().replace(/\s+/g, " ");
    if (!clean || clean.length < 2 || clean.length > 40) {
      socket.emit("loginError", { message: "Please enter a valid participant name." });
      return;
    }

    socket.data.role = "participant";
    socket.data.name = clean;
    session.participants[socket.id] = {
      id: socket.id,
      name: clean
    };

    socket.emit("participantLoggedIn", { name: clean });
    socket.emit("state", publicState());

    if (session.status === "running") sendQuestion(socket);
  });

  socket.on("startSession", () => {
    if (socket.data.role !== "host") return;
    if (session.status === "running") return;

    session.status = "running";
    session.questionIndex = 0;
    session.answers = Array.from({ length: QUESTIONS.length }, () => []);
    broadcastState();
    startQuestion();
  });

  socket.on("submitAnswer", ({ answer }) => {
    if (socket.data.role !== "participant") return;
    if (session.status !== "running") return;

    const idx = session.questionIndex;
    if (idx < 0 || idx >= QUESTIONS.length) return;

    const elapsed = Date.now() - session.questionStartedAt;
    if (elapsed > 15000) {
      socket.emit("answerRejected", { message: "Time is up!" });
      return;
    }

    const alreadyAnswered = session.answers[idx].some(a => a.participantId === socket.id);
    if (alreadyAnswered) {
      socket.emit("answerRejected", { message: "You have already answered this question." });
      return;
    }

    const rank = session.answers[idx].length + 1;
    const record = {
      participantId: socket.id,
      participantName: socket.data.name,
      answer: String(answer || "").trim().slice(0, 300),
      answeredAt: Date.now(),
      rank
    };

    session.answers[idx].push(record);

    socket.emit("answerAccepted", {
      rank,
      message: rank === 1 ? "🎉 You were first!" : `Answer recorded. Your position: #${rank}`
    });

    // Host sees live first-to-last responses.
    for (const [, s] of io.sockets.sockets) {
      if (s.data.role === "host") {
        s.emit("liveAnswer", { questionIndex: idx, record });
      }
    }
  });

  socket.on("disconnect", () => {
    delete session.participants[socket.id];
    broadcastState();
  });
});

server.listen(PORT, () => {
  console.log(`Independence Quiz 2026 running on http://localhost:${PORT}`);
});
