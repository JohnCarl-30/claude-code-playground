import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Claude's replies are Markdown: render tables, lists, code blocks and links. */
export function ClaudeText({ text }: { text: string }) {
  return (
    <div className="md mt-0.5 leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
