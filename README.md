# llmao

A terminal chat client for a local model served through LM Studio's OpenAI-compatible chat-completions endpoint. It stores conversation turns in a local MongoDB collection and reloads them on the next launch. The code is a single Node.js file (`chat.js`), not a tool-using agent.

## How it works

1. Connect to `mongodb://localhost:27017`, database `chatdb`, collection `chats`.
2. Ask for a name, derive a conversation ID from it, and load prior messages sorted by timestamp.
3. POST to `http://localhost:1234/v1/chat/completions` with a system message, up to ten recent history messages, and the current input. Requests use `temperature: 0.7`, `max_tokens: 1000`, and non-streaming responses.
4. Save user and assistant turns to MongoDB. Render replies with terminal colors and bordered Markdown code blocks.

`history`/`load` reload the saved conversation; `new`/`reset` start a new in-memory conversation ID; `quit`/`exit` close the session. The system prompt also extracts simple name-related lines from previous user messages. Memory is full-message storage and a ten-message context window, not semantic search.

## Run locally

You need Node.js, a running local MongoDB server, and LM Studio serving a compatible chat model on port 1234. The script labels the model "Llama 3.3-70B", but it does not select or verify a model ID in its API request: load the model you intend to use in LM Studio first.

```bash
npm install mongodb
node chat.js
```

There is no `package.json`, lockfile, automated test suite, or configuration layer in this repo. The server addresses are hard-coded in `chat.js`. Note that the current turn is appended to history before the request and also appended separately to the outgoing `messages`, so it is sent twice. This is a known implementation limitation, not an intentional prompting technique.
