import React from "react";
import { Highlight, themes } from "prism-react-renderer";

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
}

export function CodeBlock({ code, language = "typescript", showLineNumbers = false }: CodeBlockProps) {
  return (
    <Highlight theme={themes.vsDark} code={code} language={language}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre className={`${className} p-4 rounded-md overflow-x-auto text-sm font-mono border border-border bg-black/40`} style={{ ...style, backgroundColor: "transparent" }}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })} className="table-row">
              {showLineNumbers && (
                <span className="table-cell text-right pr-4 select-none opacity-50 text-xs">
                  {i + 1}
                </span>
              )}
              <span className="table-cell">
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </span>
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}
