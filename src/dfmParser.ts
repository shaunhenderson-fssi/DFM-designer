//for normal delphi objects
export interface DfmComponent {
	name: string;
	className: string;
	properties: Record<string, any>;
	children: DfmComponent[];
	lineNumber: number;
	endLine: number;
	widthLine: number;
	heightLine: number;
	leftLine: number;
	topLine: number;
}

//for TImageCollection
export interface DfmCollectionItem {
	properties: Record<string, any>; //top, left
	children: ImageCollectionItem[];
}

interface ImageCollectionItem {
	name: string;
	description: string;
	imageData: string;
	left: number;
	top: number;
}

export function findComponentByName(components: DfmComponent[], name: string): DfmComponent | undefined {
	for (const component of components) {
		if (component.name === name) {
			return component;
		}

		const nested = findComponentByName(component.children, name);
		if (nested) {
			return nested;
		}
	}

	return undefined;
}

export function findComponentAtLine(components: DfmComponent[], lineNumber: number): DfmComponent | undefined {
	for (const component of components) {
		if (lineNumber >= component.lineNumber && lineNumber <= component.endLine) {
			const nested = findComponentAtLine(component.children, lineNumber);
			if (nested) {
				return nested;
			}

			return component;
		}
	}

	return undefined;
}

function normalizePropertyName(name: string): string {
	return name
		.split('.')
		.map((segment, index) => index === 0 ? segment : segment.charAt(0).toUpperCase() + segment.slice(1))
		.join('');
}

function parseCollectionItems(lines: string[], startIndex: number): { items: any[]; endIndex: number } {
	const items: any[] = [];
	let currentItem: Record<string, any> | null = null;
	let depth = 1;

	for (let index = startIndex; index < lines.length; index++) {
		const trimmed = lines[index].trim();

		if (trimmed === '<') {
			depth++;
			continue;
		}

		if (trimmed === '>') {
			depth--;
			if (depth === 0) {
				return { items, endIndex: index };
			}
			continue;
		}

		if (trimmed === 'end>') {
			if (depth === 1) {
				return { items, endIndex: index };
			}
			currentItem = null;
			continue;
		}

		if (trimmed === 'end') {
			currentItem = null;
			continue;
		}

		if (depth === 1 && trimmed === 'item') {
			currentItem = {};
			items.push(currentItem);
			continue;
		}

		if (!currentItem) {
			continue;
		}

		const propertyMatch = trimmed.match(/^([\w.]+)\s*=\s*(.+)$/);
		if (propertyMatch) {
			const propName = normalizePropertyName(propertyMatch[1]);
			currentItem[propName] = propertyMatch[2].trim();
		}
	}

	return { items, endIndex: lines.length - 1 };
}

function skipCollectionBlock(lines: string[], startIndex: number): number {
	let depth = 1;
	for (let index = startIndex; index < lines.length; index++) {
		const trimmed = lines[index].trim();
		if (trimmed === '<') {
			depth++;
			continue;
		}
		if (trimmed === '>') {
			depth--;
			if (depth <= 0) {
				return index;
			}
			continue;
		}
		if (trimmed === 'end>') {
			depth--;
			if (depth <= 0) {
				return index;
			}
		}
	}

	return lines.length - 1;
}

