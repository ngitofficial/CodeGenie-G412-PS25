import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('extension.showPromptBox', () => {
      const panel = vscode.window.createWebviewPanel(
        'codeGenie',
        'CodeGenie',
        vscode.ViewColumn.Beside,
        { enableScripts: true }
      );

      panel.webview.html = getWebviewContent();

      // Handle message from webview
      panel.webview.onDidReceiveMessage(async message => {
        if (message.command === 'generate') {
          const response = await fetch('http://127.0.0.1:5000/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: message.prompt })
          });
          const data = await response.json() as {code:string};
          panel.webview.postMessage({ command: 'result', result: data.code });
        }
      });
    })
  );
}

function getWebviewContent() {
  return `
    <!DOCTYPE html>
    <html>
    <body>
      <h2>CodeGenie</h2>
      <input type="text" id="prompt" placeholder="Enter your prompt">
      <button onclick="generate()">Generate</button>
      <pre id="output"></pre>

      <script>
        const vscode = acquireVsCodeApi();

        function generate() {
          const prompt = document.getElementById('prompt').value;
          vscode.postMessage({ command: 'generate', prompt: prompt });
        }

        window.addEventListener('message', event => {
          const message = event.data;
          if (message.command === 'result') {
            document.getElementById('output').innerText = message.result;
          }
        });
      </script>
    </body>
    </html>`;
}
