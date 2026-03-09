import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["src/**/*.integration.test.ts"],
        testTimeout: 60000,   // containers can be slow to start
        hookTimeout: 60000,
        pool: "forks",        // isolate each file in a separate process
        poolOptions: {
            forks: { singleFork: false },
        },
        reporters: ["verbose"],
    },
});
