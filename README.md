# Speccer

Simple collaborative specification assistant combining an LLM with multiple human collaborators to iteratively build a Markdown software specification.

## How It Works
1. Start page: provide an app description and comma separated collaborator emails.
2. The server asks the LLM for the first clarifying question (state => HUMAN_INPUT).
3. Each collaborator submits an answer. When all have answered the current question the server:
   - Consolidates answers + current doc via LLM producing new versioned document file.
   - Stores `document_<n>.md` (increment version counter).
   - Generates the next questions.
4. Process repeats until you choose to stop (CTRL+C server, or just ignore more questions).

## Data Storage
All data is stored locally in `data/` as JSON + versioned Markdown files:
* `data/state.json` – session state & answers.
* `data/documents/document_<version>.md` – versioned specification documents.

Once you're happy with your specification, take the latest version from the data storage and put it e.g. in Cursor, telling cursor to read it and build the app from it.

## Environment
Edit .env to add your OPENAI_API_KEY. Without it, this app won't do anything.

Model selection: you can set `OPENAI_MODEL` (defaults to `gpt-5`). Examples: `gpt-4o-mini`, `gpt-4o`, `gpt-4.1`. I strongly recommend gpt-5. You want the best thinking model to get the best specification.

Then do
```
npm init -y
npm install
npm start
```

Visit: http://localhost:3000/

## Endpoints (Internal)
* `POST /start` – { description, emails[] }
* `GET /api/state` – current state snapshot
* `POST /api/answer` – { email, answer }
* `POST /api/reset` – deletes state & all versioned documents (triggered by Start Over button)

## Limitations

This app creates one single spec at a time. Not 3 of your specs. Not specs for several teams. And the app has no user management whatsoever. In the initial screen you provide mail-addresses to identify the authors. Later you can type any of them to be identified as that author. That's it. No checks, no bells, no whistles. I did this for me, happy if you can use it :-)

## Disclaimer
I've "vibe coded" (how I hate the term) this app. I have taken a look at the files, found nothing fishy, and tested it by using it successfully. Use at your own risk.

