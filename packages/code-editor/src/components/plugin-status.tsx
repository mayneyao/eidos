import React, { useEffect, useState } from 'react'
import type { DynamicPluginManager } from '../plugins/dynamic-plugin-manager'

interface PluginInfo {
  name: string
  version: string
  enabled: boolean
}

interface PluginStatusProps {
  pluginManager?: DynamicPluginManager | null
}

export const PluginStatus: React.FC<PluginStatusProps> = ({ pluginManager }) => {
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [managerInitialized, setManagerInitialized] = useState(false)

  useEffect(() => {
    const updateStatus = () => {
      try {
        if (!pluginManager) {
          setManagerInitialized(false)
          setPlugins([])
          return
        }
        
        setManagerInitialized(pluginManager.isInitialized())
        
        const allPlugins = pluginManager.getAllPlugins()
        const pluginInfo = allPlugins.map(plugin => ({
          name: plugin.name || 'Unknown',
          version: plugin.version || '0.0.0',
          enabled: plugin.isEnabled()
        }))
        
        setPlugins(pluginInfo)
      } catch (error) {
        console.error('Failed to get plugin status:', error)
      }
    }

    // Update immediately
    updateStatus()

    // Update every 2 seconds
    const interval = setInterval(updateStatus, 2000)

    return () => clearInterval(interval)
  }, [pluginManager])

  return (
    <div className="fixed top-4 right-4 bg-gray-800 text-white p-3 rounded-lg shadow-lg text-sm max-w-xs z-50">
      <h3 className="font-bold mb-2">Plugin Status</h3>
      
      <div className="mb-2">
        <span className="text-gray-300">Manager: </span>
        <span className={managerInitialized ? 'text-green-400' : 'text-red-400'}>
          {managerInitialized ? 'Initialized' : 'Not Initialized'}
        </span>
      </div>

      {plugins.length > 0 ? (
        <div>
          <div className="text-gray-300 mb-1">Plugins:</div>
          {plugins.map((plugin, index) => (
            <div key={index} className="ml-2 mb-1">
              <div className="font-medium">{plugin.name}</div>
              <div className="text-xs text-gray-400">
                v{plugin.version} - 
                <span className={plugin.enabled ? 'text-green-400' : 'text-red-400'}>
                  {plugin.enabled ? ' Enabled' : ' Disabled'}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-gray-400">No plugins loaded</div>
      )}
    </div>
  )
}
