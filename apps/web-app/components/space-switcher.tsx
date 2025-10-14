import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDownIcon, PlusIcon, FolderIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentSpace, useCurrentSpaceId } from '@/hooks/use-current-space';
import { useSpace } from '@/hooks/use-space';
import { isDesktopMode } from '@/lib/env';

interface SpaceSwitcherProps {
  className?: string;
}

export function SpaceSwitcher({ className }: SpaceSwitcherProps) {
  const navigate = useNavigate();
  const { currentSpace, isLoading } = useCurrentSpace();
  const { spaceList, updateSpaceList } = useSpace();
  const [isSwitching, setIsSwitching] = useState(false);

  // Get full workspace list in desktop mode
  const [allSpaces, setAllSpaces] = useState<any[]>([]);

  useEffect(() => {
    const loadAllSpaces = async () => {
      if (isDesktopMode && typeof window !== 'undefined' && window.eidos) {
        try {
          const spaces = await window.eidos.invoke('list-spaces');
          setAllSpaces(spaces);
        } catch (error) {
          console.error('Failed to load spaces:', error);
        }
      }
    };

    loadAllSpaces();
  }, []);

  const handleSpaceSwitch = async (spaceId: string) => {
    if (isDesktopMode && typeof window !== 'undefined' && window.eidos) {
      try {
        setIsSwitching(true);
        const result = await window.eidos.invoke('switch-space', spaceId);
        if (result.success) {
          // Workspace switched successfully, Electron will automatically reload to new subdomain
        } else {
          console.error('Failed to switch space:', result.error);
        }
      } catch (error) {
        console.error('Error switching space:', error);
      } finally {
        setIsSwitching(false);
      }
    } else {
      // Use route navigation in web mode
      navigate(`/`);
    }
  };

  const handleCreateSpace = async () => {
    const spaceName = prompt('Enter space name:');
    if (!spaceName) return;

    try {
      if (isDesktopMode && typeof window !== 'undefined' && window.eidos) {
        const result = await window.eidos.invoke('register-space', spaceName, spaceName);
        if (result.success) {
          await updateSpaceList();
          await handleSpaceSwitch(spaceName);
        } else {
          alert(`Failed to create space: ${result.error}`);
        }
      } else {
        // Use existing method in web mode
        // Call existing createSpace function
        console.log('Create space in web mode:', spaceName);
      }
    } catch (error) {
      console.error('Error creating space:', error);
      alert('Failed to create space');
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="h-8 w-8 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
      </div>
    );
  }

  const displaySpaces = isDesktopMode ? allSpaces : spaceList.map(id => ({ id, name: id }));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={`flex items-center space-x-2 ${className}`}
          disabled={isSwitching}
        >
          <FolderIcon className="h-4 w-4" />
          <span className="truncate max-w-32">
            {currentSpace?.name || 'Select Space'}
          </span>
          <ChevronDownIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {displaySpaces.map((space) => (
          <DropdownMenuItem
            key={space.id}
            onClick={() => handleSpaceSwitch(space.id)}
            className="flex items-center space-x-2"
          >
            <FolderIcon className="h-4 w-4" />
            <span className="truncate">{space.name}</span>
            {currentSpace?.id === space.id && (
              <span className="ml-auto text-xs text-gray-500">Current</span>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCreateSpace} className="flex items-center space-x-2">
          <PlusIcon className="h-4 w-4" />
          <span>Create New Space</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
