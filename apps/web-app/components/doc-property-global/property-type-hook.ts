import { useCallback, useEffect } from "react";

import { useSqlite } from "@/apps/web-app/hooks/use-sqlite";
import type { EidosDataEventChannelMsg } from "@/lib/const";
import { DataUpdateSignalType, EidosDataEventChannelMsgType, EidosDataEventChannelName } from "@/lib/const";
import { ColumnTableName, DocTableName } from "@/packages/core/sqlite/const";
import type { FieldType } from "@/packages/core/fields/const";
import { useDocPropertyStore, useDocPropertySelectors, PropertyType } from "@/apps/web-app/store/doc-property-store";

// Re-export PropertyType for backward compatibility
export type { PropertyType } from "@/apps/web-app/store/doc-property-store";

/**
 * State-managed hook for document property types (global for eidos__docs table)
 * Now uses Zustand store for global state management to avoid frequent fetching
 * This hook manages property types for the entire docs table, not specific documents
 */
export const useDocPropertyTypes = () => {
    const { sqlite } = useSqlite();

    // Use individual selectors to avoid creating new objects on each render
    const propertyTypes = useDocPropertyStore((state) => state.propertyTypes);
    const loading = useDocPropertyStore((state) => state.loading);
    const error = useDocPropertyStore((state) => state.error);
    const initialized = useDocPropertyStore((state) => state.initialized);

    // Computed values with stable references
    const propertyTypeMap = useCallback(() => {
        return propertyTypes.reduce((map, prop) => {
            map[prop.name] = prop.type;
            return map;
        }, {} as Record<string, FieldType>);
    }, [propertyTypes]);

    const customPropertyTypes = useCallback(() => {
        const reservedProperties = ['id', 'content', 'markdown', 'is_day_page', 'meta', 'created_at', 'updated_at'];
        return propertyTypes.filter(prop => !reservedProperties.includes(prop.name));
    }, [propertyTypes]);

    const getPropertyType = useCallback((propertyName: string): FieldType | undefined => {
        const typeMap = propertyTypeMap();
        return typeMap[propertyName];
    }, [propertyTypeMap]);

    const hasProperty = useCallback((propertyName: string): boolean => {
        const typeMap = propertyTypeMap();
        return propertyName in typeMap;
    }, [propertyTypeMap]);

    /**
     * Get all property types for the document
     */
    const getPropertyTypes = useCallback(async () => {
        if (!sqlite) return;

        const { setLoading, setError, setPropertyTypes } = useDocPropertyStore.getState();

        setLoading(true);
        setError(null);

        try {
            const types = await sqlite.doc.getPropertyTypes();
            setPropertyTypes(types);
        } catch (err) {
            console.error('Failed to get property types:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to get property types';
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    }, [sqlite]);

    /**
     * Change the type of a property
     * @param propertyName - The name of the property to change
     * @param newType - The new field type
     */
    const changePropertyType = useCallback(
        async (propertyName: string, newType: FieldType) => {
            if (!sqlite) return { success: false, message: 'SQLite not available' };

            try {
                await sqlite.doc.changePropertyType(propertyName, newType);

                // Update global state immediately
                const { updatePropertyType } = useDocPropertyStore.getState();
                updatePropertyType(propertyName, newType);

                return { success: true };
            } catch (err) {
                console.error('Failed to change property type:', err);
                const message = err instanceof Error ? err.message : 'Failed to change property type';
                const { setError } = useDocPropertyStore.getState();
                setError(message);
                return { success: false, message };
            }
        },
        [sqlite]
    );

    /**
     * Delete a property permanently from all documents
     * @param propertyName - The name of the property to delete
     */
    const deleteProperty = useCallback(
        async (propertyName: string) => {
            if (!sqlite) {
                return { success: false, message: 'SQLite not available' };
            }

            try {
                await sqlite.doc.deleteProperty(propertyName);

                // Update global state immediately - remove the property
                const { removeProperty } = useDocPropertyStore.getState();
                removeProperty(propertyName);

                return { success: true };
            } catch (err) {
                console.error('Failed to delete property:', err);
                const message = err instanceof Error ? err.message : 'Failed to delete property';
                const { setError } = useDocPropertyStore.getState();
                setError(message);
                throw err; // Re-throw so the UI can handle it
            }
        },
        [sqlite]
    );

    // Initial load - only if not already initialized to avoid frequent fetching
    useEffect(() => {
        if (!initialized && sqlite) {
            getPropertyTypes();
        }
    }, [getPropertyTypes, initialized, sqlite]);

    // Listen for data changes via broadcast channel
    useEffect(() => {
        const bc = new BroadcastChannel(EidosDataEventChannelName);

        const handler = async (ev: MessageEvent<EidosDataEventChannelMsg>) => {
            const { type, payload } = ev.data;

            if (type === EidosDataEventChannelMsgType.SchemaUpdateSignalType) {
                const { table, type: updateType } = payload;
                // Only react to changes for the docs table (global table structure changes)
                if (table !== DocTableName) return;

                switch (updateType) {
                    case DataUpdateSignalType.AddColumn:
                    case DataUpdateSignalType.DeleteColumn:
                        // Refresh property types when table structure changes
                        await getPropertyTypes();
                        break;
                    default:
                        break;
                }
            }
        };

        bc.addEventListener("message", handler);

        return () => {
            bc.removeEventListener("message", handler);
            bc.close();
        };
    }, [getPropertyTypes]);

    return {
        propertyTypes,
        customPropertyTypes: customPropertyTypes(),
        propertyTypeMap: propertyTypeMap(),
        loading,
        error,
        getPropertyTypes,
        changePropertyType,
        deleteProperty,
        getPropertyType,
        hasProperty,
    };
};
