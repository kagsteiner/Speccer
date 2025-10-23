const emailInput = document.getElementById('myEmail');
const saveEmailBtn = document.getElementById('saveEmail');
const emailStatus = document.getElementById('emailStatus');
const answerForm = document.getElementById('answerForm');
const answerBox = document.getElementById('answer');
const submitMsg = document.getElementById('submitMsg');
const collaboratorsDiv = document.getElementById('collaborators');
const statusBadge = document.getElementById('status');
const questionDiv = document.getElementById('question');
const documentDiv = document.getElementById('document');
const docVersionSpan = document.getElementById('docVersion');
const startOverBtn = document.getElementById('startOverBtn');

function getMyEmail() { return localStorage.getItem('speccer_email') || ''; }
function setMyEmail(v) { localStorage.setItem('speccer_email', v); }

emailInput.value = getMyEmail();
saveEmailBtn.addEventListener('click', () => {
  const v = emailInput.value.trim();
  if (v) { setMyEmail(v); emailStatus.textContent = 'Saved.'; setTimeout(()=>emailStatus.textContent='',1500); }
});

async function fetchState() {
  const me = getMyEmail();
  const res = await fetch('/api/state');
  if (!res.ok) return;
  const data = await res.json();
  // Document
  documentDiv.textContent = data.document || '(no document yet)';
  docVersionSpan.textContent = data.version;
  statusBadge.textContent = data.status;
  // Task
  if (data.currentTask) {
    questionDiv.textContent = data.currentTask.question;
  } else {
    questionDiv.textContent = 'No active task.';
  }
  // Collaborators listing
  collaboratorsDiv.innerHTML = '';
  data.collaborators.forEach(c => {
    const answered = data.answers && data.currentTask && data.answers[data.currentTask.id] && data.answers[data.currentTask.id][c.email];
    const div = document.createElement('div');
    div.textContent = c.email + (answered ? ' ✔' : ' …');
    collaboratorsDiv.appendChild(div);
  });
  // Form state
  if (!me || !data.currentTask) {
    answerBox.disabled = true;
  } else {
    const answered = data.answers && data.answers[data.currentTask.id] && data.answers[data.currentTask.id][me];
    answerBox.disabled = !!answered || data.status !== 'HUMAN_INPUT';
    answerForm.querySelector('button').disabled = answerBox.disabled;
    if (answered) {
      answerBox.value = answered.answer;
      submitMsg.textContent = 'You have submitted an answer.';
    } else if (data.status !== 'HUMAN_INPUT') {
      submitMsg.textContent = 'Waiting for LLM...';
    } else {
      submitMsg.textContent = '';
      if (!answerBox.value) answerBox.value = '';
    }
  }
}

answerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const me = getMyEmail();
  if (!me) { alert('Set your email first.'); return; }
  const answer = answerBox.value.trim();
  if (!answer) return;
  submitMsg.textContent = 'Submitting...';
  const res = await fetch('/api/answer', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: me, answer })});
  if (res.ok) {
    const js = await res.json();
    if (js.ok) {
      submitMsg.textContent = 'Submitted.';
      fetchState();
    } else submitMsg.textContent = js.error || 'Error';
  } else {
    submitMsg.textContent = 'Error submitting.';
  }
});

setInterval(fetchState, 4000);
fetchState();

startOverBtn.addEventListener('click', async () => {
  if (!confirm('Start over? This will delete the current state and all versioned documents.')) return;
  startOverBtn.disabled = true;
  try {
    const res = await fetch('/api/reset', { method: 'POST' });
    if (res.ok) {
      window.location.href = '/';
    } else {
      alert('Reset failed.');
    }
  } catch (e) {
    alert('Reset error.');
  } finally {
    startOverBtn.disabled = false;
  }
});
