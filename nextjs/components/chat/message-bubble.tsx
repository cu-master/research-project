"use client";

import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/types/chat";

type Props = {
  message: Message;
};

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const content = message.content?.trim() 
    ? message.content 
    : isUser 
      ? "…" 
      : "Thinking...";

  return (
    <article
      className={clsx(
        "flex w-full gap-4 px-4 py-6 md:gap-6 md:px-0",
        isUser ? "flex-row-reverse" : "bg-transparent"
      )}
      aria-live={isUser ? undefined : "polite"}
    >
      <div className={clsx("relative overflow-hidden", isUser ? "max-w-[85%] flex justify-end" : "w-full")}>
        {message.toolsUsed && message.toolsUsed.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Tools Used
            </div>
            {message.toolsUsed.map((tool, index) => (
              <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-slate-700">
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                    {tool.tool}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  <div className="font-medium text-slate-500 mb-1">Input:</div>
                  <pre className="overflow-x-auto rounded bg-slate-100 p-2 font-mono">
                    {tool.input}
                  </pre>
                </div>
                {tool.observation && (
                  <div className="mt-2 text-xs text-slate-600">
                    <div className="font-medium text-slate-500 mb-1">Result:</div>
                    <pre className="max-h-32 overflow-y-auto overflow-x-auto rounded bg-slate-100 p-2 font-mono">
                      {tool.observation}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {message.latency && (
          <div className="mb-2 text-xs text-slate-400 italic">
            Thinking time: {message.latency.toFixed(1)}s
          </div>
        )}

        <div className={clsx(
          "prose prose-slate prose-base max-w-none break-words text-[#0D0D0D]",
          isUser ? "w-fit bg-gray-100 rounded-3xl px-5 py-2 text-left" : ""
        )}>
          {content === "Thinking..." ? (
            <p className="text-slate-500 italic">Thinking...</p>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-3 last:mb-0 text-[#0D0D0D]">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold text-[#0D0D0D]">{children}</strong>,
                em: ({ children }) => <em className="italic text-[#0D0D0D]">{children}</em>,
                li: ({ children }) => <li className="text-[#0D0D0D]">{children}</li>,
                code: ({ children }) => <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm font-mono text-[#0D0D0D]">{children}</code>,
                h1: ({ children }) => <h1 className="text-2xl font-bold text-[#0D0D0D]">{children}</h1>,
                h2: ({ children }) => <h2 className="text-xl font-bold text-[#0D0D0D]">{children}</h2>,
                h3: ({ children }) => <h3 className="text-lg font-semibold text-[#0D0D0D]">{children}</h3>,
                h4: ({ children }) => <h4 className="text-base font-semibold text-[#0D0D0D]">{children}</h4>,
                a: ({ children, href }) => <a href={href} className="text-blue-600 underline hover:text-blue-800">{children}</a>,
              }}
            >
              {content}
            </ReactMarkdown>
          )}
        </div>

      </div>
    </article>
  );
}

