import os
import json
import time
from flask import Flask, request, jsonify, render_template
from dotenv import load_dotenv
from openai import OpenAI

from cli_extract import fetch_and_extract


load_dotenv()

app = Flask(__name__)

def clean_json_response(raw: str) -> str:
    if not raw:
        return ""
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        raw = "\n".join(lines).strip()
    return raw

def generate_ideas_llm(text, platforms, tone, audience, num_ideas, title, url, brand_voice=""):
    api_key = os.environ.get("LLM_API_KEY")
    base_url = os.environ.get("LLM_BASE_URL")
    model = os.environ.get("LLM_MODEL", "gemini-2.0-flash")

    if not api_key or not base_url:
        return {"error": "LLM_API_KEY and LLM_BASE_URL must be set in .env"}

    client = OpenAI(
        base_url=base_url,
        api_key=api_key
    )

    prompt_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'prompts', 'generate.txt')
    try:
        with open(prompt_path, 'r', encoding='utf-8') as f:
            system_prompt = f.read()
    except Exception as e:
        return {"error": f"Could not read prompt file: {e}"}

    user_message = f"""Title: {title}
Source: {url}
Platforms: {', '.join(platforms)}
Number of ideas: {num_ideas}
Tone: {tone}
Target audience: {audience or "infer from the article"}

<article>
{text}
</article>
"""

    if brand_voice:
        user_message += f"\nCustom brand voice / additional instructions:\n{brand_voice}\n"

    user_message += "\nReturn only JSON."

    def call_llm(messages):
        try:
            start_time = time.time()
            print(f"[LLM] Calling {model} with {len(messages)} messages (streaming)...")
            stream = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.8,
                top_p=1,
                max_tokens=1200,
                stream=True,
                response_format={"type": "json_object"},
                timeout=90
            )
            # Collect streamed chunks
            content_parts = []
            for chunk in stream:
                if chunk.choices[0].delta.content is not None:
                    content_parts.append(chunk.choices[0].delta.content)
            elapsed = time.time() - start_time
            content = "".join(content_parts)
            print(f"[LLM] Got response in {elapsed:.1f}s, content length: {len(content) if content else 'None'}")
            return content if content else None, elapsed, None
        except Exception as e:
            print(f"[LLM] Error: {e}")
            return None, 0, str(e)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message}
    ]

    retries = 1
    for attempt in range(retries + 1):
        content, elapsed, err = call_llm(messages)
        if err:
            err_str = err.lower()
            if "429" in err_str or "500" in err_str or "502" in err_str or "503" in err_str or "504" in err_str:
                if attempt < retries:
                    time.sleep(3)
                    continue
            return {"error": f"Rate limit or provider error, try again shortly. Details: {err}"}

        # Guard: model returned empty/None content
        if not content:
            if attempt < retries:
                time.sleep(2)
                continue
            return {"error": "The model returned an empty response. Please try again."}

        cleaned = clean_json_response(content)
        try:
            parsed = json.loads(cleaned)
            print(f"Model: {model} | Char count: {len(text)} | Time: {elapsed:.2f}s | Retries: {attempt}")
            return parsed
        except json.JSONDecodeError:
            if attempt < retries:
                messages.append({"role": "assistant", "content": content})
                messages.append({"role": "user", "content": "Your previous reply was not valid JSON. Return only valid JSON."})
                continue
            else:
                return {
                    "error": "Failed to parse LLM response as JSON.",
                    "raw_response": content
                }

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/generate", methods=["POST"])
def generate():
    data = request.json
    url = data.get("url", "").strip()
    pasted_text = data.get("text", "").strip()
    platforms = data.get("platforms", [])
    tone = data.get("tone", "punchy")
    audience = data.get("audience", "")
    num_ideas = int(data.get("num_ideas", 3))
    brand_voice = data.get("brand_voice", "").strip()

    title = ""
    text_to_use = pasted_text
    
    if not pasted_text:
        if not url:
            return jsonify({"error": "Please provide a URL or paste the article text."}), 400
            
        extraction = fetch_and_extract(url)
        if "error" in extraction:
            return jsonify({"error": extraction["error"]}), 400
            
        title = extraction.get("title", "")
        text_to_use = extraction.get("text", "")
        
    result = generate_ideas_llm(text_to_use, platforms, tone, audience, num_ideas, title, url, brand_voice)
    if "error" in result:
        return jsonify(result), 500

    result["title"] = title
    result["url"] = url
    
    return jsonify(result)

if __name__ == "__main__":
    app.run(debug=True, port=5000)