function parseImageCollection(lines: string[], startIndex: number): {
	images: any[]; endIndex: number; collectionProps?: Record<string, any>
} {
	const images: ImageCollectionItem[] = [];

	let index = startIndex;
	let collectionDepth = 0;
	let inSourceImages = false;
	let currentImage;
	let collectionProps: Record<string, any> = {};

	for (; index < lines.length; index++) {
		const trimmed = lines[index].trim();
		
		if (trimmed === '<') {
			collectionDepth++;
			continue;
		}

		// End of Images = <
		if (trimmed === '>') {
			collectionDepth--;
			if (collectionDepth === 0) {
				break;
			}
			continue;
		}

		if (trimmed === 'end>') {
			if (collectionDepth <= 1) {
				break;
			}
			currentImage = null;
			continue;
		}

		if (trimmed === 'end') {
			currentImage = null;
			continue;
		}

		if (trimmed === '>' && inSourceImages) {
			inSourceImages = false;
			continue;
		}

		if (trimmed === '>' && !inSourceImages) {
			break;
		}

		// New image item
		if (trimmed === 'item' && !inSourceImages) {
			currentImage = {
				name: '',
				description: '',
				imageData: '',
				left: 0,
				top: 0
			};

			images.push(currentImage);
			continue;
		}

		// End image item
		if (trimmed === 'end' && !inSourceImages) {
			currentImage = null;
			continue;
		}


		// If we're not inside a current image item, still allow capturing
		// collection-level simple properties like Left/Top that sometimes
		// appear around the Images block in DFM files.
		if (!currentImage) {
			// Left
			const collLeftMatch = trimmed.match(/^Left\s*=\s*(\d+)$/i);
			if (collLeftMatch) {
				collectionProps.Left = Number(collLeftMatch[1]);
				continue;
			}

			// Top
			const collTopMatch = trimmed.match(/^Top\s*=\s*(\d+)$/i);
			if (collTopMatch) {
				collectionProps.Top = Number(collTopMatch[1]);
				continue;
			}

			// If not a collection-level property, skip until we find an item
			continue;
		}

		// Name
		const nameMatch = trimmed.match(/^Name\s*=\s*'(.*)'$/i);
		if (nameMatch) {
			currentImage.name = nameMatch[1].replace(/''/g, "'");
			continue;
		}

		// Description
		const descMatch = trimmed.match(/^Description\s*=\s*'(.*)'$/i);
		if (descMatch) {
			currentImage.description = descMatch[1].replace(/''/g, "'");
			continue;
		}

		const leftMatch = trimmed.match(/^Left\s*=\s*(\d+)$/i);

		if (leftMatch) {
			currentImage.left = Number(leftMatch[1]);
			continue;
		}

		const topMatch = trimmed.match(/^Top\s*=\s*(\d+)$/i);

		if (topMatch) {
			currentImage.top = Number(topMatch[1]);
			continue;
		}

		// SourceImages = <
		if (trimmed.startsWith('SourceImages')) {
			inSourceImages = true;
			continue;
		}

		// End SourceImages collection
		if (trimmed === 'end>' && inSourceImages) {
			// Peek ahead.
			// Another end> means source image item ended.
			// A plain end means image item ended.
			const nextLine = index + 1 < lines.length ? lines[index + 1].trim() : '';

			if (nextLine === 'end') {
				inSourceImages = false;
			}

			continue;
		}

		// Image.Data
		if (trimmed.startsWith('Image.Data')) {
			const imageLines: string[] = [];

			// First line might contain hex after {
			const openBracePos = trimmed.indexOf('{');

			let firstPart = openBracePos >= 0 ? trimmed.substring(openBracePos + 1).trim() : '';

			if (firstPart && firstPart !== '}') {
				imageLines.push(firstPart.replace('}', ''));
			}

			// Read until closing brace
			for (index += 1; index < lines.length; index++) {
				const imageLine = lines[index].trim();

				if (imageLine.includes('}')) {
					imageLines.push(
						imageLine.replace('}', '').trim()
					);

					break;
				}

				imageLines.push(imageLine);
			}

			currentImage.imageData =
				imageLines.join('').trim();

			continue;
		}
	}

	return {
		images,
		endIndex: index,
		collectionProps: Object.keys(collectionProps).length ? collectionProps : undefined
	};
}

