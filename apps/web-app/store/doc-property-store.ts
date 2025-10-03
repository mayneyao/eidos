import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { FieldType } from "@/packages/core/fields/const";

/**
 * Property type information
 */
export interface PropertyType {
  name: string;
  type: FieldType;
}

interface DocPropertyState {
  // State
  propertyTypes: PropertyType[];
  loading: boolean;
  error: string | null;
  initialized: boolean;

  // Actions
  setPropertyTypes: (propertyTypes: PropertyType[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updatePropertyType: (propertyName: string, newType: FieldType) => void;
  removeProperty: (propertyName: string) => void;
  reset: () => void;
}

export const useDocPropertyStore = create<DocPropertyState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    propertyTypes: [],
    loading: false,
    error: null,
    initialized: false,

    // Actions
    setPropertyTypes: (propertyTypes) =>
      set({ propertyTypes, initialized: true, error: null }),

    setLoading: (loading) => set({ loading }),

    setError: (error) => set({ error, loading: false }),

    updatePropertyType: (propertyName, newType) =>
      set((state) => ({
        propertyTypes: state.propertyTypes.map((prop) =>
          prop.name === propertyName ? { ...prop, type: newType } : prop
        ),
      })),

    removeProperty: (propertyName) =>
      set((state) => ({
        propertyTypes: state.propertyTypes.filter((prop) => prop.name !== propertyName),
      })),

    reset: () => set({
      propertyTypes: [],
      loading: false,
      error: null,
      initialized: false,
    }),
  })));

// Selectors for better performance
export const useDocPropertySelectors = () => {
  const state = useDocPropertyStore();

  return {
    // Computed values
    propertyTypeMap: state.propertyTypes.reduce((map, prop) => {
      map[prop.name] = prop.type;
      return map;
    }, {} as Record<string, FieldType>),

    customPropertyTypes: state.propertyTypes.filter(prop => {
      const reservedProperties = ['id', 'content', 'markdown', 'is_day_page', 'meta', 'created_at', 'updated_at'];
      return !reservedProperties.includes(prop.name);
    }),

    // Helper functions
    getPropertyType: (propertyName: string): FieldType | undefined => {
      const propertyTypeMap = state.propertyTypes.reduce((map, prop) => {
        map[prop.name] = prop.type;
        return map;
      }, {} as Record<string, FieldType>);
      return propertyTypeMap[propertyName];
    },

    hasProperty: (propertyName: string): boolean => {
      const propertyTypeMap = state.propertyTypes.reduce((map, prop) => {
        map[prop.name] = prop.type;
        return map;
      }, {} as Record<string, FieldType>);
      return propertyName in propertyTypeMap;
    },

    // State
    ...state,
  };
};
