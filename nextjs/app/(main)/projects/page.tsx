"use client";

import { useState, useEffect, useCallback } from "react";
import ProjectModal, { ProjectData } from "@/components/projects/new-project-modal";

interface Project {
  id: string;
  name: string;
  urls: string[];
  content: string;
  db_type: string | null;
  db_name: string | null;
  db_host: string | null;
  db_port: number | null;
  db_database: string | null;
  db_user: string | null;
  db_password: string | null;
  db_ssl: boolean;
  db_schema: Record<string, unknown> | null;
  r2rml_mapping: string | null;
  created_at: string;
  updated_at: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectData | null>(null);
  const [defaultProjectId, setDefaultProjectId] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const response = await fetch("/api/projects");
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchDefaultProject = useCallback(async () => {
    try {
      const response = await fetch("/api/users/default-project");
      if (response.ok) {
        const data = await response.json();
        setDefaultProjectId(data.projectId || null);
      }
    } catch (error) {
      console.error("Error fetching default project:", error);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    fetchDefaultProject();
  }, [fetchProjects, fetchDefaultProject]);

  const handleSetDefault = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    try {
      const response = await fetch("/api/users/default-project", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (response.ok) {
        setDefaultProjectId(projectId);
        // Dispatch event so sidebar can pick up the change
        window.dispatchEvent(new CustomEvent("defaultProjectChanged"));
      }
    } catch (error) {
      console.error("Error setting default project:", error);
    }
  };

  const handleOpenCreate = () => {
    setEditingProject(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (project: Project) => {
    setEditingProject(project);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProject(null);
  };

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this project?")) return;
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
        // If we deleted the default project, refresh to get the updated state
        if (projectId === defaultProjectId) {
          setDefaultProjectId(null);
          window.dispatchEvent(new CustomEvent("defaultProjectChanged"));
        }
      }
    } catch (error) {
      console.error("Error deleting project:", error);
    }
  };

  return (
    <div className="flex h-full flex-col p-8 overflow-y-auto">
      <div className="max-w-4xl w-full mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Projects</h1>
            <p className="text-gray-500 text-sm">
              Manage your projects and data sources.
            </p>
          </div>
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Project
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <svg
              className="h-8 w-8 animate-spin text-brand-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
            <svg
              className="mx-auto h-10 w-10 text-gray-300 mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M2 12.5c0-3.287 0-4.931.908-6.038a4 4 0 01.554-.554C4.57 5 6.213 5 9.5 5h5c3.287 0 4.931 0 6.038.908.204.166.388.35.554.554C22 7.57 22 9.213 22 12.5s0 4.931-.908 6.038a4.002 4.002 0 01-.554.554C19.43 20 17.787 20 14.5 20h-5c-3.287 0-4.931 0-6.038-.908a4.002 4.002 0 01-.554-.554C2 17.43 2 15.787 2 12.5z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v6m3-3H9"
              />
            </svg>
            <p className="text-sm text-gray-400 mb-4">
              No projects yet. Create your first project to get started.
            </p>
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New Project
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                role="button"
                tabIndex={0}
                onClick={() => handleOpenEdit(project)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleOpenEdit(project); }}
                className={`group rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                  defaultProjectId === project.id
                    ? "border-brand-300 ring-1 ring-brand-100"
                    : "border-gray-200 hover:border-brand-200"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-gray-900 truncate">
                        {project.name}
                      </h3>
                      {defaultProjectId === project.id && (
                        <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 border border-brand-200">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Created{" "}
                      {new Date(project.created_at).toLocaleDateString(
                        "en-US",
                        { year: "numeric", month: "short", day: "numeric" }
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {defaultProjectId !== project.id && (
                      <button
                        onClick={(e) => handleSetDefault(e, project.id)}
                        className="opacity-0 group-hover:opacity-100 rounded-lg px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-brand-50 hover:text-brand-600 border border-transparent hover:border-brand-200 transition-all"
                        title="Set as default project"
                      >
                        Set as Default
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEdit(project);
                      }}
                      className="opacity-0 group-hover:opacity-100 rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-600 transition-all"
                      title="Edit project"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => handleDeleteProject(e, project.id)}
                      className="opacity-0 group-hover:opacity-100 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all"
                      title="Delete project"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Tags / Metadata row */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {project.urls && project.urls.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                        />
                      </svg>
                      {project.urls.length} URL{project.urls.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {project.db_type && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                        />
                      </svg>
                      {project.db_type}
                      {project.db_name ? ` - ${project.db_name}` : ""}
                    </span>
                  )}
                  {project.db_host && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
                      {project.db_host}
                      {project.db_port ? `:${project.db_port}` : ""}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal - handles both create and edit */}
      <ProjectModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSaved={() => {
          fetchProjects();
          fetchDefaultProject();
          window.dispatchEvent(new CustomEvent("defaultProjectChanged"));
        }}
        project={editingProject}
      />
    </div>
  );
}
