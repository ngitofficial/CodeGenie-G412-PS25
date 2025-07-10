import * as vscode from 'vscode';
import axios from 'axios';

let lastGeneratedCode = '';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('codegenie.run', async () => {
    const editor = vscode.window.activeTextEditor;

    if (editor) {
      const position = editor.selection.active;
      const lineText = editor.document.lineAt(position.line).text;
      const match = lineText.match(/^\s*(\/\/|#)\s*(.*)/);

      if (match) {
        const promptText = match[2].trim();
        const languageId = editor.document.languageId || 'plaintext';
        const intent = detectIntent(promptText);
        const prompt = buildPromptFromIntent(promptText, languageId, intent);

        try {
          const response = await axios.post('http://127.0.0.1:8000/generate', {
            prompt,
            max_new_tokens: 300
          });

          const rawOutput = response.data.completion || response.data.code || '';
          const extractedCode = extractCodeBlock(rawOutput);
          const doc = editor.document;
          const currentLine = position.line;

          await editor.edit(editBuilder => {
            const docLine = doc.lineAt(currentLine);
            if (!docLine.text.endsWith('\n')) {
              editBuilder.insert(new vscode.Position(currentLine, docLine.text.length), '\n');
            }
            editBuilder.insert(new vscode.Position(currentLine + 1, 0), '\n' + extractedCode.trim() + '\n');
          });

          return;
        } catch (err) {
          vscode.window.showErrorMessage('CodeGenie inline prompt failed: ' + err);
          return;
        }
      }
    }

    const panel = vscode.window.createWebviewPanel(
      'codeGenieView',
      'CodeGenie AI',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    panel.webview.html = getWebviewContent();

    panel.webview.onDidReceiveMessage(async (message) => {
      const userCode = message.code || '';
      const languageId = vscode.window.activeTextEditor?.document.languageId || 'plaintext';

      if (!userCode.trim()) {
        panel.webview.postMessage({ command: 'validationError', text: 'Please enter some code.' });
        return;
      }

      const intent = message.command;
      const prompt = buildPromptFromIntent(userCode, languageId, intent);

      try {
        const res = await axios.post("http://127.0.0.1:8000/generate", {
          prompt,
          max_new_tokens: 500
        });

        const rawOutput = res.data.completion || res.data.code || '';
        const extracted = extractCodeBlock(rawOutput);
        lastGeneratedCode = extracted;

        panel.webview.postMessage({ command: 'showSuggestion', suggestion: extracted });
      } catch (err) {
        panel.webview.postMessage({ command: 'error', text: 'Failed to process your request.' });
      }
    });
  });

  context.subscriptions.push(disposable);
}

function detectIntent(prompt: string): string {
  const p = prompt.toLowerCase();
  if (p.includes('debug')) return 'debug';
  if (p.includes('explain')) return 'explain';
  if (p.includes('autocomplete') || p.includes('complete')) return 'autocomplete';

  const isLikelyAutocomplete = /\b(for|while|if|else|def|class|function)\b.[\:\{\=]?\s*$/;
  if (isLikelyAutocomplete.test(p)) return 'autocomplete';

  return 'generate';
}

function buildPromptFromIntent(code: string, languageId: string, intent: string): string {
  switch (intent) {
    case 'generate':
      return `Write ${languageId} code for the following task:\n\n${code}\n\nReturn only the code inside triple backticks. No explanation.`;

    case 'debug':
      return `You are a strict code debugging assistant. You will receive ${languageId} code that may contain syntax or logic errors.
Your job:
- Fix all issues.
- Return only the full corrected code.
- Wrap your answer in triple backticks.

Even if the code is correct, reformat and return it.

Now debug this:

\\`${languageId}
${code}
\\``;

    case 'explain':
      return `You are a helpful programming tutor. Explain what the following ${languageId} code does in a simple, beginner-friendly way. Break down the logic step by step using clear language. Avoid jargon unless necessary.
Code:
${code}
Explanation:`;

    case 'autocomplete':
      return `You are a smart code autocompletion engine. The user is writing ${languageId} code and stopped midway. Your task is to finish the code as naturally as possible, continuing from where it left off.

Only return the completed code inside triple backticks. Do not repeat the prompt or explain.

Continue this code:

\\`${languageId}
${code}
\\``;
      
    default:
      return `Here is a ${languageId} code snippet:\n\n${code}\n\nProvide only the corrected code inside triple backticks. Do not explain anything.`;
  }
}

function extractCodeBlock(text: string): string {
  const match = text.match(/(?:\w+)?\n([\s\S]*?)/);
  if (match) {
    return match[1].trim();
  }
  return text.trim();
}

export function deactivate() {}

function getWebviewContent(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CodeGenie AI</title>
  <style>
    body {
      font-family: sans-serif;
      background: #ffffff;
      color: #003366;
      padding: 1rem;
    }
    h2 {
      color: #004488;
    }
    textarea {
      width: 100%;
      font-family: monospace;
      font-size: 14px;
      padding: 10px;
      margin-top: 10px;
      resize: vertical;
    }
    #input {
      height: 150px;
    }
    #output {
      height: 300px;
      margin-top: 10px;
    }
    button {
      margin: 10px 5px 0 0;
      padding: 6px 12px;
      background-color: #007acc;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover {
      background-color: #005f99;
    }
    #loaderBarContainer {
      width: 100%;
      height: 4px;
      background-color: #e0e0e0;
      overflow: hidden;
      position: relative;
      margin-top: 20px;
      display: none;
    }
    #loaderBar {
      height: 100%;
      width: 100%;
      background-color: #007acc;
      position: absolute;
      animation: loading 1.5s infinite ease-in-out;
    }
    @keyframes loading {
      0% { left: -100%; width: 100%; }
      50% { left: 0%; width: 100%; }
      100% { left: 100%; width: 100%; }
    }
  </style>
</head>
<body>
  <h2>CodeGenie AI Assistant</h2>
  <label for="input">Enter your code here:</label>
  <textarea id="input" placeholder="Type or paste code here..."></textarea>
  <div>
    <button onclick="sendCommand('generate')">Generate</button>
    <button onclick="sendCommand('debug')">Debug</button>
    <button onclick="sendCommand('explain')">Explain</button>
    <button onclick="sendCommand('autocomplete')">Autocomplete</button>
  </div>
  <div id="loaderBarContainer">
    <div id="loaderBar"></div>
  </div>
  <label for="output">Output:</label>
  <textarea id="output" readonly placeholder="Suggestions will appear here..."></textarea>
  <script>
    const vscode = acquireVsCodeApi();
    const output = document.getElementById('output');
    const loaderBarContainer = document.getElementById('loaderBarContainer');

    function sendCommand(command) {
      const userCode = document.getElementById('input').value;
      vscode.postMessage({ command, code: userCode });
      loaderBarContainer.style.display = 'block';
      output.value = "";
    }

    window.addEventListener('message', event => {
      const msg = event.data;
      loaderBarContainer.style.display = 'none';

      if (msg.command === 'showSuggestion') {
        output.value = msg.suggestion;
      } else if (msg.command === 'error' || msg.command === 'validationError') {
        output.value = "⚠ " + msg.text;
      }
    });
  </script>
</body>
</html>`;
}
