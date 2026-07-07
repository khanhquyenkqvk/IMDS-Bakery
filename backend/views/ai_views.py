
from __future__ import annotations

import requests
from flask import Blueprint, jsonify, request

from config.config import Config
from utils.rag import get_context_for_question

bp_ai = Blueprint('ai', __name__, url_prefix='/api/ai')

_config = Config()
_longcat_api_key = _config.LONGCAT_API_KEY
_longcat_model = _config.LONGCAT_MODEL
_longcat_base_url = _config.LONGCAT_BASE_URL


def _normalize_conversation(payload: list[dict]) -> list[dict]:
    """Keep only valid Gemini role/parts entries and cap context length."""
    normalized: list[dict] = []
    for item in payload[-10:]:  # limit context to keep latency predictable
        role = item.get('role')
        parts = item.get('parts')
        if role not in {'user', 'model'}:
            continue
        if not isinstance(parts, list):
            continue
        safe_parts = []
        for part in parts:
            text = part.get('text') if isinstance(part, dict) else None
            if not text:
                continue
            safe_parts.append({'text': str(text)})
        if safe_parts:
            normalized.append({'role': role, 'parts': safe_parts})
    return normalized


def _extract_latest_user_entry(conversation: list[dict]) -> tuple[int | None, str]:
    for idx in range(len(conversation) - 1, -1, -1):
        item = conversation[idx]
        if item.get('role') != 'user':
            continue
        text = _join_parts(item.get('parts'))
        if text:
            return idx, text
    return None, ''


def _join_parts(parts) -> str:
    texts = []
    for part in parts or []:
        if isinstance(part, dict):
            value = part.get('text')
            if value:
                texts.append(str(value))
    return "\n".join(t.strip() for t in texts if t).strip()


def _to_openai_messages(contents: list[dict]) -> list[dict]:
    messages: list[dict] = []
    for item in contents:
        text = _join_parts(item.get('parts'))
        if not text:
            continue
        role = item.get('role') or 'user'
        if role == 'model':
            role = 'assistant'
        elif role not in {'user', 'assistant', 'system'}:
            role = 'user'
        messages.append({'role': role, 'content': text})
    return messages


def _call_longcat(messages: list[dict]) -> str:
    if not _longcat_api_key:
        raise RuntimeError("Missing LONGCAT_API_KEY. Set it in database.env or environment variables.")
    headers = {
        'Authorization': f'Bearer {_longcat_api_key}',
        'Content-Type': 'application/json',
    }
    payload = {
        'model': _longcat_model,
        'messages': messages,
        'temperature': 0.7,
        'max_tokens': 800,
    }
    response = requests.post(_longcat_base_url, headers=headers, json=payload, timeout=30)
    try:
        data = response.json()
    except ValueError:
        raise RuntimeError('LongCat API returned non-JSON response')
    if not response.ok:
        error_msg = data.get('error', {}).get('message') if isinstance(data, dict) else None
        raise RuntimeError(error_msg or f'LongCat API error ({response.status_code})')
    try:
        content = data['choices'][0]['message']['content']
    except (KeyError, IndexError, TypeError):
        raise RuntimeError('Unable to parse LongCat response payload')
    if isinstance(content, list):
        text = "".join(part.get('text', '') if isinstance(part, dict) else str(part) for part in content)
    else:
        text = str(content)
    return text



@bp_ai.route('/chat', methods=['POST'])
def chat_with_ai():
    """Proxy chat requests to Gemini so the frontend never exposes the API key."""
    try:
        body = request.get_json(silent=True) or {}
        conversation = body.get('conversation')
        if not isinstance(conversation, list):
            return jsonify({'success': False, 'error': 'conversation must be an array'}), 400

        contents = _normalize_conversation(conversation)
        if not contents:
            return jsonify({'success': False, 'error': 'No valid messages found'}), 400

        question_idx, latest_question = _extract_latest_user_entry(contents)
        context_text = get_context_for_question(latest_question)
        if context_text and question_idx is not None:
            contents.insert(
                question_idx,
                {
                    'role': 'user',
                    'parts': [
                        {
                            'text': (
                                "Thông tin tham chiếu nội bộ (proposal / user story / product backlog):\n"
                                f"{context_text}\n\n"
                                "Hãy ưu tiên dùng nội dung này nếu phù hợp."
                            )
                        }
                    ],
                },
            )

        messages = _to_openai_messages(contents)
        reply_text = _call_longcat(messages).strip()
        if not reply_text:
            return jsonify({'success': False, 'error': 'Empty response from LongCat'}), 502

        return jsonify({'success': True, 'reply': reply_text}), 200

    except RuntimeError as rte:
        return jsonify({'success': False, 'error': str(rte)}), 500
    except Exception as exc:  # pragma: no cover - log unexpected issues
        print(f'[AI] chat error: {exc}')
        return jsonify({'success': False, 'error': 'AI assistant temporarily unavailable'}), 500
