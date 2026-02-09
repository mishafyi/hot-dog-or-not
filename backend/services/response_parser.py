from __future__ import annotations

import re


def parse_observations(raw: str) -> str:
    """Extract the Observations line from LLM response. Falls back to full text."""
    if not raw:
        return ""
    match = re.search(r"^Observations\s*:\s*(.+)$", raw.strip(), re.MULTILINE)
    if match:
        return match.group(1).strip()
    return raw.strip()


def parse_response(raw: str) -> str:
    """Extract 'yes' or 'no' from LLM response. Returns 'error' if unparseable."""
    if not raw:
        return "error"

    text = raw.strip().lower()

    # Check for "Answer: yes/no" line (our prompt's expected format)
    answer_line = re.search(r"^answer\s*:\s*(yes|no)\s*$", text, re.MULTILINE)
    if answer_line:
        return answer_line.group(1)

    # Check last line first (prompt asks for answer on final line)
    last_line = text.rsplit("\n", 1)[-1].strip()
    last_line = re.sub(r'^["\'\s*]+|["\'\s.*]+$', "", last_line)
    if last_line in ("yes", "no"):
        return last_line

    # Remove surrounding quotes/punctuation from full text
    text = re.sub(r'^["\'\s*]+|["\'\s.*]+$', "", text)

    # 1. Exact match
    if text in ("yes", "no"):
        return text

    # 2. Starts with yes/no
    if text.startswith("yes"):
        return "yes"
    if text.startswith("no"):
        return "no"

    # 3. Contains definitive phrases
    if "is a hot dog" in text or "is a hotdog" in text:
        return "yes"
    if "not a hot dog" in text or "not a hotdog" in text:
        return "no"

    # 4. "answer is/should be yes/no" patterns
    answer_match = re.search(
        r"(?:answer|response|result|verdict)\s*(?:is|should be|would be|:)\s*['\"]?(yes|no)['\"]?",
        text,
    )
    if answer_match:
        return answer_match.group(1)

    # 5. Last resort keyword search
    has_yes = "yes" in text
    has_no = "no" in text

    if has_yes and not has_no:
        return "yes"
    if has_no and not has_yes:
        return "no"

    return "error"
