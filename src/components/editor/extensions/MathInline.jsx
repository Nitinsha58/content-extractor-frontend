import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import { guardedNodeView } from "./utils";
import { useCallback, useEffect, useRef, useState } from "react";
import katex from "katex";

function MathInlineView({ node, updateAttributes, selected }) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(node.attrs.latex);
	const inputRef = useRef(null);

	useEffect(() => {
		setDraft(node.attrs.latex);
	}, [node.attrs.latex]);

	useEffect(() => {
		if (editing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [editing]);

	const commit = useCallback(() => {
		setEditing(false);
		const trimmed = draft.trim();
		if (trimmed && trimmed !== node.attrs.latex) {
			try {
				updateAttributes({ latex: trimmed });
			} catch {
				/* editor destroyed during navigation */
			}
		} else {
			setDraft(node.attrs.latex);
		}
	}, [draft, node.attrs.latex, updateAttributes]);

	const handleKeyDown = (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			commit();
		}
		if (e.key === "Escape") {
			setDraft(node.attrs.latex);
			setEditing(false);
		}
		e.stopPropagation();
	};

	if (editing) {
		return (
			<NodeViewWrapper as="span" className="inline">
				<span className="inline-flex items-center gap-1 bg-blue-50 border border-blue-300 rounded px-1 py-0.5">
					<input
						ref={inputRef}
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onBlur={commit}
						onKeyDown={handleKeyDown}
						className="bg-transparent outline-none text-sm font-mono min-w-[60px]"
						style={{ width: `${Math.max(60, draft.length * 8)}px` }}
						spellCheck={false}
					/>
					{draft.trim() && (
						<span
							className="text-gray-600 ml-1 pointer-events-none"
							dangerouslySetInnerHTML={{
								__html: (() => {
									try {
										return katex.renderToString(draft, {
											throwOnError: false,
										});
									} catch {
										return '<span style="color:red">?</span>';
									}
								})(),
							}}
						/>
					)}
				</span>
			</NodeViewWrapper>
		);
	}

	let html;
	try {
		html = katex.renderToString(node.attrs.latex, { throwOnError: false });
	} catch {
		html = `<code>$${node.attrs.latex}$</code>`;
	}

	return (
		<NodeViewWrapper
			as="span"
			className={`inline cursor-pointer rounded px-0.5 transition-colors ${selected ? "bg-blue-100 ring-1 ring-blue-300" : "hover:bg-yellow-50"}`}
			onClick={() => setEditing(true)}>
			<span dangerouslySetInnerHTML={{ __html: html }} />
		</NodeViewWrapper>
	);
}

const MathInline = Node.create({
	name: "mathInline",
	group: "inline",
	inline: true,
	atom: true,

	addAttributes() {
		return { latex: { default: "" } };
	},

	parseHTML() {
		return [{ tag: "span[data-math-inline]" }];
	},

	renderHTML({ HTMLAttributes }) {
		return ["span", mergeAttributes({ "data-math-inline": "" }, HTMLAttributes)];
	},

	addNodeView() {
		return guardedNodeView(MathInlineView)
	},
});

export default MathInline;
