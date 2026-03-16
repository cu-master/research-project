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
  const content = message.content?.trim() ? message.content : isUser ? "…" : "";
  const progressSteps = message.progressSteps ?? [];
  const hasProgress = progressSteps.length > 0;
  const runningToolName =
    progressSteps.find((step) => step.status === "running")?.tool ??
    progressSteps[progressSteps.length - 1]?.tool;

  return (
    <article
      className={clsx(
        "flex w-full gap-3 px-4 py-3 md:gap-4 md:px-0 md:py-4",
        isUser ? "flex-row-reverse" : "bg-transparent"
      )}
      aria-live={isUser ? undefined : "polite"}
    >
      <div
        className={clsx(
          "relative",
          isUser ? "max-w-[85%] flex justify-end overflow-hidden" : "w-full overflow-visible"
        )}
      >
        {!isUser && hasProgress && runningToolName && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="relative inline-flex h-3 w-3 items-center justify-center">
              <span className="absolute h-5 w-5 rounded-full ring-2 ring-cyan-400/60 animate-[ringPulse_1.6s_ease-out_infinite]" />
              <span className="absolute h-7 w-7 rounded-full ring-2 ring-violet-400/35 animate-[ringPulse_1.6s_ease-out_infinite_250ms]" />
              <span className="absolute inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />
            </span>
            <span className="font-medium text-slate-600">Running Tools:</span>
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
              {runningToolName}
            </span>
          </div>
        )}

        {message.toolsUsed && message.toolsUsed.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-slate-600">Tools Used:</span>
            {message.toolsUsed.map((tool, index) => (
              <span key={index} className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                {tool.tool}
              </span>
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
          {!isUser && !content ? null : (
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
      <style jsx>{`
        @keyframes ringPulse {
          0% {
            transform: scale(0.55);
            opacity: 0.7;
          }
          70% {
            transform: scale(1);
            opacity: 0.15;
          }
          100% {
            transform: scale(1.05);
            opacity: 0;
          }
        }
      `}</style>
    </article>
  );
}

