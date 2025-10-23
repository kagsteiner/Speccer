# Speccer

Simple collaborative specification assistant combining an LLM with multiple human collaborators to iteratively build a Markdown software specification.

## How It Works
1. Start page: provide an app description and comma separated collaborator emails.
2. The server asks the LLM for the first clarifying question (state => HUMAN_INPUT).
3. Each collaborator submits an answer. When all have answered the current question the server:
   - Consolidates answers + current doc via LLM producing new versioned document file.
   - Stores `document_<n>.md` (increment version counter).
   - Generates the next question.
4. Process repeats until you choose to stop (CTRL+C server, or just ignore more questions).

## Data Storage
All data is stored locally in `data/` as JSON + versioned Markdown files:
* `data/state.json` – session state & answers.
* `data/documents/document_<version>.md` – versioned specification documents.

## Environment
Optional: set `OPENAI_API_KEY` for real LLM responses (uses OpenAI Chat Completions). Without it a stub heuristic is used.

Model selection: you can set `OPENAI_MODEL` (defaults to `gpt-5`). Examples: `gpt-4o-mini`, `gpt-4o`, `gpt-4.1`.

```
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-5  # or gpt-4o-mini, gpt-4o, gpt-4.1
npm install
npm start
```

Visit: http://localhost:3000/

## Endpoints (Internal)
* `POST /start` – { description, emails[] }
* `GET /api/state` – current state snapshot
* `POST /api/answer` – { email, answer }
* `POST /api/reset` – deletes state & all versioned documents (triggered by Start Over button)

## Notes / Next Ideas
* Provide a manual "finish" action distinct from destructive reset.
* Add simple auth tokens.
* Support multiple parallel sessions.
* Add markdown rendering (client side) instead of plain text.

Keep it simple per initial requirements.
