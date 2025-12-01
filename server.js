require("dotenv").config();
const express = require("express");
const session = require("express-session");
const OpenAI = require("openai");

const app = express();
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "chat-secret",
    resave: false,
    saveUninitialized: true,
  }),
);

app.set("view engine", "ejs");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  if (!req.session.history) req.session.history = [];
  res.render("chat", { history: req.session.history });
});

app.post("/send", async (req, res) => {
  const userMessage = req.body.message;
  req.session.history.push({ role: "user", content: userMessage });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: req.session.history,
    });

    const botReply = completion.choices[0].message.content;
    req.session.history.push({ role: "assistant", content: botReply });
  } catch (err) {
    req.session.history.push({
      role: "assistant",
      content: "Error! Check your API key or quota.",
    });
  }

  res.redirect("/");
});

// مسح الشات
app.post("/clear", (req, res) => {
  req.session.history = [];
  res.redirect("/");
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
