from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch


print("Loading model...")
tokenizer = AutoTokenizer.from_pretrained("deepseek-ai/deepseek-coder-1.3b-instruct")
model = AutoModelForCausalLM.from_pretrained("deepseek-ai/deepseek-coder-1.3b-instruct")
model.to("cpu")
print("Model loaded.")


app = Flask(__name__)
CORS(app)

@app.route('/generate', methods=['POST'])
def generate_code():
    data = request.json
    prompt = data.get('prompt', '')

    if not prompt.strip():
        return jsonify({"code": "Prompt is empty."}), 400

    
    input_text = f"<|User|> {prompt} <|Assistant|>"
    inputs = tokenizer(input_text, return_tensors="pt").to("cpu")

    
    with torch.no_grad():
     outputs = model.generate(
    **inputs,
    max_new_tokens=1024,  
    temperature=0.7,
    top_p=0.9,
    do_sample=True,
    pad_token_id=tokenizer.eos_token_id,
    eos_token_id=tokenizer.eos_token_id  
)


    
    output_text = tokenizer.batch_decode(outputs, skip_special_tokens=True)[0]
    result = output_text.split("<|Assistant|>")[-1].strip()

    return jsonify({"code": result})


if __name__ == '__main__':
    app.run(debug=True)
