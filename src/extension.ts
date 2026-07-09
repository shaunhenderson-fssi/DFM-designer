import * as vscode from 'vscode';
import { findComponentAtLine, findComponentByName, parseDfm } from './dfmParser';
import { renderComponent } from './renderer';

const delphiColorMap: Record<string, string> = {
	//these map from Delphi colors to hex colors. See https://docwiki.embarcadero.com/RADStudio/Sydney/en/Color_Constants_(Delphi)
	clblack: '#000000',
	clwhite: '#ffffff',
	clsilver: '#c0c0c0',
	clgray: '#808080',
	clred: '#ff0000',
	cllime: '#00ff00',
	clblue: '#0000ff',
	clyellow: '#ffff00',
	claqua: '#00ffff',
	clfuchsia: '#ff00ff',
	clmaroon: '#800000',
	clgreen: '#008000',
	clnavy: '#000080',
	clolive: '#808000',
	clpurple: '#800080',
	clteal: '#008080',
	clmoneygreen: '#c0dcc0',
	clskyblue: '#a6caf0',
	clcream: '#fffff0',
	clmedgray: '#a0a0a4',
};

function toHtmlColor(value: unknown): string {
	const raw = String(value ?? '').trim();
	if (!raw) {
		return 'transparent';
	}

	const normalized = raw.toLowerCase();
	if (normalized in delphiColorMap) {
		return delphiColorMap[normalized];
	}

	return raw;
}

export function activate(context: vscode.ExtensionContext) {

	console.log('DFM Designer Activated');

	vscode.window.showInformationMessage(
		'DFM Designer Loaded'
	);

	const disposable =
		vscode.commands.registerCommand(
			'delphi-dfm-designer.previewDfm',
			() => {

				const panel =
					vscode.window.createWebviewPanel(
						'dfmPreview',
						'DFM Preview',
						vscode.ViewColumn.Beside,
						{
							enableScripts: true
						}
					);

				const editor = vscode.window.activeTextEditor;
				const dfmEditor = vscode.window.activeTextEditor;
				if (!dfmEditor) {
					return;
				}

				if (!editor) {
					vscode.window.showErrorMessage(
						'No file open'
					);
					return;
				}

				const components = parseDfm(editor.document.getText()); //src/dfmParser.ts

				if (components.length === 0) {
					vscode.window.showErrorMessage(
						'No components found in DFM'
					);
					return;
				}

				
				console.log(`Components found: ${components.length}`);
				console.log(`Form children: ${components[0].children.length}`);
				//console.log(JSON.stringify(components[0], null, 2));

				const form = components[0];
				const formWidth = Number(form.properties.ClientWidth ?? 1024);
				const formHeight = Number(form.properties.ClientHeight ?? 768);
				const html =
					form.children
						.map(renderComponent) //src/renderer.ts
						.join('');
			
				panel.webview.onDidReceiveMessage(
					message => {
						console.log('WebView Message:', JSON.stringify(message));
						if (message.command === 'gotoComponent') {
							const componentName = String(message.componentName ?? '').trim();
							if (!componentName) {
								return;
							}

							const component = findComponentByName(components, componentName);
							if (!component) {
								return;
							}

							const position = new vscode.Position(component.lineNumber, 0);
							dfmEditor.selection = new vscode.Selection(position, position);
							dfmEditor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
							vscode.window.showTextDocument(dfmEditor.document, dfmEditor.viewColumn);
						}
					}
				);

				const selectionChanged = vscode.window.onDidChangeTextEditorSelection(event => {
					if (event.textEditor.document !== editor.document) {
						return;
					}

					const activeLine = event.selections[0]?.active.line ?? 0;
					const selectedComponent = findComponentAtLine(components, activeLine);

					console.log('Selection changed:', activeLine, JSON.stringify(selectedComponent));

					panel.webview.postMessage({
						command: 'lineChanged',
						lineNumber: activeLine,
						componentName: selectedComponent?.name ?? null
					});
				});
				context.subscriptions.push(selectionChanged);

				panel.webview.html = `
					<!DOCTYPE html>
					<html>
					<head>
						<title>${editor.document.fileName}</title>
						<style>
							.control.selected {
								/* CSS for when a HTML element is clicked */
							}

							.show-corners {
								position: relative;
							}

							.corner {
								position: absolute;
								width: 15px;
								height: 15px;
								background: #3d78b2;
								display: none;
								pointer-events: none;
								z-index: 1000;
							}

							.show-corners .corner {
								display: block;
							}

							.tl { top: 0; left: 0; transform: translate(-50%, -50%); }
							.tr { top: 0; right: 0; transform: translate(50%, -50%); }
							.bl { bottom: 0; left: 0; transform: translate(-50%, 50%); }
							.br { bottom: 0; right: 0; transform: translate(50%, 50%); }
						</style>
					</head>
					<body>
						<span>${editor.document.fileName}</span>
						<div 
							id="form" 
							style="
								position: absolute;
								left: 0px;
								top: 20px;
								width: ${formWidth}px;
								height: ${formHeight}px;
								background: ${toHtmlColor(form.properties.Color ?? 'transparent')};
								color: ${toHtmlColor(form.properties.FontColor ?? 'black')};
								font-size: ${Math.abs(Number(form.properties.FontHeight ?? 11))}px;
								font-weight: ${form.properties.FontStyle?.includes('fsBold') ? 'bold' : 'normal'};
								font-style: ${form.properties.FontStyle?.includes('fsItalic') ? 'italic' : 'normal'};
								font-family: ${form.properties.FontName ?? 'Arial, sans-serif'};
							"
						>
							${html}
						</div>

						<script>
							const vscode = acquireVsCodeApi();

							function setActiveControl(control) {
								document.querySelectorAll('.show-corners, .selected').forEach(el => {
									el.classList.remove('show-corners', 'selected');
								});

								if (!control) {
									return;
								}

								control.classList.add('control');
								control.classList.add('show-corners');
								control.classList.add('selected');
							}

							document.addEventListener('click', e => {
								const target = e.target instanceof Element ? e.target : null;
								const control = target?.closest('[data-name]');

								if (!control) {
									return;
								}

								setActiveControl(control);

								vscode.postMessage({
									command: 'gotoComponent',
									componentName: control.dataset.name
								});
							});

							window.addEventListener('message', event => {
								const message = event.data;

								if (message.command !== 'lineChanged') {
									return;
								}

								const componentName = message.componentName;

								const control = componentName
									? [...document.querySelectorAll('[data-name]')]
										.find(el => el.dataset.name === componentName)
									: null;

								setActiveControl(control);

								if (control) {
									control.scrollIntoView({
										block: 'nearest'
									});
								}
							});

						</script>
					</body>
					</html>
				`;
			});

	context.subscriptions.push(disposable);
}

export function deactivate() { }