export function parseDfm(text: string): DfmComponent[] {
	const roots: DfmComponent[] = [];
	const stack: DfmComponent[] = [];
	const lines = text.split(/\r?\n/);

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const objectMatch = line.match(/^\s*object\s+(\w+)\s*:\s*(\w+)/);

		if (objectMatch) {
			const component: DfmComponent = {
				name: objectMatch[1],
				className: objectMatch[2],
				properties: {},
				children: [],
				lineNumber: index,
				endLine: index,
				widthLine: -1,
				heightLine: -1,
				leftLine: -1,
				topLine: -1
			};

			if (stack.length > 0) {
				stack[stack.length - 1].children.push(component);
			} else {
				roots.push(component);
			}

			stack.push(component);
			continue;
		}

		if (line.trim() === 'end') {
			if (stack.length > 0) {
				stack[stack.length - 1].endLine = index;
			}
			stack.pop();
			continue;
		}

		const propertyMatch = line.match(/^\s*([\w.]+)\s*=\s*(.+)$/);

		if (propertyMatch && stack.length > 0) {
			const propertyName = normalizePropertyName(propertyMatch[1]);
			const rawValue = propertyMatch[2].trim();

			// Debug logging removed to reduce noise during parsing

			if (rawValue.startsWith('{')) {
				const blockLines: string[] = [];
				for (index += 1; index < lines.length; index++) {
					const blockLine = lines[index];
					const trimmedLine = blockLine.trim();
					if (trimmedLine === '}') {
						break;
					}
					if (trimmedLine === 'end' || /^object\s+\w+\s*:\s*\w+/i.test(trimmedLine)) {
						index -= 1;
						break;
					}
					blockLines.push(trimmedLine);
				}
				stack[stack.length - 1].properties[propertyName] = blockLines.join('').trim();
				continue;
			}

			if (rawValue.startsWith('(')) {
				const blockLines: string[] = [];
				for (index += 1; index < lines.length; index++) {
					const blockLine = lines[index];
					const trimmedLine = blockLine.trim();
					if (trimmedLine === 'end' || /^object\s+\w+\s*:\s*\w+/i.test(trimmedLine)) {
						index -= 1;
						break;
					}

					if (trimmedLine === ')') {
						break;
					}

					if (trimmedLine.endsWith(')')) {
						blockLines.push(trimmedLine.slice(0, -1).trim());
						break;
					}

					blockLines.push(trimmedLine);
				}

				if (propertyName === 'LinesStrings') {
					stack[stack.length - 1].properties[propertyName] = blockLines
						.filter(line => line.length > 0)
						.map(line => line.startsWith("'") && line.endsWith("'")
							? line.slice(1, -1).replace(/''/g, "'")
							: line)
						.join('\n');
				} else {
					stack[stack.length - 1].properties[propertyName] = blockLines.join(' ').trim();
				}
				continue;
			}

			if (
				stack.length > 0 &&
				['ColumnCollection', 'RowCollection', 'ControlCollection'].includes(propertyName) &&
				rawValue.startsWith('<')
			) {
				const result = parseCollectionItems(lines, index + 1);
				stack[stack.length - 1].properties[propertyName] = result.items;
				index = result.endIndex;
				continue;
			}

			if (
				stack.length > 0 &&
				stack[stack.length - 1].className === 'TImageCollection' &&
				propertyName === 'Images' &&
				rawValue.startsWith('<')
			) {
				const result = parseImageCollection(lines, index + 1);
				stack[stack.length - 1].properties.Images = JSON.stringify(result.images);
				if (result.collectionProps) {
					if (result.collectionProps.Left !== undefined && !stack[stack.length - 1].properties.Left) {
						stack[stack.length - 1].properties.Left = String(result.collectionProps.Left);
					}
					if (result.collectionProps.Top !== undefined && !stack[stack.length - 1].properties.Top) {
						stack[stack.length - 1].properties.Top = String(result.collectionProps.Top);
					}
				}
				let peek = result.endIndex + 1;
				for (; peek < lines.length; peek++) {
					const t = lines[peek].trim();
					if (t === 'end' || /^object\s+\w+\s*:\s*\w+/i.test(t)) {
						break;
					}
					const lmatch = t.match(/^Left\s*=\s*(\d+)$/i);
					if (lmatch && !stack[stack.length - 1].properties.Left) {
						stack[stack.length - 1].properties.Left = lmatch[1];
						continue;
					}
					const tmatch = t.match(/^Top\s*=\s*(\d+)$/i);
					if (tmatch && !stack[stack.length - 1].properties.Top) {
						stack[stack.length - 1].properties.Top = tmatch[1];
						continue;
					}
				}
				index = Math.max(result.endIndex, peek - 1);
				continue;
			}

			if (
				stack.length > 0 &&
				rawValue.startsWith('<')
			) {
				const endIndex = skipCollectionBlock(lines, index + 1);
				index = endIndex;
				stack[stack.length - 1].properties[propertyName] = rawValue;
				continue;
			}

			stack[stack.length - 1].properties[propertyName] = propertyMatch[2];
		}
	}

	// Post-process: map Left/Top lines to the nearest preceding object declaration.
	// This is robust for very large Images blocks where those properties end up
	// far after the initial declaration.
	const decls: Array<{name:string, index:number}> = [];
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(/^\s*object\s+(\w+)\s*:\s*(\w+)/);
		if (m) { decls.push({ name: m[1], index: i }); }
	}

	// Find all Left/Top occurrences and assign to the nearest preceding declaration
	for (let i = 0; i < lines.length; i++) {
		const l = lines[i].match(/^\s*Left\s*=\s*(\d+)$/i);
		const t = lines[i].match(/^\s*Top\s*=\s*(\d+)$/i);
		if (!l && !t) { continue; }
		// find decl with highest index <= i
		let best: {name:string,index:number} | null = null;
		for (const d of decls) {
			if (d.index <= i && (!best || d.index > best.index)) { best = d; }
		}
		if (!best) { continue; }
		// find component in roots
		const comp = findComponentByName(roots, best.name);
		if (!comp) { continue; }
		if (l && !comp.properties.Left) { comp.properties.Left = l[1]; }
		if (t && !comp.properties.Top) { comp.properties.Top = t[1]; }
	}

	return roots;
}
