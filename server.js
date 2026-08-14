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
  { text: "Who was the first Indian to hoist the national flag at the Red Fort after India became independent?", answer: "Jawaharlal Nehru" },
  { text: "Who gave the famous slogan, “Swaraj is my birthright, and I shall have it”?", answer: "Bal Gangadhar Tilak" },
  { text: "Identify the place.", hint: "This place is in Punjab and became a powerful symbol of the freedom struggle after a tragic event in 1919.", image: "/Q3%20Puzzel%20Image.png", answer: "Jallianwala Bagh" },
  { text: "Which freedom movement began after Mahatma Gandhi gave the call of “Do or Die” in 1942?", answer: "Quit India Movement" },
  { text: "Where did Bhagat Singh and Batukeshwar Dutt throw bombs on 8 April 1929?", answer: "Central Legislative Assembly, New Delhi" },
  { text: "Identify this place.", hint: "This historic monument in the heart of Delhi has witnessed the hoisting of the Indian national flag on Independence Day since 1947.", image: "/Q6%20Red%20Fort%20puzzle%20image.png", answer: "Red Fort" },
  { text: "Who was the first Indian woman president of the Indian National Congress?", answer: "Sarojini Naidu" },
  { text: "Who is the freedom fighter shown in these historic photographs?", hint: "His journey took him from Calcutta to Germany and later to Southeast Asia, where he played a major role in India's struggle for independence.", image: "/Q8%20Netaji%20image(s).jpg", answer: "Subhas Chandra Bose" },
  { text: "What historic movement is captured in these photographs?", hint: "It began in Gujarat and covered roughly 390 km on foot, challenging a British law that affected something found abundantly along India's coastline.", image: "/Q9%20Dandi%20March%20collage.png", answer: "Dandi March / Salt March" },
  { text: "At the stroke of midnight on 15 August 1947, Jawaharlal Nehru delivered a historic speech. What was the name of that speech?", answer: "Tryst with Destiny" }
];

let timers = [];
let session = createFreshSession();
function createFreshSession() { return { status:"waiting", phase:"waiting", questionIndex:-1, phaseStartedAt:null, phaseDurationMs:null, participants:{}, answers:Array.from({length:QUESTIONS.length},()=>[]), host:null }; }
function clearTimers(){ timers.forEach(clearTimeout); timers=[]; }
function publicState(){ return {status:session.status,phase:session.phase,questionIndex:session.questionIndex,phaseStartedAt:session.phaseStartedAt,phaseDurationMs:session.phaseDurationMs,questionCount:QUESTIONS.length,participants:Object.values(session.participants).map(p=>({id:p.id,name:p.name,joinedAt:p.joinedAt}))}; }
function broadcastState(){ io.emit("state",publicState()); }
function emitPhase(){ const q=session.questionIndex>=0?QUESTIONS[session.questionIndex]:null; io.emit("phase",{phase:session.phase,questionIndex:session.questionIndex,total:QUESTIONS.length,text:q?.text||"",hint:q?.hint||"",image:q?.image||"",answer:q?.answer||"",startedAt:session.phaseStartedAt,durationMs:session.phaseDurationMs}); }

