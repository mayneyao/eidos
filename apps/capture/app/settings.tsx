import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { database } from '../db/database';
import { fileManager } from '../storage/file-manager';
import { SyncConfig } from '../db/types';
import { useSync } from '../hooks/useSync';

export default function SettingsScreen() {
  const router = useRouter();
  const { status: syncStatus, config: savedConfig, updateConfig, performSync } = useSync();
  const [syncConfig, setSyncConfig] = useState<SyncConfig>({
    enabled: false,
    endpoint: 'https://s3.eidos.space',
    bucketName: 'eidos-sync',
    region: 'auto',
  });
  const [storageSize, setStorageSize] = useState<number>(0);
  const [captureCount, setCaptureCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (savedConfig) {
      setSyncConfig(savedConfig);
    }
  }, [savedConfig]);

  const loadSettings = async () => {
    try {
      // Load sync config
      const configStr = await database.getSetting('sync_config');
      if (configStr) {
        setSyncConfig(JSON.parse(configStr));
      }

      // Load storage stats
      const size = await fileManager.getCaptureDirectorySize();
      setStorageSize(size);

      const count = await database.getCaptureCount();
      setCaptureCount(count);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSyncConfig = async (config: SyncConfig) => {
    try {
      await updateConfig(config);
      setSyncConfig(config);
      Alert.alert('Success', 'Sync configuration saved. Sync will start automatically.');
    } catch (error) {
      console.error('Failed to save sync config:', error);
      Alert.alert('Error', 'Failed to save sync configuration');
    }
  };

  const handleManualSync = async () => {
    if (!syncConfig.enabled) {
      Alert.alert('Sync Disabled', 'Please enable and configure sync first');
      return;
    }

    setSyncing(true);
    try {
      const result = await performSync();
      if (result.error) {
        Alert.alert('Sync Failed', result.error);
      } else {
        Alert.alert(
          'Sync Complete',
          `Uploaded: ${result.fileStats?.uploaded || 0}, Downloaded: ${result.fileStats?.downloaded || 0}`
        );
      }
    } catch (error) {
      Alert.alert('Sync Failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setSyncing(false);
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear All Data?',
      'This will delete all captures and files. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              await database.clearAllCaptures();
              await fileManager.clearAllFiles();
              await loadSettings();
              Alert.alert('Success', 'All data cleared');
            } catch (error) {
              console.error('Failed to clear cache:', error);
              Alert.alert('Error', 'Failed to clear cache');
            }
          },
        },
      ]
    );
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content}>
        {/* Storage Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Storage</Text>
          
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Total Captures</Text>
            <Text style={styles.settingValue}>{captureCount}</Text>
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Storage Used</Text>
            <Text style={styles.settingValue}>{formatBytes(storageSize)}</Text>
          </View>

          <TouchableOpacity style={styles.dangerButton} onPress={handleClearCache}>
            <Ionicons name="trash-outline" size={20} color="#FF3B30" />
            <Text style={styles.dangerButtonText}>Clear All Data</Text>
          </TouchableOpacity>
        </View>

        {/* Sync Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sync</Text>
          <Text style={styles.sectionDescription}>
            Configure S3-compatible storage for syncing your captures across devices
          </Text>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Enable Sync</Text>
            <Switch
              value={syncConfig.enabled}
              onValueChange={(enabled) => setSyncConfig({ ...syncConfig, enabled })}
              trackColor={{ false: '#E5E5E5', true: '#34C759' }}
            />
          </View>

          {syncStatus.lastSync && (
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Last Sync</Text>
              <Text style={styles.settingValue}>
                {new Date(syncStatus.lastSync).toLocaleString()}
              </Text>
            </View>
          )}

          {syncStatus.inProgress && (
            <View style={styles.syncingIndicator}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.syncingText}>Syncing...</Text>
            </View>
          )}

          {syncStatus.enabled && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Sync Mode</Text>
              <Text style={styles.infoValue}>
                {syncStatus.syncMode === 'graft-vfs' ? '🚀 VFS (Fast)' : 
                 syncStatus.syncMode === 'file-level' ? '📁 File-level' : 
                 '❌ Disabled'}
              </Text>
            </View>
          )}

          {syncConfig.enabled && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>S3 Endpoint</Text>
                <TextInput
                  style={styles.input}
                  value={syncConfig.endpoint}
                  onChangeText={(endpoint) => setSyncConfig({ ...syncConfig, endpoint })}
                  placeholder="https://s3.eidos.space"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Bucket Name</Text>
                <TextInput
                  style={styles.input}
                  value={syncConfig.bucketName}
                  onChangeText={(bucketName) => setSyncConfig({ ...syncConfig, bucketName })}
                  placeholder="eidos-sync"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Access Key ID</Text>
                <TextInput
                  style={styles.input}
                  value={syncConfig.accessKeyId}
                  onChangeText={(accessKeyId) => setSyncConfig({ ...syncConfig, accessKeyId })}
                  placeholder="Your access key"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Secret Access Key</Text>
                <TextInput
                  style={styles.input}
                  value={syncConfig.secretAccessKey}
                  onChangeText={(secretAccessKey) =>
                    setSyncConfig({ ...syncConfig, secretAccessKey })
                  }
                  placeholder="Your secret key"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={() => saveSyncConfig(syncConfig)}
              >
                <Text style={styles.saveButtonText}>Save Configuration</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
                onPress={handleManualSync}
                disabled={syncing}
              >
                {syncing ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <>
                    <Ionicons name="sync" size={20} color="#007AFF" />
                    <Text style={styles.syncButtonText}>Sync Now</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Version</Text>
            <Text style={styles.settingValue}>1.0.0</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    padding: 4,
    width: 32,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  headerSpacer: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  settingLabel: {
    fontSize: 16,
    color: '#000',
  },
  settingValue: {
    fontSize: 16,
    color: '#666',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#000',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#FF3B30',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    gap: 8,
  },
  dangerButtonText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
  syncingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  syncingText: {
    fontSize: 14,
    color: '#007AFF',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E5EA',
  },
  infoLabel: {
    fontSize: 16,
    color: '#000',
  },
  infoValue: {
    fontSize: 16,
    color: '#8E8E93',
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  syncButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  syncButtonDisabled: {
    opacity: 0.5,
  },
});

