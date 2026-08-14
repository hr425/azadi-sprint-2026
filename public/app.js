const socket = io();
const $ = id => document.getElementById(id);
let role=null,timerInterval=null,answerLocked=false,hostAnswers={};
let audioCtx=null,tickTimer=null;
const screens={home:$("homeScreen"),host:$("hostScreen"),participant:$("participantScreen")};
const phasePanels=["waitingPanel","countdownPanel","letsStartPanel","questionPanel","answerPanel","readyPanel","finishPanel"];
function showScreen(name){Object.values(screens).forEach(s=>s.classList.remove("active"));screens[name].classList.add("active");}
function hidePhasePanels(){phasePanels.forEach(id=>$(id).classList.add("hidden"));}
function showParticipantPanel(id){hidePhasePanels();$(id).classList.remove("hidden");}
function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2800);}
function initAudio(){if(!audioCtx){audioCtx=new(window.AudioContext||window.webkitAudioContext)();}if(audioCtx.state==="suspended")audioCtx.resume();}
function tickSound(){if(!audioCtx)return;const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.frequency.value=900;gain.gain.setValueAtTime(.0001,audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.08,audioCtx.currentTime+.005);gain.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.08);osc.connect(gain).connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+.09);}
function startTicking(){initAudio();stopTicking();tickSound();tickTimer=setInterval(tickSound,1000);}
function stopTicking(){if(tickTimer){clearInterval(tickTimer);tickTimer=null;}}
function runPhaseTimer(startedAt,durationMs,elementId,callback){clearInterval(timerInterval);const tick=()=>{const remaining=Math.max(0,durationMs-(Date.now()-startedAt));$(elementId).textContent=Math.ceil(remaining/1000);if(remaining<=0){clearInterval(timerInterval);if(callback)callback();}};tick();timerInterval=setInterval(tick,100);}

$("hostLoginBtn").onclick=()=>socket.emit("hostLogin",{name:$("hostName").value});
$("participantLoginBtn").onclick=()=>{const name=$("participantName").value.trim();if(!name)return toast("Please enter your name.");socket.emit("participantLogin",{name});};
$("startBtn").onclick=()=>{initAudio();socket.emit("startSession");};
$("resetBtn").onclick=()=>{if(confirm("Reset the quiz and clear all answers?"))socket.emit("resetQuiz");};
$("hostLogoutBtn").onclick=()=>location.reload();$("participantLogoutBtn").onclick=()=>location.reload();
$("submitBtn").onclick=submitAnswer;$("answerInput").addEventListener("keydown",e=>{if(e.key==="Enter")submitAnswer();});
function submitAnswer(){if(answerLocked)return;const input=$("answerInput"),answer=input.value.trim();if(!answer)return toast("Type an answer first.");answerLocked=true;$("submitBtn").disabled=true;$("submitBtn").classList.add("submitted");socket.emit("submitAnswer",{answer});}

socket.on("loginError",d=>toast(d.message));
socket.on("hostLoggedIn",d=>{role="host";$("hostWelcome").textContent=`Logged in as ${d.name}`;showScreen("host");});
socket.on("participantLoggedIn",d=>{role="participant";$("participantWelcome").textContent=`Welcome, ${d.name}`;showScreen("participant");});
socket.on("state",state=>{if(role==="host"){$("hostStatus").textContent=state.status==="finished"?"Quiz finished — results ready":state.status==="countdown"?"Starting soon…":state.status==="running"?`Question ${state.questionIndex+1} is live`:"Waiting to start";$("hostPhaseText").textContent=state.phase==="countdown"?"Countdown is running…":state.phase==="letsStart"?"Let's Start!":state.phase==="answer"?"Showing the answer…":state.phase==="ready"?"Get ready for the next question…":state.phase==="question"?"Participants are answering now.":"Start the quiz when everyone has joined.";$("startBtn").disabled=state.status!=="waiting";$("startBtn").classList.toggle("started",state.status!=="waiting");}if(role==="participant"&&state.status==="waiting")showParticipantPanel("waitingPanel");});

