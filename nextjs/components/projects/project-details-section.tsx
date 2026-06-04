"use client";

import { inputClass, labelClass } from "./project-form";

interface ProjectDetailsSectionProps {
  name: string;
  setName: (value: string) => void;
}

// Section 1: Project name.
export function ProjectDetailsSection({ name, setName }: ProjectDetailsSectionProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
          1
        </div>
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          Project Details
        </h3>
      </div>
      <div>
        <label htmlFor="project-name" className={labelClass}>
          Project Name <span className="text-red-500">*</span>
        </label>
        <input
          id="project-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Project"
          required
          className={inputClass}
        />
      </div>
    </div>
  );
}
