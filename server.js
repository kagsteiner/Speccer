require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const { generateQuestion, updateDocument } = require('./llm');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({limit:'1mb'}));
app.use('/static', express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const DOC_DIR = path.join(DATA_DIR, 'documents');
fs.mkdirSync(DOC_DIR, { recursive: true });

const STATE_FILE = path.join(DATA_DIR, 'state.json');

function loadState() {
	if (!fs.existsSync(STATE_FILE)) return null;
	try {
		const st = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
		if (!Array.isArray(st.taskHistory)) st.taskHistory = [];
		return st;
	} catch { return null; }
}

function saveState(state) {
	fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function readDocument(version) {
	const f = path.join(DOC_DIR, `document_${version}.md`);
	if (!fs.existsSync(f)) return '';
	return fs.readFileSync(f, 'utf8');
}

function writeDocument(version, content) {
	const f = path.join(DOC_DIR, `document_${version}.md`);
	fs.writeFileSync(f, content, 'utf8');
}

function initNewSession({ description, emails }) {
	const state = {
		appDescription: description,
		collaborators: emails.map(e => ({ email: e, answeredCurrent: false })),
		status: 'LLM_QUESTION', // transitional; will move to HUMAN_INPUT after question created
		version: 1,
		currentTask: null,
		answers: {},
		taskHistory: []
	};
	writeDocument(1, ''); // empty initial document
	saveState(state);
	return state;
}

async function createNextQuestion(state) {
	state.status = 'LLM_QUESTION';
	saveState(state);
	const currentDoc = readDocument(state.version);
	const q = await generateQuestion({ appDescription: state.appDescription, currentDocument: currentDoc });
	const taskId = uuid();
	state.currentTask = { id: taskId, question: q, createdAt: new Date().toISOString() };
	state.collaborators.forEach(c => c.answeredCurrent = false);
	state.status = 'HUMAN_INPUT';
	saveState(state);
}

async function consolidateAndAdvance(state) {
	state.status = 'LLM_UPDATE';
	saveState(state);
	const currentDoc = readDocument(state.version);
	const taskAnswers = state.answers[state.currentTask.id] || {};
	const newDoc = await updateDocument({ appDescription: state.appDescription, currentDocument: currentDoc, humanAnswers: taskAnswers });
	state.version += 1;
	writeDocument(state.version, newDoc);
	// Archive the completed task & its answers
	state.taskHistory.push({
		id: state.currentTask.id,
		question: state.currentTask.question,
		createdAt: state.currentTask.createdAt,
		completedAt: new Date().toISOString(),
		answers: taskAnswers
	});
	// Clean up answers for the archived task to prevent growth & confusion
	delete state.answers[state.currentTask.id];
	saveState(state);
	await createNextQuestion(state); // moves status back to HUMAN_INPUT
}

// Routes
app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/collaborate.html', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'collaborate.html'));
});

app.post('/start', async (req, res) => {
	try {
		const { description, emails } = req.body || {};
		if (!description || !Array.isArray(emails) || emails.length === 0) {
			return res.status(400).json({ ok: false, error: 'Missing description or emails.' });
		}
		const cleaned = emails.map(e => String(e).trim().toLowerCase()).filter(Boolean);
		let state = initNewSession({ description, emails: cleaned });
		// fire and forget question generation
		createNextQuestion(state).catch(err => console.error('Question generation failed:', err));
		res.json({ ok: true });
	} catch (e) {
		console.error(e);
		res.status(500).json({ ok: false, error: 'Internal error.' });
	}
});

app.get('/api/state', (req, res) => {
	const state = loadState();
	if (!state) return res.json({ status: 'NO_SESSION' });
	const doc = readDocument(state.version);
	res.json({
		status: state.status,
		version: state.version,
		currentTask: state.currentTask,
		collaborators: state.collaborators,
		answers: state.answers,
		taskHistory: state.taskHistory,
		document: doc
	});
});

app.post('/api/answer', (req, res) => {
	const { email, answer } = req.body || {};
	if (!email || !answer) return res.status(400).json({ ok: false, error: 'Missing email or answer.' });
	const state = loadState();
	if (!state) return res.status(400).json({ ok: false, error: 'No active session.' });
	if (state.status !== 'HUMAN_INPUT') return res.status(409).json({ ok: false, error: 'Not accepting answers right now.' });
	const collab = state.collaborators.find(c => c.email === email.toLowerCase());
	if (!collab) return res.status(403).json({ ok: false, error: 'Email not registered.' });
	if (!state.currentTask) return res.status(400).json({ ok: false, error: 'No current task.' });
	state.answers[state.currentTask.id] = state.answers[state.currentTask.id] || {};
	if (state.answers[state.currentTask.id][collab.email]) {
		return res.json({ ok: true, duplicate: true });
	}
	state.answers[state.currentTask.id][collab.email] = { answer, submittedAt: new Date().toISOString() };
	collab.answeredCurrent = true;
	saveState(state);
	// Check if all answered
	const taskAnswers = state.answers[state.currentTask.id];
	const allAnswered = state.collaborators.every(c => taskAnswers[c.email]);
	if (allAnswered) {
		// async consolidate
		consolidateAndAdvance(state).catch(err => console.error('Consolidation failed:', err));
	}
	res.json({ ok: true });
});

	app.post('/api/reset', (req, res) => {
		try {
			// Delete state file
			if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
			// Delete documents
			if (fs.existsSync(DOC_DIR)) {
				for (const f of fs.readdirSync(DOC_DIR)) {
					if (f.startsWith('document_') && f.endsWith('.md')) {
						fs.unlinkSync(path.join(DOC_DIR, f));
					}
				}
			}
			return res.json({ ok: true });
		} catch (e) {
			console.error('Reset failed:', e);
			return res.status(500).json({ ok: false, error: 'Reset failed.' });
		}
	});

app.listen(PORT, () => {
	console.log(`Speccer server listening on http://localhost:${PORT}`);
});

