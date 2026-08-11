import { DfmComponent } from "./dfmParser";

/**
 * Maps Delphi color names to their corresponding hex values. This mapping is based on the color constants defined in Delphi. 
 * For more information, see: https://docwiki.embarcadero.com/RADStudio/Sydney/en/Color_Constants_(Delphi)
 */
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

/**
 * Converts a Delphi color name or hex value to a valid HTML color string. If the input is empty or unrecognized, it returns 'transparent'.
 * @param value The Delphi color name or hex value to convert.
 * @returns The corresponding HTML color string.
 */
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

/**
 * Escapes HTML special characters in a string.
 * @param value The string to escape.
 * @returns The escaped string.
 */
function escapeHtml(value: unknown): string {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Extracts the text content from a Delphi property value.
 * @param value The Delphi property value.
 * @returns The extracted text content.
 */
function getText(value: unknown): string {
	return String(value ?? '')
		.replace(/^'/, '')
		.replace(/'$/, '')
		.replace(/&/g, '');
}

/**
 * Adjusts the given byte buffer by removing the Delphi image wrapper if present. 
 * This is necessary for certain Delphi image types that include additional metadata.
 * @param bytes The byte buffer representing the image data.
 * @returns A new byte buffer with the Delphi image wrapper removed, if applicable.
 */
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

/**
 * Detects the MIME type of an image based on its byte signature or Delphi class name. 
 * This function checks for common image formats such as PNG, JPEG, BMP, and ICO.
 * @param bytes The byte buffer representing the image data.
 * @param className The Delphi class name of the image, which can provide additional context for detection.
 * @returns A string representing the detected MIME type, or 'application/octet-stream' if the type cannot be determined.
 */
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

/**
 * Converts a Delphi image property value to a data URL suitable for use in HTML. 
 * This function handles various image formats and ensures that the resulting data URL is correctly formatted for web use.
 * @param value The Delphi image property value, which may be a base64-encoded string, a hex string, or a URL.
 * @returns A data URL representing the image, or an empty string if the input is invalid or unrecognized.
 */
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

/**
 * Converts a Delphi property value to a pixel value string suitable for use in CSS. 
 * If the input is not a valid number, it falls back to the provided default value.
 * @param value The Delphi property value to convert, which may be a number or a string representation of a number.
 * @param fallback The default value to use if the input is not a valid number.
 * @returns A string representing the pixel value.
 */
function toPx(value: unknown, fallback: number): string {
	const num = Number(value ?? fallback);
	if (isNaN(num)) {
		return `${fallback}px`;
	}
	return `${num}px`;
}

/**
 * Generates the common CSS position styles for a DFM component.
 * @param component The DFM component for which to generate position styles.
 * @returns A string containing the CSS position styles.
 */
function commonPosition(component: DfmComponent): string {
	const left = toPx(component.properties.Left, 0);
	const top = toPx(component.properties.Top, 0);
	const width = toPx(component.properties.Width, 100);
	const height = toPx(component.properties.Height, 25);

	return `position:absolute; left:${left}; top:${top}; width:${width}; height:${height};`;
}

/**
 * Generates the common CSS font styles for a DFM component based on its properties. This includes font size, weight, style, and family.
 * @param component The DFM component for which to generate font styles.
 * @returns A string containing the CSS font styles.
 */
function commonFont(component: DfmComponent): string {
	const size = toPx(Math.abs(Number(component.properties.FontHeight)), 10);
	const weight = component.properties.FontStyle?.includes('fsBold') ? 'bold' : 'normal';
	const style = component.properties.FontStyle?.includes('fsItalic') ? 'italic' : 'normal';
	const family = component.properties.FontName ?? 'Arial, sans-serif';

	return `font-size: ${size}; font-weight: ${weight}; font-style: ${style}; font-family: ${family};`;
}

/**
 * Renders the corner elements for a DFM component, which are used to indicate selection and resizing handles in the UI. 
 * Each corner is represented by a span element with appropriate classes for styling.
 * @returns A string containing the HTML for the corner elements.
 */
function renderCorners(): string {
	return `
		<span class="corner tl"></span>
		<span class="corner tr"></span>
		<span class="corner bl"></span>
		<span class="corner br"></span>`;
}

/**
 * Renders the given content with corner elements.
 * @param content The content to render with corners.
 * @returns A string containing the HTML for the content with corner elements.
 */
function renderWithCorners(content: string): string {
	return `${renderCorners()}${content}`;
}

/**
 * This function recursively renders a DFM component and its children into an HTML string. 
 * It handles various Delphi component types, applying appropriate styles and properties to each. 
 * The function also includes logic for rendering corners and handling specific component behaviors.
 * @param component The DFM component to render, which may have children that will also be rendered recursively.
 * @returns A string containing the HTML representation of the component and its children.
 */
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
			//TODO: handle buttons with images
			return `
				<button
					id="${component.name}"
					data-line="${component.lineNumber}"
					data-name="${component.name}"
					title="${escapeHtml(component.name || component.properties.OnClick)}"
					class="cursordefault control"
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
					data-line="${component.lineNumber}"
					data-name="${component.name}"
					title="${escapeHtml(component.name)}"
					class="cursordefault control"
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
					data-line="${component.lineNumber}"
					data-name="${component.name}"
					title="${escapeHtml(component.name)}"
					class="cursordefault control"
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
						data-line="${component.lineNumber}"
						data-name="${component.name}"
						title="${escapeHtml(component.name)}"
						type="text"
						readonly
						value="${caption}"
						class="cursordefault control"
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
						data-line="${component.lineNumber}"
						data-name="${component.name}"
						title="${escapeHtml(component.name)}"
						readonly
						class="cursordefault control"
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
					data-line="${component.lineNumber}"
					data-name="${component.name}"
					title="${escapeHtml(component.name)}"
					class="cursordefault control"
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
					data-line="${component.lineNumber}"
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
						class="cursordefault control"
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
					data-line="${component.lineNumber}"
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
						class="cursordefault control"
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
			{
				const icon = '⏰';

				return `
				<div
					id="${component.name}"
					data-line="${component.lineNumber}"
					data-name="${component.name}"
					class="cursordefault control"
					style="
						${position}
						text-align: center;
					"
				>
					${renderWithCorners('')}
					<div
						title="${escapeHtml(component.properties.OnTimer || component.name)}"
						style="
							width: 25px;
							height: 25px;
							margin: 0 auto;
							border: 1px dashed black;
						"
					>${icon}</div>
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
			}

		case 'TImageCollection': {
				// The parser stores images as a JSON string in properties.Images. Provide robust fallbacks
				// for Left/Top/Width/Height parsing and layout when those values are missing or strings.
				let itemsHtml = '';
				try {
					let images: any[] = [];
					const raw = component.properties.Images;
					if (!raw) images = [];
					else if (typeof raw === 'string') {
						images = JSON.parse(raw || '[]');
					} else if (Array.isArray(raw)) {
						images = raw;
					} else {
						images = [];
					}

					// helper to normalize numeric-ish values
					const parseNum = (v: any): number | null => {
						if (v === undefined || v === null) return null;
						if (typeof v === 'number' && !isNaN(v)) return v;
						if (typeof v === 'string') {
							const m = v.match(/-?\d+/);
							if (m) return parseInt(m[0], 10);
						}
						if (typeof v === 'object') {
							// maybe nested as {Left: '10'}
							if (v.Left) return parseNum(v.Left);
							if (v.left) return parseNum(v.left);
						}
						return null;
					};

					const GAP = 4;
					itemsHtml = images.map((it: any, idx: number) => {
						const src = toImageSource(it.imageData ?? it.ImageData ?? it.image ?? it.Image ?? '');
						let leftNum = parseNum(it.left ?? it.Left ?? it.LeftPosition ?? it.LeftValue ?? null);
						let topNum = parseNum(it.top ?? it.Top ?? it.TopPosition ?? it.TopValue ?? null);
						let wNum = parseNum(it.Width ?? it.WidthPx ?? it.width ?? null);
						let hNum = parseNum(it.Height ?? it.HeightPx ?? it.height ?? null);

						// reasonable defaults
						if (wNum === null || wNum <= 0) wNum = 32;
						if (hNum === null || hNum <= 0) hNum = 32;

						// If no explicit position, layout items in a row with small gap
						if (leftNum === null) leftNum = idx * (wNum + GAP);
						if (topNum === null) topNum = 0;

						// clamp to integers
						leftNum = Math.round(leftNum);
						topNum = Math.round(topNum);
						wNum = Math.round(wNum);
						hNum = Math.round(hNum);

						const left = toPx(leftNum, 0);
						const top = toPx(topNum, 0);
						const w = toPx(wNum, 32);
						const h = toPx(hNum, 32);

						return `<div style="position:absolute; left:${left}; top:${top}; width:${w}; height:${h}; overflow:hidden;"><img src="${src}" style="width:100%;height:100%;object-fit:contain;border:none;" alt="${escapeHtml(it.name||it.Name||('img'+idx))}"></div>`;
					}).join('');
				} catch (e) {
					itemsHtml = '';
				}

				return `
				<div
					id="${component.name}"
					data-line="${component.lineNumber}"
					data-name="${component.name}"
					title="${escapeHtml(component.name)}"
					class="cursordefault control"
					style="
						${position}
						overflow: hidden;
					"
				>
					${renderCorners()}
					${itemsHtml}
				</div>`;
			}
		case 'TCheckBox':
			return `
				${renderWithCorners('')}
				<input
					id="${component.name}"
					data-line="${component.lineNumber}"
					data-name="${component.name}"
					type="checkbox"
					title="${escapeHtml(component.name)}" 
					class="cursordefault control"
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
					data-line="${component.lineNumber}"
					data-name="${component.name}"
					type="range"
					min="${component.properties.Min ?? 0}"
					max="${component.properties.Max ?? 100}"
					class="cursordefault control"
					style="${position}" 
				>
			`;
	}

	return `
		<div
			data-line="${component.lineNumber}"
			data-name="${component.name}"
			title="${escapeHtml(component.className)}"
			class="control"
			style="
				cursor: help;
				${position}
				${font}
				border: 1px dashed red;
				overflow: hidden;
			"
		>
			${renderWithCorners(component.name)}
		</div>`;
}
