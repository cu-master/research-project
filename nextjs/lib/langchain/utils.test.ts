import { describe, it, expect } from "vitest";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import {
    extractText,
    serializeToolInput,
    buildMessageContent,
    convertToLangChainMessage,
} from "./utils";

describe("extractText", () => {
    it("returns empty string for null", () => {
        expect(extractText(null)).toBe("");
    });

    it("returns empty string for undefined", () => {
        expect(extractText(undefined)).toBe("");
    });

    it("passes a string through unchanged", () => {
        expect(extractText("hello")).toBe("hello");
    });

    it("joins an array of strings with double newlines", () => {
        const result = extractText(["foo", "bar"]);
        expect(result).toBe("foo\n\nbar");
    });

    it("filters empty chunks from arrays", () => {
        const result = extractText(["foo", "", "bar"]);
        expect(result).toBe("foo\n\nbar");
    });

    it("extracts from { text } object", () => {
        expect(extractText({ text: "hello" })).toBe("hello");
    });

    it("extracts from { content } object (recursive)", () => {
        expect(extractText({ content: "world" })).toBe("world");
    });

    it("extracts from { output } object (recursive)", () => {
        expect(extractText({ output: "result" })).toBe("result");
    });

    it("JSON-serialises an unknown object", () => {
        const obj = { foo: 42 };
        expect(extractText(obj)).toBe(JSON.stringify(obj));
    });

    it("handles nested arrays recursively", () => {
        const result = extractText([["a", "b"], "c"]);
        expect(result).toContain("a");
        expect(result).toContain("b");
        expect(result).toContain("c");
    });

    it("converts numbers via String()", () => {
        expect(extractText(42 as unknown as string)).toBe("42");
    });
});

describe("serializeToolInput", () => {
    it("passes a string through unchanged", () => {
        expect(serializeToolInput("raw")).toBe("raw");
    });

    it("serialises a plain object to pretty JSON", () => {
        const result = serializeToolInput({ key: "value" });
        expect(result).toBe(JSON.stringify({ key: "value" }, null, 2));
    });

    it("serialises an array to JSON", () => {
        const result = serializeToolInput([1, 2, 3]);
        expect(result).toBe(JSON.stringify([1, 2, 3], null, 2));
    });

    it("returns String() fallback for non-serialisable values", () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        const result = serializeToolInput(circular);
        expect(typeof result).toBe("string");
    });
});

describe("buildMessageContent", () => {
    it("trims leading and trailing whitespace", () => {
        expect(buildMessageContent("  hello  ")).toBe("hello");
    });

    it("returns empty string for whitespace-only input", () => {
        expect(buildMessageContent("   ")).toBe("");
    });

    it("leaves already-clean content unchanged", () => {
        expect(buildMessageContent("clean")).toBe("clean");
    });
});

describe("convertToLangChainMessage", () => {
    it("converts a user message to HumanMessage", () => {
        const msg = convertToLangChainMessage({ role: "user", content: "Hi" });
        expect(msg).toBeInstanceOf(HumanMessage);
        expect((msg as HumanMessage).content).toBe("Hi");
    });

    it("converts an assistant message to AIMessage", () => {
        const msg = convertToLangChainMessage({ role: "assistant", content: "Hello" });
        expect(msg).toBeInstanceOf(AIMessage);
    });

    it("returns null for empty content", () => {
        const msg = convertToLangChainMessage({ role: "user", content: "" });
        expect(msg).toBeNull();
    });

    it("returns null for whitespace-only content", () => {
        const msg = convertToLangChainMessage({ role: "user", content: "   " });
        expect(msg).toBeNull();
    });

    it("trims whitespace from content before creating message", () => {
        const msg = convertToLangChainMessage({ role: "user", content: "  hello  " });
        expect((msg as HumanMessage).content).toBe("hello");
    });
});