function startCountdown(){
  session.status="countdown"; session.phase="countdown"; session.questionIndex=-1; session.phaseStartedAt=Date.now(); session.phaseDurationMs=10000; broadcastState(); emitPhase();
  timers.push(setTimeout(()=>{
    if(session.status!=="countdown")return;
    session.phase="letsStart"; session.phaseStartedAt=Date.now(); session.phaseDurationMs=1500; broadcastState(); emitPhase();
    timers.push(setTimeout(()=>{ if(session.status!=="countdown")return; session.status="running"; session.questionIndex=0; startQuestion(); },1500));
  },10000));
}
function startQuestion(){
  session.phase="question"; session.phaseStartedAt=Date.now(); session.phaseDurationMs=20000; broadcastState(); emitPhase();
  timers.push(setTimeout(()=>{if(session.status!=="running"||session.phase!=="question")return;startAnswerPhase();},20000));
}
function startAnswerPhase(){
  session.phase="answer"; session.phaseStartedAt=Date.now(); session.phaseDurationMs=5000; broadcastState(); emitPhase();
  timers.push(setTimeout(()=>{if(session.status!=="running"||session.phase!=="answer")return;if(session.questionIndex<QUESTIONS.length-1)startReadyPhase();else finishQuiz();},5000));
}
function startReadyPhase(){
  session.phase="ready"; session.phaseStartedAt=Date.now(); session.phaseDurationMs=10000; broadcastState(); emitPhase();
  timers.push(setTimeout(()=>{if(session.status!=="running"||session.phase!=="ready")return;session.questionIndex++;startQuestion();},10000));
}
function finishQuiz(){session.status="finished";session.phase="finished";session.phaseStartedAt=null;session.phaseDurationMs=null;broadcastState();io.emit("quizFinished",{message:"Jai Hind! Thank you for playing."});sendResultsToHosts();}
function sendCurrentPhase(socket){socket.emit("state",publicState());const q=session.questionIndex>=0?QUESTIONS[session.questionIndex]:null;socket.emit("phase",{phase:session.phase,questionIndex:session.questionIndex,total:QUESTIONS.length,text:q?.text||"",hint:q?.hint||"",image:q?.image||"",answer:q?.answer||"",startedAt:session.phaseStartedAt,durationMs:session.phaseDurationMs});}
function sendResultsToHosts(){for(const [,socket] of io.sockets.sockets){if(socket.data.role==="host")socket.emit("results",{questions:QUESTIONS,answers:session.answers,participants:Object.values(session.participants).map(p=>({id:p.id,name:p.name,joinedAt:p.joinedAt}))});}}

app.use(express.static(path.join(__dirname,"public")));
io.on("connection",socket=>{
  sendCurrentPhase(socket);
  socket.on("hostLogin",({name})=>{const clean=String(name||"").trim();if(!HOSTS.has(clean)){socket.emit("loginError",{message:"You are a participant, kindly log in through Participants Login."});return;}socket.data.role="host";socket.data.name=clean;session.host=clean;socket.emit("hostLoggedIn",{name:clean});sendCurrentPhase(socket);broadcastState();if(session.status==="finished")sendResultsToHosts();});
  socket.on("participantLogin",({name})=>{const clean=String(name||"").trim().replace(/\s+/g," ");if(!clean||clean.length<2||clean.length>40){socket.emit("loginError",{message:"Please enter a valid participant name."});return;}socket.data.role="participant";socket.data.name=clean;session.participants[socket.id]={id:socket.id,name:clean,joinedAt:Date.now()};socket.emit("participantLoggedIn",{name:clean});sendCurrentPhase(socket);broadcastState();});
  socket.on("startSession",()=>{if(socket.data.role!=="host"||session.status!=="waiting")return;clearTimers();session.answers=Array.from({length:QUESTIONS.length},()=>[]);startCountdown();});
  socket.on("resetQuiz",()=>{if(socket.data.role!=="host")return;clearTimers();session=createFreshSession();io.emit("quizReset");broadcastState();});
  socket.on("submitAnswer",({answer})=>{if(socket.data.role!=="participant"||session.status!=="running"||session.phase!=="question")return;const idx=session.questionIndex;if(idx<0||idx>=QUESTIONS.length)return;const elapsed=Date.now()-session.phaseStartedAt;if(elapsed>20000){socket.emit("answerRejected",{message:"Time is up!"});return;}if(session.answers[idx].some(a=>a.participantId===socket.id)){socket.emit("answerRejected",{message:"You have already answered this question."});return;}const rank=session.answers[idx].length+1;const record={participantId:socket.id,participantName:socket.data.name,answer:String(answer||"").trim().slice(0,300),answeredAt:Date.now(),responseMs:elapsed,rank};session.answers[idx].push(record);socket.emit("answerAccepted",{message:"Answer recorded."});for(const [,s] of io.sockets.sockets){if(s.data.role==="host")s.emit("liveAnswer",{questionIndex:idx,record});}});
  socket.on("disconnect",()=>{delete session.participants[socket.id];broadcastState();});
});
server.listen(PORT,()=>console.log(`Independence Quiz 2026 running on http://localhost:${PORT}`));
