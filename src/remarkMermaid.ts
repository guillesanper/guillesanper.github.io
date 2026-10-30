import type { RemarkPlugin } from '@astrojs/markdown-remark';
import { visit } from 'unist-util-visit';

/**
 * Turns ```mermaid fences into the same figure `Diagram.astro` renders, so a
 * diagram in a project body and the one in the page header share markup,
 * styles and the client-side renderer. The source stays in the page as text:
 * without JavaScript the reader still gets the diagram definition.
 *
 * A caption can be given in the fence meta: ```mermaid caption="..."
 */
export const remarkMermaid: RemarkPlugin = () => {
	return (tree: unknown) => {
		visit(tree as any, 'code', (node: any, index, parent: any) => {
			if (node.lang !== 'mermaid' || !parent || index === undefined) {
				return;
			}
			const caption = /caption="([^"]*)"/.exec(node.meta ?? '')?.[1];
			parent.children[index] = mermaidFigure(node.value, caption);
		});
	};
};

/** An mdast node that mdast-util-to-hast turns into the figure via `data.hName`. */
function mermaidFigure(source: string, caption?: string) {
	const children: any[] = [
		{
			type: 'element',
			tagName: 'pre',
			properties: { className: ['diagram-canvas', 'mermaid-source'], ...(caption && { ariaLabel: caption }) },
			children: [{ type: 'text', value: source }]
		}
	];
	if (caption) {
		children.push({
			type: 'element',
			tagName: 'figcaption',
			properties: { className: ['diagram-caption'] },
			children: [{ type: 'text', value: caption }]
		});
	}
	return {
		type: 'mermaidFigure',
		data: {
			hName: 'figure',
			hProperties: { className: ['diagram', 'not-prose'] },
			hChildren: children
		}
	};
}
