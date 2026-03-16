import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
// ── Container lifecycle ───────────────────────────────────────────────────────

import { execSync } from "child_process";
let container: StartedPostgreSqlContainer | undefined;

const hasContainerRuntime = (() => {
    try {
        execSync("docker info", { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
})();

const itIfContainer = hasContainerRuntime ? it : it.skip;

let createProject: typeof import("./projects").createProject;
let getProject: typeof import("./projects").getProject;
let getProjectsByUser: typeof import("./projects").getProjectsByUser;
let updateProject: typeof import("./projects").updateProject;
let deleteProject: typeof import("./projects").deleteProject;

const USER_A = "00000000-0000-0000-0001-000000000001";
const USER_B = "00000000-0000-0000-0001-000000000002";

beforeAll(async () => {
    if (!hasContainerRuntime) {
        return;
    }

    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    process.env.DATABASE_URL = container.getConnectionUri();

    execSync("npx prisma db push --skip-generate", {
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
        stdio: "ignore"
    });

    const prisma = (await import("./prisma.js")).default;

    await prisma.user.createMany({
        data: [
            { id: USER_A, name: "User A", email: "usera@test.com", password_hash: "hash" },
            { id: USER_B, name: "User B", email: "userb@test.com", password_hash: "hash" }
        ],
        skipDuplicates: true
    });

    const mod = await import("./projects.js");
    createProject = mod.createProject;
    getProject = mod.getProject;
    getProjectsByUser = mod.getProjectsByUser;
    updateProject = mod.updateProject;
    deleteProject = mod.deleteProject;
}, 60_000);

afterAll(async () => {
    if (container) {
        await container.stop();
    }
});

// ── createProject / getProject ────────────────────────────────────────────────

describe("createProject / getProject", () => {
    itIfContainer("persists a new project and retrieves it by ID + owner", async () => {
        const project = await createProject(USER_A, { name: "My Project" });
        expect(project.id).toBeTruthy();
        expect(project.name).toBe("My Project");
        expect(project.user_id).toBe(USER_A);

        const found = await getProject(project.id, USER_A);
        expect(found).not.toBeNull();
        expect(found!.name).toBe("My Project");
    });

    itIfContainer("returns null when queried by a different user", async () => {
        const project = await createProject(USER_A, { name: "Private Project" });
        const found = await getProject(project.id, USER_B);
        expect(found).toBeNull();
    });

    itIfContainer("returns null for a non-existent project ID", async () => {
        const found = await getProject("00000000-dead-beef-0000-000000000000", USER_A);
        expect(found).toBeNull();
    });

    itIfContainer("persists DB connection fields when provided", async () => {
        const project = await createProject(USER_A, {
            name: "DB Project",
            db_type: "postgresql",
            db_host: "db.example.com",
            db_database: "mydb",
            db_user: "admin",
            db_ssl: true,
        });
        const found = await getProject(project.id, USER_A);
        expect(found!.db_type).toBe("postgresql");
        expect(found!.db_host).toBe("db.example.com");
        expect(found!.db_ssl).toBe(true);
    });

    itIfContainer("persists r2rml_mapping when provided", async () => {
        const mapping = "@prefix rr: <http://www.w3.org/ns/r2rml#> .";
        const project = await createProject(USER_A, { name: "R2RML Project", r2rml_mapping: mapping });
        const found = await getProject(project.id, USER_A);
        expect(found!.r2rml_mapping).toBe(mapping);
    });
});

// ── getProjectsByUser ─────────────────────────────────────────────────────────

describe("getProjectsByUser", () => {
    itIfContainer("returns only projects owned by the given user", async () => {
        await createProject(USER_A, { name: "A-proj-1" });
        await createProject(USER_B, { name: "B-proj-1" });

        const userAProjects = await getProjectsByUser(USER_A);
        userAProjects.forEach((p) => expect(p.user_id).toBe(USER_A));

        const userBProjects = await getProjectsByUser(USER_B);
        userBProjects.forEach((p) => expect(p.user_id).toBe(USER_B));
    });

    itIfContainer("returns an empty array for a user with no projects", async () => {
        const noProjects = await getProjectsByUser("00000000-0000-0000-0000-ffff00000000");
        expect(noProjects).toHaveLength(0);
    });
});

// ── updateProject ─────────────────────────────────────────────────────────────

describe("updateProject", () => {
    itIfContainer("updates the project name", async () => {
        const project = await createProject(USER_A, { name: "Old Name" });
        const updated = await updateProject(project.id, USER_A, { name: "New Name" });
        expect(updated?.name).toBe("New Name");
    });

    itIfContainer("updates the r2rml_mapping field", async () => {
        const project = await createProject(USER_A, { name: "Mapping Project" });
        const mapping = "@prefix rr: <http://www.w3.org/ns/r2rml#> . <#Map> rr:logicalTable [].";
        const updated = await updateProject(project.id, USER_A, { r2rml_mapping: mapping });
        expect(updated?.r2rml_mapping).toBe(mapping);
    });

    itIfContainer("does not update a project owned by a different user", async () => {
        const project = await createProject(USER_A, { name: "Owner A Project" });
        const updated = await updateProject(project.id, USER_B, { name: "Stolen Name" });
        expect(updated).toBeNull();
    });
});

// ── deleteProject ─────────────────────────────────────────────────────────────

describe("deleteProject", () => {
    itIfContainer("deletes a project and returns true", async () => {
        const project = await createProject(USER_A, { name: "To Delete" });
        const result = await deleteProject(project.id, USER_A);
        expect(result).toBe(true);

        const found = await getProject(project.id, USER_A);
        expect(found).toBeNull();
    });

    itIfContainer("returns false when trying to delete a non-existent project", async () => {
        const result = await deleteProject("00000000-dead-beef-0000-000000000001", USER_A);
        expect(result).toBe(false);
    });

    itIfContainer("returns false when trying to delete another user's project", async () => {
        const project = await createProject(USER_A, { name: "Not Yours" });
        const result = await deleteProject(project.id, USER_B);
        expect(result).toBe(false);
    });
});
