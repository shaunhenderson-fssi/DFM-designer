import * as vscode from 'vscode';
import { findComponentAtLine, findComponentByName, parseDfm } from './dfmParser';
import { renderComponent } from './renderer';

const delphiColorMap: Record<string, string> = {
	//these map from Delphi colors to hex colors. See https://docwiki.embarcadero.com/RADStudio/Sydney/en/Color_Constants_(Delphi)
	clblack: '#000000',
	clwhite: '#ffffff',
	clsilver: '#c0c0c0',
	clbtnface: '#c0c0c0',
	clactiveborder: '#c0c0c0',
	clactivecaption: '#808080',
	clbackground: '#000000',
	clbtnhighlight: '#ffffff',
	clbtnshadow: '#808080',
	clbtntext: '#000000',
	clcaptiontext: '#ffffff',
	cldefault: '#000000',
	clgradientactivecaption: '#000080',
	clgradientinactivecaption: '#808080',
	clgraytext: '#808080',
	clhighlight: '#000080',
	clhighlighttext: '#ffffff',
	clinactiveborder: '#c0c0c0',
	clinactivecaption: '#c0c0c0',
	clinactivecaptiontext: '#808080',
	clinfobk: '#ffffe1',
	clinfotext: '#000000',
	clmenu: '#c0c0c0',
	clmenubar: '#f0f0f0',
	clmenuhighlight: '#000080',
	clmenutext: '#000000',
	clnone: 'transparent',
	clscrollbar: '#c0c0c0',
	cl3ddkshadow: '#808080',
	cl3dlight: '#c0c0c0',
	clwindow: '#ffffff',
	clwindowframe: '#000000',
	clwindowtext: '#000000',
	claliceblue: '#f0f8ff',
	clantiquewhite: '#faebd7',
	claquamarine: '#7fffd4',
	clazure: '#f0ffff',
	clbeige: '#f5f5dc',
	clbisque: '#ffe4c4',
	clblanchedalmond: '#ffebcd',
	clblueviolet: '#8a2be2',
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

/**
 * Converts a Delphi color value to a CSS-compatible color string. If the value is not recognized, it returns 'transparent'.
 * @param value The Delphi color value to convert, which may be a named color or a hex string.
 * @returns A CSS-compatible color string, or 'transparent' if the input is not recognized.
 */
export function toHtmlColor(value: unknown): string {
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

export function getConstraintValue(properties: Record<string, any> | undefined, name: 'MinWidth' | 'MaxWidth' | 'MinHeight' | 'MaxHeight'): unknown {
	if (!properties) {
		return 0;
	}

	const nested = properties.Constraints;
	if (nested && typeof nested === 'object' && Object.prototype.hasOwnProperty.call(nested, name)) {
		return nested[name];
	}

	const flatName = `Constraints${name}`;
	if (Object.prototype.hasOwnProperty.call(properties, flatName)) {
		return properties[flatName];
	}

	const lowerFlatName = flatName.charAt(0).toLowerCase() + flatName.slice(1);
	if (Object.prototype.hasOwnProperty.call(properties, lowerFlatName)) {
		return properties[lowerFlatName];
	}

	return 0;
}

/**
 * Updates the Width and Height properties of a specified component in the DFM text.
 * @param dfmText The original DFM text as a string.
 * @param componentName The name of the component whose size properties are to be updated.
 * @param newWidth The new width value to set for the component.
 * @param newHeight The new height value to set for the component.
 * @returns A string containing the updated DFM text with the new Width and Height values for the specified component.
 */
function updateControlSize(dfmText: string, componentName: string, newWidth: number, newHeight: number): string {
    const lines = dfmText.split(/\r?\n/);

    let insideComponent = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const objectMatch = line.match(/^\s*object\s+(\w+)\s*:\s*\w+/i);

        if (objectMatch) {
            insideComponent = objectMatch[1] === componentName;
            continue;
        }

        if (insideComponent && line.trim().toLowerCase() === 'end') {
            break;
        }

        if (!insideComponent) {
            continue;
        }

        if (/^\s*Width\s*=/.test(line)) {
            const indent = line.match(/^\s*/)?.[0] ?? '';
            lines[i] = `${indent}Width = ${Math.round(newWidth)}`;
            continue;
        }

        if (/^\s*Height\s*=/.test(line)) {
            const indent = line.match(/^\s*/)?.[0] ?? '';
            lines[i] = `${indent}Height = ${Math.round(newHeight)}`;
            continue;
        }
    }

    return lines.join('\n');
}

/**
 * Updates the Left and Top properties of a specified component in the DFM text.
 * @param dfmText The original DFM text as a string.
 * @param componentName The name of the component whose position properties are to be updated.
 * @param newLeft The new left position value to set for the component.
 * @param newTop The new top position value to set for the component.
 * @returns A string containing the updated DFM text with the new Left and Top values for the specified component.
 */
function updateControlPosition(dfmText: string, componentName: string, newLeft: number, newTop: number): string {
    const lines = dfmText.split(/\r?\n/);

    let insideComponent = false;

    for (let i = 0; i < lines.length; i++) {
        const objectMatch = lines[i].match(/^\s*object\s+(\w+)\s*:\s*\w+/i);

        if (objectMatch) {
            insideComponent = objectMatch[1] === componentName;
            continue;
        }

        if (insideComponent && lines[i].trim() === 'end') {
            break;
        }

        if (!insideComponent) {
            continue;
        }

        if (/^\s*Left\s*=/.test(lines[i])) {
            const indent = lines[i].match(/^\s*/)?.[0] ?? '';
            lines[i] = `${indent}Left = ${Math.round(newLeft)}`;
        }

        if (/^\s*Top\s*=/.test(lines[i])) {
            const indent = lines[i].match(/^\s*/)?.[0] ?? '';
            lines[i] = `${indent}Top = ${Math.round(newTop)}`;
        }
    }

    return lines.join('\n');
}

export function activate(context: vscode.ExtensionContext) {
	console.log('DFM Designer Activated');
	const htmlOutput = vscode.window.createOutputChannel('DFM Preview HTML');
	context.subscriptions.push(htmlOutput);

	vscode.window.showInformationMessage('Open a DFM file then press Ctrl+Shift+P and select "Preview Delphi DFM"'); //from title in package.json
	//Message length:                    [                                                                   ]
	const disposable = vscode.commands.registerCommand(
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
						.map(component => renderComponent(component)) //src/renderer.ts
						.join('');
			
				panel.webview.onDidReceiveMessage(
					async message => {
						console.log('WebView Message:', JSON.stringify(message));

						if (message.command === 'gotoComponent') {
							//when the user clicks on a component in the webview, this will select the corresponding component in the DFM editor
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

						if (message.command === 'resizeControl') {
							//when the user resizes a component in the webview, this will update the corresponding component in the DFM editor
							const text = editor.document.getText();

							const updated = updateControlSize(
									text,
									message.componentName,
									message.width,
									message.height
								);

							const edit = new vscode.WorkspaceEdit();

							edit.replace(
								editor.document.uri,
								new vscode.Range(
									editor.document.positionAt(0),
									editor.document.positionAt(
										text.length
									)
								),
								updated
							);

							await vscode.workspace.applyEdit(edit);
						}

						if (message.command === 'moveControl') {
							const updatedText =
								updateControlPosition(
									editor.document.getText(),
									message.componentName,
									message.left,
									message.top
								);

							const edit = new vscode.WorkspaceEdit();

							edit.replace(
								editor.document.uri,
								new vscode.Range(
									editor.document.positionAt(0),
									editor.document.positionAt(
										editor.document.getText().length
									)
								),
								updatedText
							);

							vscode.workspace.applyEdit(edit);
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

				const webviewHtml = `
					<!DOCTYPE html>
					<html>
					<head>
						<title>DFM Preview</title>
						<style>
							.cursordefault { 
								cursor:default; 
							}

							.control.selected {
								/* CSS for when a HTML element is clicked */
							}

							.control {
								user-select: none;
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
								z-index: 1000;
							}

							.show-corners > .corner {
								display: block;
							}

							.tl { top:0; left:0; transform:translate(-50%, -50%); cursor:nwse-resize !important; z-index:1000; }
							.tr { top:0; right:0; transform:translate(50%, -50%); cursor:nesw-resize !important; z-index:1000; }
							.bl { bottom:0; left:0; transform:translate(-50%, 50%); cursor:nesw-resize !important; z-index:1000; }
							.br { bottom:0; right:0; transform:translate(50%, 50%); cursor:nwse-resize !important; z-index:1000; }
						</style>
					</head>
					<body style="
						background-color: #ffffff;
						background-image:
							linear-gradient(45deg, #cccccc 25%, transparent 25%),
							linear-gradient(-45deg, #cccccc 25%, transparent 25%),
							linear-gradient(45deg, transparent 75%, #cccccc 75%),
							linear-gradient(-45deg, transparent 75%, #cccccc 75%);
						background-size: 20px 20px;
						background-position: 0 0, 0 10px, 10px -10px, -10px 0;
						color: black;
					">
						<div 
							id="form" 
							style="
								position: absolute;
								left: 0px;
								top: 0px;
								
								min-width: ${getConstraintValue(form.properties, 'MinWidth') ?? form.properties.ClientWidth ?? formWidth}px;
								width: ${form.properties.ClientWidth ?? formWidth}px;
								max-width: ${getConstraintValue(form.properties, 'MaxWidth') ?? form.properties.ClientWidth ?? formWidth}px;

								min-height: ${getConstraintValue(form.properties, 'MinHeight') ?? form.properties.ClientHeight ?? formHeight}px;
								height: ${form.properties.ClientHeight ?? formHeight}px;
								max-height: ${getConstraintValue(form.properties, 'MaxHeight') ?? form.properties.ClientHeight ?? formHeight}px;

								background-color: ${toHtmlColor(form.properties.Color ?? 'silver')} !important;
								background-image: none !important;
								background-repeat: no-repeat !important;
								color: ${toHtmlColor(form.properties.FontColor ?? 'black')} !important;
								font-size: ${Math.abs(Number(form.properties.FontHeight ?? form.properties.TextHeight ?? 11))}px;
								font-weight: ${form.properties.FontStyle?.includes('fsBold') ? 'bold' : 'normal'};
								font-style: ${form.properties.FontStyle?.includes('fsItalic') ? 'italic' : 'normal'};
								font-family: ${form.properties.FontName ?? 'Arial, sans-serif'};
							"
						>
							${html}
						</div>

						<script>
							const formElement = document.getElementById('form');
							if (formElement) {
								formElement.style.setProperty('background-color', '${toHtmlColor(form.properties.Color ?? 'silver')}', 'important');
								formElement.style.setProperty('background-image', 'none', 'important');
							}

							//the console.log stuff in here will show in the new VS Code window.
							//press Ctrl+Shift+P, then choose "Developer: Open Webview Developer Tools"

							const vscode = acquireVsCodeApi();
							
							//for resizing
							let resizeControl = null;
							let startX = 0;
							let startY = 0;
							let startWidth = 0;
							let startHeight = 0;

							//for moving
							let dragControl = null;
							let dragStartX = 0;
							let dragStartY = 0;
							let controlStartLeft = 0;
							let controlStartTop = 0;

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

							window.addEventListener('message', event => {
								//user has selected text in the DFm file, update the web component
								const message = event.data;
								console.log('WebView received message:', JSON.stringify(message));

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

							document.addEventListener('click', e => {
								//selects (highlights) the current control in the webview and sends a message to the extension to select the corresponding component in the DFM editor
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

							document.addEventListener('mousedown', e => {
								console.log('mousedown');
								const control = e.target.closest('[data-name]') || e.target.closest('.control');
								console.log(control);

								if (!control) {
									return;
								}

								if (!e.target.classList.contains('br')) {
									return;
								}

								if (e.target.classList.contains('corner')) {
									//resize the selected element by dragging the corners
									e.preventDefault();

									resizeControl = control;

									startX = e.clientX;
									startY = e.clientY;

									startWidth = resizeControl.offsetWidth;
									startHeight = resizeControl.offsetHeight;
								} else {
									//move a control by dragging
									const dragControl = control;

									if (!dragControl) {
										return;
									}

									e.preventDefault();

									dragStartX = e.clientX;
									dragStartY = e.clientY;

									controlStartLeft = parseInt(dragControl.style.left || '0');
									controlStartTop = parseInt(dragControl.style.top || '0');
								}
							});

							document.addEventListener('mousemove', e => {
								console.log('resizeControl', resizeControl, 'dragControl', dragControl);
								if (!resizeControl) {
									//move
									if (!dragControl) {
										return;
									}

									console.log('mousemove, dragControl');
									e.preventDefault();

									const dx = e.clientX - dragStartX;
									const dy = e.clientY - dragStartY;

									dragControl.style.left = (controlStartLeft + dx) + 'px';
									dragControl.style.top = (controlStartTop + dy) + 'px';
								} else {
									//resize
									console.log('mousemove, resizeControl');

									e.preventDefault();
									resizeControl.style.width = (startWidth + (e.clientX - startX)) + 'px';
									resizeControl.style.height = (startHeight + (e.clientY - startY)) + 'px';
								}
							});

							document.addEventListener('mouseup', () => {
								console.log('mouseup');

								if (!resizeControl) {
									//move
									if (!dragControl) {
										return;
									}
									console.log('dragControl');
									vscode.postMessage({
										command: 'moveControl',
										componentName: dragControl.dataset.name,
										left: dragControl.offsetLeft,
										top: dragControl.offsetTop
									});

									dragControl = null;
								} else {
									//resize
									console.log('resizeControl');
									vscode.postMessage({
										command: 'resizeControl',
										componentName: resizeControl.dataset.name,
										width: resizeControl.offsetWidth,
										height: resizeControl.offsetHeight
									});

									resizeControl = null;
								}
							});
						</script>
					</body>
					</html>
				`;
				panel.webview.html = webviewHtml;
				htmlOutput.clear();
				htmlOutput.appendLine(`<!-- Generated DFM preview HTML: ${editor.document.fileName} -->`);
				htmlOutput.append(webviewHtml);
				htmlOutput.show(true);
			}
		);

	context.subscriptions.push(disposable);
}

export function deactivate() { }
