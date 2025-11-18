import mongoose from "mongoose";

const DocumentSchema = new mongoose.Schema({
  originalText: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }, // note: Date.now, not Date.now()
});

export default mongoose.model("Document", DocumentSchema);
