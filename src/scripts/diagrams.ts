// Renders every `.mermaid-source` on the page into an SVG. Mermaid is a heavy
// bundle, so it is imported only when a page actually has a diagram, and only once
// the first one is about to scroll into view.
//
// Colors come from the `--diagram-*` custom properties in global.css, so the
// diagrams follow the site palette, and they re-render when the theme toggle
// flips the `dark` class on <html>.

type Mermaid = typeof import('mermaid').default;

const canvases = [...document.querySelectorAll<HTMLElement>('.mermaid-source')];

if (canvases.length) {
	// The source is the element's text until it is replaced by the SVG.
	for (const canvas of canvases) {
		canvas.dataset.source = canvas.textContent ?? '';
	}

	let mermaid: Mermaid | undefined;
	let counter = 0;

	const token = (name: string) =>
		getComputedStyle(document.documentElement).getPropertyValue(`--diagram-${name}`).trim();

	const configure = (m: Mermaid) =>
		m.initialize({
			startOnLoad: false,
			theme: 'base',
			securityLevel: 'strict',
			fontFamily: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
			// Natural size, never squeezed: narrow screens scroll the canvas
			// instead of shrinking the labels below reading size.
			flowchart: { useMaxWidth: false, curve: 'basis', padding: 14, nodeSpacing: 28, rankSpacing: 44 },
			sequence: { useMaxWidth: false, mirrorActors: false, actorMargin: 64, messageFontWeight: 400 },
			themeVariables: {
				fontSize: '14px',
				background: 'transparent',
				primaryColor: token('node'),
				primaryBorderColor: token('border'),
				primaryTextColor: token('text'),
				secondaryColor: token('node'),
				tertiaryColor: token('node'),
				lineColor: token('line'),
				textColor: token('text'),
				clusterBkg: token('cluster'),
				clusterBorder: token('border'),
				edgeLabelBackground: token('surface'),
				actorBkg: token('node'),
				actorBorder: token('border'),
				actorTextColor: token('text'),
				actorLineColor: token('line'),
				signalColor: token('text'),
				signalTextColor: token('text'),
				labelBoxBkgColor: token('node'),
				labelBoxBorderColor: token('border'),
				labelTextColor: token('text'),
				noteBkgColor: token('cluster'),
				noteBorderColor: token('border'),
				noteTextColor: token('text'),
				activationBkgColor: token('cluster'),
				activationBorderColor: token('border')
			}
		});

	async function render(canvas: HTMLElement) {
		mermaid ??= (await import('mermaid')).default;
		configure(mermaid);
		// A left-to-right flowchart is unreadable on a phone: stack it instead.
		let source = canvas.dataset.source ?? '';
		if (canvas.clientWidth < 640) {
			source = source.replace(/^(\s*flowchart\s+)LR\b/, '$1TB');
		}
		try {
			const { svg } = await mermaid.render(`diagram-${++counter}`, source);
			canvas.innerHTML = svg;
			canvas.classList.add('is-rendered');
			canvas.classList.toggle('is-flowchart', /^\s*flowchart\b/.test(source));
			const svgEl = canvas.querySelector('svg');
			svgEl?.setAttribute('role', 'img');
			if (canvas.getAttribute('aria-label')) {
				svgEl?.setAttribute('aria-label', canvas.getAttribute('aria-label')!);
			}
		} catch (error) {
			// Leave the source visible: a diagram definition beats an empty box.
			console.error('Diagram failed to render', error);
		}
	}

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				observer.unobserve(entry.target);
				render(entry.target as HTMLElement);
			}
		},
		{ rootMargin: '400px 0px' }
	);
	canvases.forEach((canvas) => observer.observe(canvas));

	new MutationObserver(() => {
		canvases.filter((c) => c.classList.contains('is-rendered')).forEach(render);
	}).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}
