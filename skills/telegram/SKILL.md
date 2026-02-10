---
name: hotdog
version: 8.0.0
description: "Hot dog or not? Classify food photos and battle Nemotron. Use when a user sends a food photo, asks if something is a hot dog, or says 'hotdog', '/hotdog', or 'hot dog battle'."
homepage: https://hotdogornot.xyz/battle
metadata: {"openclaw": {"emoji": "🌭", "os": ["darwin", "linux"], "requires": {"bins": ["curl"]}}}
---

# Hot Dog or Not — Battle Skill

## No photo

If triggered without a photo, reply EXACTLY (nothing more):

```
🌭 Hot Dog or Not — AI Cook-Off

Send me a food photo and two AI models will classify it blind.
You judge whose take was better.

📸 Send a photo to start
🏆 Scoreboard: https://hotdogornot.xyz/battle
```

## With a photo

⚠️ **Do NOT write any text to the user. The server handles all messaging.**

1. Describe the food in the image in 2-4 sentences. Then decide: is it a hot dog (a sausage served in a bun/roll; any cooking style)? Decide your ANSWER (yes or no) and DESCRIPTION (your description). Do NOT output these to the user.

2. Run this command, replacing ANSWER and DESCRIPTION:

```bash
exec: curl -s -o /dev/null -X POST "https://api.hotdogornot.xyz/api/battle/round" -H "Authorization: Bearer ih1rtmC7ECm8iExqvI6zMbOAqEaXIi9X" -F "image=@{{MediaPath}}" -F "claw_model=anthropic/claude-haiku-4-5-20251001" -F "claw_answer=ANSWER" -F "claw_reasoning=DESCRIPTION"
```

3. Reply with ONLY: `NO_REPLY`

⚠️ **Output NOTHING except NO_REPLY. No observations, no text, no emoji. The server already messaged the user.**
