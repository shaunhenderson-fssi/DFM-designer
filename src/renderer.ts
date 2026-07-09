import { DfmComponent } from "./dfmParser";

function escapeHtml(value: unknown): string {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

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

function getText(value: unknown): string {
	return String(value ?? '')
		.replace(/^'/, '')
		.replace(/'$/, '')
		.replace(/&/g, '');
}

function stripDelphiImageWrapper(bytes: Buffer): Buffer {
    if (bytes.length < 8) {
        return bytes;
    }

    const firstByte = bytes[0];
    const className = bytes.subarray(1, 1 + firstByte).toString('ascii');

    if (/^T\w+Image$|^TIcon$|^TBitmap$|^TMetafile$/.test(className)) {

        if (className === 'TIcon') {
            // ICONS DO NOT HAVE THE EXTRA 4 BYTES
            return bytes.subarray(1 + firstByte);
        }

        // Other image types DO have the extra 4 bytes
        return bytes.subarray(1 + firstByte + 4);
    }

    return bytes;
}


function detectMime(bytes: Buffer, className?: string): string {
	if (bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
		return 'image/png';
	}

	if (bytes.length >= 2 && bytes.subarray(0,2).equals(Buffer.from([0xff, 0xd8]))) {
		return 'image/jpeg';
	}

	if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x01, 0x00]))) {		
		return 'image/x-icon';
	}

	if (bytes.length >= 2 && bytes.subarray(0, 2).equals(Buffer.from([0x42, 0x4d]))) {
		return 'image/bmp';
	}

	if (className === 'TJPEGImage') {
		return 'image/jpeg';
	}
	if (className === 'TBitmap') {
		return 'image/bmp';
	}
	if (className === 'TIcon') {
		return 'image/x-icon';
	}

	return 'application/octet-stream';
}

function toImageSource(value: unknown): string {
	const raw = String(value ?? '').trim();
	if (!raw) {
		return '';
	}

	if (raw.startsWith('data:') || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('file:')) {
		return raw;
	}

	const compact = raw.replace(/\s+/g, '');
	if (/^[0-9a-fA-F]+$/i.test(compact) && compact.length < 8) {
		return raw;
	}

	const allBytes = Buffer.from(compact, 'hex');
	const imageBytes = stripDelphiImageWrapper(allBytes);
	const mime = detectMime(imageBytes);

	return `data:${mime};base64,${imageBytes.toString('base64')}`;
}

function toPx(value: unknown, fallback: number): string {
	const num = Number(value ?? fallback);
	if (isNaN(num)) {
		return `${fallback}px`;
	}
	return `${num}px`;
}

function commonPosition(component: DfmComponent): string {
	const left = toPx(component.properties.Left, 0);
	const top = toPx(component.properties.Top, 0);
	const width = toPx(component.properties.Width, 100);
	const height = toPx(component.properties.Height, 25);

	return `position:absolute; left:${left}; top:${top}; width:${width}; height:${height};`;
}

function commonFont(component: DfmComponent): string {
	const size = toPx(Math.abs(Number(component.properties.FontHeight)), 10);
	const weight = component.properties.FontStyle?.includes('fsBold') ? 'bold' : 'normal';
	const style = component.properties.FontStyle?.includes('fsItalic') ? 'italic' : 'normal';
	const family = component.properties.FontName ?? 'Arial, sans-serif';

	return `font-size: ${size}; font-weight: ${weight}; font-style: ${style}; font-family: ${family};`;
}

function renderCorners(): string {
	return `
		<span class="corner tl"></span>
		<span class="corner tr"></span>
		<span class="corner bl"></span>
		<span class="corner br"></span>`;
}

function renderWithCorners(content: string): string {
	return `${renderCorners()}${content}`;
}

