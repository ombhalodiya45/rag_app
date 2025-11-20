import React, { useState } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [file, setFile] = useState(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = async () => {
    if (!file) return alert("Please select a PDF file first.");

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);

    try {
      const res = await axios.post("http://localhost:5000/upload", formData);
      alert(res.data.message || "PDF uploaded successfully.");
      setFile(null);
    } catch (error) {
      console.error("UPLOAD ERROR:", error.response?.data || error.message);
      alert(`Upload failed: ${error.response?.data?.details || error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleAsk = async () => {
    if (!question.trim()) return alert("Please enter a question.");

    setLoading(true);
    setAnswer("");

    try {
      const res = await axios.post("http://localhost:5000/query", { question });
      const { answer: llmAnswer, bestChunks } = res.data || {};

      if (llmAnswer) {
        setAnswer(llmAnswer);
      } else if (bestChunks && bestChunks.length > 0) {
        const top = bestChunks[0];
        setAnswer(`${top.chunk}\n\n(relevance score: ${top.score})`);
      } else {
        setAnswer("No answer could be found in the uploaded PDF.");
      }
    } catch (error) {
      console.error("QUERY ERROR:", error.response?.data || error.message);
      alert(`Failed to get answer: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
      setQuestion(""); // reset input after send
    }
  };

  return (
    <div className="app-root">
      {/* Sidebar (desktop / tablet) */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-icon">📄</div>
          <div>
            <div className="sidebar-title">PDF RAG Chatbot</div>
            <div className="sidebar-subtitle">Ask questions from any PDF</div>
          </div>
        </div>

        <div className="sidebar-section">
          <label className="sidebar-label">1. Upload a PDF file</label>

          <label className="file-drop">
            <span className="file-drop-text">
              {file ? file.name : "Click to choose a PDF"}
            </span>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <button
            onClick={handleFileUpload}
            disabled={uploading || !file}
            className="btn primary-btn"
            type="button"
          >
            {uploading ? "Uploading…" : "Upload & index PDF"}
          </button>

          <p className="sidebar-hint">
            After uploading, type your question on the right. The answer will be
            generated from the PDF content.
          </p>
        </div>
      </aside>

      {/* Chat area */}
      <main className="chat-main">
        <header className="chat-header">
          <h1>Chat with your document</h1>
          <p>
            Ask follow‑up questions, refine answers and explore the PDF like a
            conversation.
          </p>
        </header>

        <section className="chat-window">
          {!answer && !loading && !question && (
            <div className="msg msg-assistant">
              <div className="avatar assistant">AI</div>
              <div className="bubble">
                Welcome! Upload a PDF on the left, then ask a question here to
                get a concise answer based on that document.
              </div>
            </div>
          )}

          {question && (
            <div className="msg msg-user">
              <div className="avatar user">You</div>
              <div className="bubble">{question}</div>
            </div>
          )}

          {loading && (
            <div className="msg msg-assistant">
              <div className="avatar assistant">AI</div>
              <div className="bubble">Thinking about your PDF…</div>
            </div>
          )}

          {answer && (
            <div className="msg msg-assistant">
              <div className="avatar assistant">AI</div>
              <div className="bubble" style={{ whiteSpace: "pre-wrap" }}>
                {answer}
              </div>
            </div>
          )}
        </section>

        {/* Input bar (with mobile upload icon) */}
        <form
          className="chat-input-bar"
          onSubmit={(e) => {
            e.preventDefault();
            if (!loading) handleAsk();
          }}
        >
          {/* mobile-only upload button; CSS hides on desktop */}
          <label className="mobile-upload-btn">
            ↑
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <textarea
            rows={1}
            className="chat-textarea"
            placeholder="Ask a question about the uploaded PDF…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />

          <button
            type="submit"
            className="btn send-btn"
            disabled={loading || !question.trim()}
          >
            {loading ? "Generating…" : "Send"}
          </button>
        </form>
      </main>
    </div>
  );
}

export default App;
