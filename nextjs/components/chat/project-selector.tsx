"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { FolderIcon, ChevronUpDownIcon } from "@heroicons/react/24/outline";

interface Project {
  id: string;
  name: string;
}

interface ProjectSelectorProps {
  sessionId: string | null;
  projectId: string | null;
  onProjectChange: (projectId: string | null) => void;
}

export default function ProjectSelector({
  sessionId,
  projectId,
  onProjectChange,
}: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch("/api/projects");
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error("Failed to load projects:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = async (selectedProjectId: string | null) => {
    setIsOpen(false);

    if (selectedProjectId === projectId) return;

    // If session exists, persist to backend
    if (sessionId) {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/project`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: selectedProjectId }),
        });

        if (!response.ok) {
          console.error("Failed to update session project");
          return;
        }
      } catch (error) {
        console.error("Error updating session project:", error);
        return;
      }
    }

    onProjectChange(selectedProjectId);
  };

  const selectedProject = projects.find((p) => p.id === projectId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-400">
        <FolderIcon className="h-3.5 w-3.5" />
        <span>Loading projects...</span>
      </div>
    );
  }

  if (projects.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300"
      >
        <FolderIcon className="h-3.5 w-3.5 text-gray-400" />
        <span className="max-w-[180px] truncate">
          {selectedProject ? selectedProject.name : "No project"}
        </span>
        <ChevronUpDownIcon className="h-3.5 w-3.5 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] max-w-[280px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <button
            onClick={() => handleSelect(null)}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-gray-50 ${
              !projectId
                ? "bg-gray-50 font-medium text-gray-900"
                : "text-gray-600"
            }`}
          >
            <span className="text-gray-400">--</span>
            <span>No project</span>
          </button>
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => handleSelect(project.id)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-gray-50 ${
                projectId === project.id
                  ? "bg-gray-50 font-medium text-gray-900"
                  : "text-gray-600"
              }`}
            >
              <FolderIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
              <span className="truncate">{project.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
