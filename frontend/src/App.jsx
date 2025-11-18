import React, { useState } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [file, setFile] = useState(null); // selected PDF file [web:74]
  const [question, setQuestion] = useState(""); // user question [web:74]
  const [answer, setAnswer] = useState(""); // server answer [web:74]
  const [uploading, setUploading] = useState(false); // upload spinner [web:74]
  const [loading, setLoading] = useState(false); // query spinner [web:74]

  const handleFileUpload = async () => {
    if (!file) return alert("Please select a PDF file"); // basic guard [web:74]

    const formData = new FormData();
    formData.append("file", file); // field name must be "file" to match multer.single("file") [web:140]

    setUploading(true);

    try {
      // Let Axios set Content-Type with boundary automatically; do not override
      const res = await axios.post("http://localhost:5000/upload", formData); // multipart/form-data via FormData [web:74]
      alert(res.data.message); // show success from server [web:74]
      setFile(null); // reset file input [web:74]
    } catch (error) {
      console.error("UPLOAD ERROR:", error.response?.data || error.message); // surface server details [web:140]
      alert(`Upload failed: ${error.response?.data?.details || error.message}`); // friendlier error [web:140]
    } finally {
      setUploading(false); // stop spinner [web:74]
    }
  };

  const handleAsk = async () => {
    if (!question.trim()) return alert("Please enter a question"); // guard [web:74]

    setLoading(true);
    setAnswer("");

    try {
      // Your backend defines POST /query, not /ask
      const res = await axios.post("http://localhost:5000/query", { question }); // correct route [web:140]
      // Backend returns { question, bestChunk, score }
      const { bestChunk, score } = res.data || {}; // extract response fields [web:140]
      setAnswer(bestChunk ? `${bestChunk}\n\n(score: ${score})` : "No answer found."); // display match [web:140]
    } catch (error) {
      console.error("QUERY ERROR:", error.response?.data || error.message); // log details [web:140]
      alert(`Failed to get answer: ${error.response?.data?.error || error.message}`); // user hint [web:140]
    } finally {
      setLoading(false); // stop spinner [web:74]
    }
  };

  return (
    <div className="app-wrapper">
      <div className="card">
        <h1 className="card-title">📄 PDF RAG Chatbot</h1>

        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="input-file"
        />

        <button
          onClick={handleFileUpload}
          disabled={uploading || !file}
          className="btn btn-blue"
          style={{ marginTop: "12px" }}
        >
          {uploading ? "Uploading..." : "Upload PDF"}
        </button>

        <textarea
          rows="3"
          placeholder="Ask a question from your PDF..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="textarea"
          style={{ marginTop: "16px" }}
        />

        <button
          onClick={handleAsk}
          disabled={loading || !question.trim()}
          className="btn btn-green"
          style={{ marginTop: "10px" }}
        >
          {loading ? "Thinking..." : "Ask"}
        </button>

        {answer && (
          <div className="answer-box">
            <h3 className="answer-title">Answer</h3>
            <p className="answer-text" style={{ whiteSpace: "pre-wrap" }}>{answer}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
