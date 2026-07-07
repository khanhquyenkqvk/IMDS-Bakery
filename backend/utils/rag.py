"""Lightweight RAG utilities for enriching Gemini prompts."""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

ROOT_DIR = Path(__file__).resolve().parents[2]
KNOWLEDGE_FILE = ROOT_DIR / "backend" / "knowledge" / "ai.json"

TOP_K = 3


@dataclass
class Chunk:
    source: str
    path: str
    text: str


class KnowledgeBase:
    def __init__(self) -> None:
        self.chunks: List[Chunk] = []
        self.vectorizer: Optional[TfidfVectorizer] = None
        self.matrix = None

    def load(self) -> None:
        if self.chunks:
            return

        entries = _load_knowledge_entries()
        for entry in entries:
            text = _entry_to_text(entry).strip()
            if not text:
                continue
            chunk_id = entry.get("id") or entry.get("source") or "knowledge"
            source_path = str(KNOWLEDGE_FILE.relative_to(ROOT_DIR))
            self.chunks.append(
                Chunk(
                    source=chunk_id,
                    path=source_path,
                    text=text,
                )
            )

        if not self.chunks:
            print("[RAG] No documents loaded; context retrieval disabled.")
            return

        self.vectorizer = TfidfVectorizer(stop_words=None)
        self.matrix = self.vectorizer.fit_transform([c.text for c in self.chunks])
        print(f"[RAG] Loaded {len(self.chunks)} knowledge chunks.")

    def query(self, question: str, limit: int = TOP_K) -> List[Chunk]:
        if not question.strip() or not self.chunks or not self.vectorizer or self.matrix is None:
            return []
        vec = self.vectorizer.transform([question])
        scores = cosine_similarity(vec, self.matrix)[0]
        top_indices = scores.argsort()[::-1][:limit]
        return [self.chunks[i] for i in top_indices if scores[i] > 0]


_KB: Optional[KnowledgeBase] = None
_LOCK = threading.Lock()


def get_context_for_question(question: str, limit: int = TOP_K) -> str:
    kb = _get_kb()
    if not kb:
        return ""
    chunks = kb.query(question, limit=limit)
    if not chunks:
        return ""
    formatted = []
    for chunk in chunks:
        formatted.append(f"[{chunk.source} | {chunk.path}]\n{chunk.text.strip()}")
    return "\n\n".join(formatted)


def _get_kb() -> Optional[KnowledgeBase]:
    global _KB
    if _KB is None:
        with _LOCK:
            if _KB is None:
                kb = KnowledgeBase()
                kb.load()
                _KB = kb
    return _KB


def _load_knowledge_entries() -> List[dict]:
    if not KNOWLEDGE_FILE.exists():
        print(f"[RAG] Knowledge file not found: {KNOWLEDGE_FILE}")
        return []
    try:
        data = json.loads(KNOWLEDGE_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"[RAG] Failed to parse {KNOWLEDGE_FILE}: {exc}")
        return []
    if not isinstance(data, list):
        print(f"[RAG] Knowledge file must contain a list, got {type(data)}")
        return []
    return data


def _entry_to_text(entry: dict) -> str:
    parts = []
    summary = entry.get("summary")
    if summary:
        parts.append(str(summary).strip())
    key_points = entry.get("key_points")
    if isinstance(key_points, list):
        bullets = "\n".join(f"- {str(point).strip()}" for point in key_points if point)
        if bullets:
            parts.append(bullets)
    extra = entry.get("details")
    if extra:
        parts.append(str(extra).strip())
    return "\n".join(parts)
