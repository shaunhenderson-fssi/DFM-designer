export interface DfmComponent {
	name: string;
	className: string;
	properties: Record<string, string>;
	children: DfmComponent[];
	lineNumber: number;
	endLine: number;
	widthLine: number;
	heightLine: number;
	leftLine: number;
	topLine: number;
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

			if (rawValue === '{') {
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

			if (rawValue === '(') {
				const blockLines: string[] = [];
				for (index += 1; index < lines.length; index++) {
					const blockLine = lines[index];
					const trimmedLine = blockLine.trim();
					if (trimmedLine === ')') {
						break;
					}
					if (trimmedLine === 'end' || /^object\s+\w+\s*:\s*\w+/i.test(trimmedLine)) {
						index -= 1;
						break;
					}
					blockLines.push(trimmedLine);
				}
				stack[stack.length - 1].properties[propertyName] = blockLines.join(' ').trim();
				continue;
			}

			stack[stack.length - 1].properties[propertyName] = propertyMatch[2];
		}
	}

	return roots;
}