socket.on("phase",q=>{if(role!=="participant")return;
  if(q.phase==="countdown"){showParticipantPanel("countdownPanel");startTicking();runPhaseTimer(q.startedAt,q.durationMs,"countdownNumber",null);}
  else if(q.phase==="letsStart"){showParticipantPanel("letsStartPanel");stopTicking();setTimeout(()=>startTicking(),100);}
  else if(q.phase==="question"){showParticipantPanel("questionPanel");startTicking();$("questionNumber").textContent=`QUESTION ${q.questionIndex+1} / ${q.total}`;$("questionText").textContent=q.text;$("questionHint").textContent=q.hint?`Hint: ${q.hint}`:"";$("answerInput").value="";$("answerInput").disabled=false;$("submitBtn").disabled=false;$("submitBtn").classList.remove("submitted");$("answerMessage").textContent="";answerLocked=false;runPhaseTimer(q.startedAt,q.durationMs,"timer",()=>{answerLocked=true;$("answerInput").disabled=true;$("submitBtn").disabled=true;$("answerMessage").textContent="Time's up!";});setTimeout(()=>$("answerInput").focus(),50);}
  else if(q.phase==="answer"){stopTicking();showParticipantPanel("answerPanel");$("answerText").textContent=q.answer;runPhaseTimer(q.startedAt,q.durationMs,"answerProgress",null);}
  else if(q.phase==="ready"){showParticipantPanel("readyPanel");runPhaseTimer(q.startedAt,q.durationMs,"readyProgress",null);}
  else if(q.phase==="finished"){stopTicking();clearInterval(timerInterval);showParticipantPanel("finishPanel");}
});
socket.on("answerAccepted",d=>$("answerMessage").textContent=d.message);socket.on("answerRejected",d=>{answerLocked=true;$("answerMessage").textContent=d.message;});
socket.on("liveAnswer",d=>{if(role!=="host")return;const idx=d.questionIndex;hostAnswers[idx] ||= [];hostAnswers[idx].push(d.record);renderLiveAnswers(idx);});
function renderLiveAnswers(idx){$("hostQuestionLabel").textContent=`Question ${idx+1} — First to last`;const records=hostAnswers[idx]||[],list=$("liveAnswers");list.classList.remove("empty");list.innerHTML=records.length?records.map(r=>`<div class="answer-item"><div class="rank">#${r.rank}</div><div><div class="answer-name">${escapeHtml(r.participantName)}</div><div class="answer-text">${escapeHtml(r.answer)}</div></div><div class="answer-time">${new Date(r.answeredAt).toLocaleTimeString()}</div></div>`).join(""):"No answers yet.";}
socket.on("quizFinished",()=>{stopTicking();if(role==="participant")showParticipantPanel("finishPanel");if(role==="host")$("hostStatus").textContent="Quiz finished — results ready";});
socket.on("quizReset",()=>{stopTicking();hostAnswers={};$("resultsPanel").classList.add("hidden");$("liveAnswers").className="answer-list empty";$("liveAnswers").textContent="Quiz reset. Start a new session when ready.";$("hostQuestionLabel").textContent="Question —";if(role==="host"){$("hostStatus").textContent="Waiting to start";$("hostPhaseText").textContent="Start the quiz when everyone has joined.";$("startBtn").disabled=false;$("startBtn").classList.remove("started");}if(role==="participant")showParticipantPanel("waitingPanel");});
socket.on("results",data=>{if(role!=="host")return;$("resultsPanel").classList.remove("hidden");$("finalResults").innerHTML=data.questions.map((q,i)=>{const records=data.answers[i]||[];return `<div class="question-result"><h3>Q${i+1}. ${escapeHtml(q.text)}</h3><p><b>Reference answer:</b> ${escapeHtml(q.answer)}</p><table class="results-table"><thead><tr><th>Rank</th><th>Participant</th><th>Answer</th><th>Time</th></tr></thead><tbody>${records.length?records.map(r=>`<tr><td>#${r.rank}</td><td>${escapeHtml(r.participantName)}</td><td>${escapeHtml(r.answer)}</td><td>${new Date(r.answeredAt).toLocaleTimeString()}</td></tr>`).join(""):`<tr><td colspan="4">No answers.</td></tr>`}</tbody></table></div>`;}).join("");});
$("printBtn").onclick=()=>window.print();
function escapeHtml(str){return String(str).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