export function renderComponent(component: DfmComponent): string {
	const children = component.children.map(renderComponent).join('');
	const position = commonPosition(component);
	const font = commonFont(component);
	const caption = escapeHtml(getText(component.properties.Caption ?? component.properties.Text ?? ''));
	
	const alignment = component.properties.Alignment === 'taLeftJustify' ? 'left'
		: component.properties.Alignment === 'taRightJustify' ? 'right'
		: component.properties.Alignment === 'taCenter' ? 'center'
		: 'left';

	switch (component.className) {

		case 'TButton':
		case 'TToolButton':
		case 'TAKPSpeedButton':
		case 'TBitBtn':
			return `
				<button
					id="${component.name}"
					data-lineNumber="${component.lineNumber}"
					data-name="${component.name}"
					title="${escapeHtml(component.name || component.properties.OnClick)}"
					style="
						${position}
						${font}
						white-space: ${component.properties.WordWrap === 'True' ? 'normal' : 'nowrap'}; 
						overflow: hidden;
					"
				>
					${renderWithCorners(caption || component.name || component.properties.Action)}
				</button>`;
			
		case 'TLabel':
			return `
				<div
					id="${component.name}"
					data-lineNumber="${component.lineNumber}"
					data-name="${component.name}"
					title="${escapeHtml(component.name)}"
					style="
						${position}
						${font}
						background: ${toHtmlColor(component.properties.Color ?? 'transparent')};
						color: ${toHtmlColor(component.properties.FontColor ?? 'black')};
						text-align: ${alignment};
						white-space: nowrap;
						overflow: hidden;
					"
				>
					${renderWithCorners(caption || escapeHtml(component.name) || escapeHtml(component.properties.Action))}
				</div>`;

		case 'TPanel':
		case 'TPageControl':
			return `
				<div
					id="${component.name}"
					data-lineNumber="${component.lineNumber}"
					data-name="${component.name}"
					title="${escapeHtml(component.name)}"
					style="
						${position}
						${font}
						background: ${toHtmlColor(component.properties.Color ?? 'transparent')};
						color: ${toHtmlColor(component.properties.FontColor ?? 'black')};
						overflow: hidden;
					"
				>
					${renderWithCorners(children)}
				</div>`;

		case 'TEdit':
		case 'TAKPEdit':
			return `
				<div style="${position}; ${font};">
					${renderWithCorners('')}
					<input
						id="${component.name}"
						data-lineNumber="${component.lineNumber}"
						data-name="${component.name}"
						title="${escapeHtml(component.name)}"
						type="text"
						readonly
						value="${caption}"
						style="
							width: 100%;
							height: 100%;
							border: none;
							background: transparent;
						"
					>
				</div>`;

		case 'TMemo':
			return `
				<div style="${position}; ${font};">
					${renderWithCorners('')}
					<textarea
						id="${component.name}"
						data-lineNumber="${component.lineNumber}"
						data-name="${component.name}"
						title="${escapeHtml(component.name)}"
						readonly
						style="
							width: 100%;
							height: 100%;
							border: none;
							background: transparent;
						"
					>${caption}</textarea>
				</div>`;
		
		case 'TToolBar':
		case 'TStatusBar':
			return `
				<div
					id="${component.name}"
					data-lineNumber="${component.lineNumber}"
					data-name="${component.name}"
					title="${escapeHtml(component.name)}"
					style="
						${position}
						${font}
						background: #d4d0c8;
						border: 1px solid #808080;
					"
				>
					${renderWithCorners(children)}
				</div>`;
		
		case 'TImage': {
			const src = toImageSource(component.properties.PictureData ?? component.properties.Picture ?? '');
			const fit = String(component.properties.Stretch).toLowerCase() === 'true' ? 'fill' : 'contain';
			const hasSrc = Boolean(src);

			return `
				<div
					id="${component.name}"
					data-lineNumber="${component.lineNumber}"
					data-name="${component.name}"
					title="${escapeHtml(component.name)}"
					style="
						${position}; 
						overflow: hidden;
						${hasSrc ? '' : 'border: 1px dashed black;'}
					"
				>
					${renderCorners()}
					${hasSrc ? `<img
						alt="${escapeHtml(component.name)}"
						src="${src}"
						style="
							width:100%;
							height:100%;
							border:none;
							object-fit:${fit};
						"
					>` : component.name}
				</div>
			`;
		}
		
		case 'TIcon': {
			const src = toImageSource(component.properties.PictureData ?? component.properties.Picture ?? '');
			const hasSrc = Boolean(src);

			return `
				<div
					id="${component.name}"
					data-lineNumber="${component.lineNumber}"
					data-name="${component.name}"
					title="${escapeHtml(component.name)}"
					style="
						${position}; 
						overflow: hidden;
						${hasSrc ? '' : ' border: 1px dashed black;'}
					"
				>
					${renderCorners()}
					${hasSrc ? `<img
						src="${src}"
						style="
							width:100%; 
							height:100%; 
							border:none;
						"
					>` : ''}
				</div>
			`;
		}
		
		case 'TTimer':
			return `
				<div
					id="${component.name}"
					data-lineNumber="${component.lineNumber}"
					data-name="${component.name}"
					style="
						${position}
						text-align: center;
					"
				>
					${renderWithCorners('')}
					<div
						title="${escapeHtml(component.properties.OnTimer)}"
						style="
							width: 25px;
							height: 25px;
							margin: 0 auto;
							border: 1px dashed black;
						"
					>⏰</div>

					<div
						style="
							margin-top: 2px;
							font-size: 10px;
							white-space: nowrap;
						"
					>
						${component.name}
					</div>
				</div>
			`;
			
		case 'TCheckBox':
			return `
				${renderWithCorners('')}
				<input
					id="${component.name}"
					data-lineNumber="${component.lineNumber}"
					data-name="${component.name}"
					type="checkbox"
					title="${escapeHtml(component.name)}" 
					style="${position}" 
					disabled
					${component.properties.Checked === 'True' ? 'checked' : ''}
				>${caption}
			`;

		case 'TTrackBar':
			return `
				${renderWithCorners('')}
				<input
					id="${component.name}"
					data-lineNumber="${component.lineNumber}"
					data-name="${component.name}"
					type="range"
					min="${component.properties.Min ?? 0}"
					max="${component.properties.Max ?? 100}"
				>
			`;
	}

	return `
		<div
			data-lineNumber="${component.lineNumber}"
			data-name="${component.name}"
			title="${escapeHtml(component.className)}"
			style="
				${position}
				${font}
				border: 1px dashed red;
				overflow: hidden;
			"
		>
			${renderWithCorners(component.name)}
		</div>`;
}
