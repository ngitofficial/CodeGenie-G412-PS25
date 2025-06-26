import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codegenie.run', () => {
      const panel = vscode.window.createWebviewPanel(
        'codeGenie',
        'CodeGenie',
        vscode.ViewColumn.Beside,
        { enableScripts: true }
      );

      panel.webview.html = getWebviewContent();

      panel.webview.onDidReceiveMessage(async message => {
        if (message.command === 'generate') {
          const prompt = message.prompt.trim();
          const intent = detectIntent(prompt);

          try {
            const response = await fetch('http://127.0.0.1:5000/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt, intent })
            });

            const data = await response.json() as { code: string };
            panel.webview.postMessage({ command: 'result', result: data.code });
          } catch (err) {
            vscode.window.showErrorMessage('CodeGenie failed: ' + err);
          }
        }
      });
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async event => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || event.document !== editor.document) return;

      const doc = editor.document;
      const cursor = editor.selection.active;
      const line = doc.lineAt(cursor.line).text;

      const match = line.match(/^\s*(#|\/\/)\s*(.*)/);
      if (!match) return;

      const prompt = match[2].trim();
      if (!prompt) return;

      const intent = detectIntent(prompt);
      const fullPrompt = prompt;

      try {
        const response = await fetch('http://127.0.0.1:5000/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: fullPrompt, intent })
        });

        const data = await response.json() as { code: string };

        editor.edit(editBuilder => {
          const pos = new vscode.Position(cursor.line + 1, 0);
          editBuilder.insert(pos, `\n${data.code}\n`);
        });
      } catch (err) {
        vscode.window.showErrorMessage('CodeGenie failed inline: ' + err);
      }
    })
  );
}

function detectIntent(prompt: string): 'generate' | 'debug' | 'autocomplete' {
  const lowered = prompt.toLowerCase();
  if (lowered.includes('fix') || lowered.includes('bug') || lowered.includes('debug')) return 'debug';
  if (!lowered.includes('generate') && prompt.split(' ').length <= 5) return 'autocomplete';
  return 'generate';
}

function getWebviewContent(): string {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <style>
      body { background: #1e1033; color: #eee; font-family: sans-serif; padding: 20px; }
      textarea { width: 100%; height: 100px; border-radius: 8px; padding: 10px; background: #2c1d4f; color: white; font-family: monospace; }
      button { margin-top: 10px; padding: 8px 16px; background: #7f5af0; border: none; color: white; border-radius: 6px; cursor: pointer; }
      pre { background: #140c28; padding: 15px; border-radius: 8px; margin-top: 20px; white-space: pre-wrap; word-wrap: break-word; }
    </style>
  </head>
  <body>
    <h2>🔮 CodeGenie</h2>
    <textarea id="prompt" placeholder="Enter your prompt..."></textarea><br/>
    <button onclick="generate()">✨ Generate</button>
    <pre id="output"></pre>

    <script>
      const vscode = acquireVsCodeApi();

      function generate() {
        const prompt = document.getElementById('prompt').value.trim();
        if (!prompt) {
          alert('Please enter a prompt!');
          return;
        }
        document.getElementById('output').innerText = '🔄 Generating...';
        vscode.postMessage({ command: 'generate', prompt });
      }

      window.addEventListener('message', event => {
        const message = event.data;
        if (message.command === 'result') {
          document.getElementById('output').innerText = message.result;
        }
      });
    </script>
  </body>
  </html>
  `;
}

export function deactivate() {}

