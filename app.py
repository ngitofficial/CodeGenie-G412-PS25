from flask import Flask, request, jsonify
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

app = Flask(_name_)

MODEL_NAME = "deepseek-ai/deepseek-coder-1.3b-instruct"

print("⏳ Loading DeepSeek-Coder 1.3B Instruct...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModelForCausalLM.from_pretrained(MODEL_NAME, torch_dtype=torch.float32)
model.eval()
print("✅ Model loaded successfully.")

def extract_response(prompt: str, output: str) -> str:
    return output[len(prompt):].strip()

@app.route('/generate', methods=['POST'])
def generate_code():
    try:
        data = request.get_json()
        prompt = data.get("prompt", "")
        max_new_tokens = int(data.get("max_new_tokens", 500))

        if not prompt.strip():
            return jsonify({"error": "Prompt is required."}), 400

        print(f"[⚡] Generating for prompt (length {len(prompt)} chars)...")

        inputs = tokenizer(prompt, return_tensors="pt")

        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                temperature=0.7,
                top_p=0.95,
                do_sample=True,
                pad_token_id=tokenizer.eos_token_id
            )

        decoded_output = tokenizer.decode(outputs[0], skip_special_tokens=True)
        cleaned = extract_response(prompt, decoded_output)

        return jsonify({ "completion": cleaned })

    except Exception as e:
        print("❌ Error:", str(e))
        return jsonify({"error": str(e)}), 500

if _name_ == '_main_':
    app.run(debug=True,host='0.0.0.0', port=8000)
