import { create } from "zustand";
import { type DotnetSolution } from "./solutionParser";
import { discoverSolutions } from "./solutionDiscovery";

type DotnetState = {
  solutions: DotnetSolution[];
  isLoading: boolean;
  activeProject: string | null;
  selectedSolution: DotnetSolution | null;
  refreshSolutions: (workspaceRoot: string) => Promise<void>;
  setActiveProject: (projectPath: string | null) => void;
  selectSolution: (solution: DotnetSolution | null) => void;
};

export const useDotnetStore = create<DotnetState>((set) => ({
  solutions: [],
  isLoading: false,
  activeProject: null,
  selectedSolution: null,

  refreshSolutions: async (workspaceRoot: string) => {
    if (!workspaceRoot) {
      set({ solutions: [], selectedSolution: null });
      return;
    }
    set({ isLoading: true });
    try {
      const discovered = await discoverSolutions(workspaceRoot);
      set((state) => ({
        solutions: discovered,
        isLoading: false,
        selectedSolution:
          discovered.find((s) => s.path === state.selectedSolution?.path) ??
          discovered[0] ??
          null,
      }));
    } catch {
      set({ isLoading: false });
    }
  },

  setActiveProject: (projectPath: string | null) => {
    set({ activeProject: projectPath });
  },

  selectSolution: (solution: DotnetSolution | null) => {
    set({ selectedSolution: solution });
  },
}));
