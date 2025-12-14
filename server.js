require("dotenv").config();
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const pdfParse = require("pdf-parse");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ storage: multer.memoryStorage() });

global.vectorStore = [];

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret",
    resave: false,
    saveUninitialized: true,
  }),
);

app.use((req, res, next) => {
  if (!req.session.chatHistory) req.session.chatHistory = [];
  next();
});

function chunkText(text, chunkSize = 1000, overlap = 100) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

app.get("/", (req, res) => {
  res.render("chat", {
    messages: req.session.chatHistory,
    isFileUploaded: global.vectorStore.length > 0,
    error: null,
  });
});

app.post("/upload", upload.single("document"), async (req, res) => {
  try {
    if (!req.file) throw new Error("Please select a file first.");

    let text = "";

    if (req.file.mimetype === "application/pdf") {
      const data = await pdfParse(req.file.buffer);
      text = data.text;
    } else {
      text = req.file.buffer.toString("utf-8");
    }

    if (!text.trim()) throw new Error("File is empty.");

    const chunks = chunkText(text);

    global.vectorStore = chunks.map((c) => ({ content: c }));

    req.session.chatHistory.push({
      role: "system",
      content: `I have read your file (${req.file.originalname}). Ask me anything about it.`,
    });

    res.redirect("/");
  } catch (error) {
    console.error("Upload Error:", error);
    res.render("chat", {
      messages: req.session.chatHistory,
      isFileUploaded: false,
      error: "Error processing file: " + error.message,
    });
  }
});

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim() === "") return res.redirect("/");

    req.session.chatHistory.push({ role: "user", content: message.trim() });

    let context = "";
    if (global.vectorStore.length > 0) {
      const topChunks = global.vectorStore.slice(0, 3);
      context = topChunks.map((c) => c.content).join("\n\n---\n\n");
    }

    const n8nResponse = await fetch(process.env.N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: context,
        message: message,
        chatHistory: req.session.chatHistory,
      }),
    });

    if (!n8nResponse.ok) throw new Error(`n8n Status: ${n8nResponse.status}`);

    const data = await n8nResponse.json();
    const assistantMessage = data.reply || "Sorry, I couldn't get a response.";

    req.session.chatHistory.push({
      role: "assistant",
      content: assistantMessage,
    });

    res.redirect("/");
  } catch (error) {
    console.error("Chat Error:", error);
    res.render("chat", {
      messages: req.session.chatHistory,
      isFileUploaded: global.vectorStore.length > 0,
      error: "Error: " + error.message,
    });
  }
});

// Clear chat route
app.post("/clear", (req, res) => {
  req.session.chatHistory = [];
  global.vectorStore = [];
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
