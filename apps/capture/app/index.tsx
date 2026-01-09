import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Text,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CaptureItem } from '../components/CaptureItem';
import { CaptureInput } from '../components/CaptureInput';
import { database } from '../db/database';
import { fileManager } from '../storage/file-manager';
import { Capture } from '../db/types';

export default function HomeScreen() {
  const router = useRouter();
  const flatListRef = React.useRef<FlatList>(null);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);

  const loadCaptures = useCallback(async () => {
    try {
      const data = await database.getCaptures(100, 0);
      setCaptures(data);
    } catch (error) {
      console.error('Failed to load captures:', error);
      Alert.alert('Error', 'Failed to load captures');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Wait for database initialization from _layout.tsx before loading data
    const initializeApp = async () => {
      try {
        // Wait for _layout.tsx to complete database initialization
        await database.waitForInitialization();
        await loadCaptures();
      } catch (error) {
        console.error('Failed to load captures:', error);
        Alert.alert('Error', 'Failed to load captures');
      }
    };

    initializeApp();
  }, [loadCaptures]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadCaptures();
    setRefreshing(false);
  };

  const handleSendText = async (message: string) => {
    if (!message.trim() || sending) return;

    setSending(true);
    try {
      await database.createCapture(message.trim(), 'text');
      await loadCaptures();
      // 滚动到底部显示新消息
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Failed to send message:', error);
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleAttachImage = async () => {
    try {
      const result = await fileManager.pickImage();
      if (result) {
        await database.createCapture('', result.type, result.metadata);
        await loadCaptures();
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    } catch (error) {
      console.error('Failed to attach image:', error);
      Alert.alert('Error', 'Failed to attach image. Please check permissions.');
    }
  };

  const handleAttachFile = async () => {
    try {
      const result = await fileManager.pickDocument();
      if (result) {
        await database.createCapture('', result.type, result.metadata);
        await loadCaptures();
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    } catch (error) {
      console.error('Failed to attach file:', error);
      Alert.alert('Error', 'Failed to attach file');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const result = await fileManager.takePhoto();
      if (result) {
        await database.createCapture('', result.type, result.metadata);
        await loadCaptures();
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    } catch (error) {
      console.error('Failed to take photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please check permissions.');
    }
  };

  const handleCapturePress = (capture: Capture) => {
    // Future: Open full view or edit
    console.log('Capture pressed:', capture.id);
  };

  const handleCaptureLongPress = (capture: Capture) => {
    Alert.alert('Delete Capture?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            // Delete associated file if exists
            if (capture.metadata?.filePath) {
              await fileManager.deleteFile(capture.metadata.filePath);
            }
            await database.deleteCapture(capture.id);
            await loadCaptures();
          } catch (error) {
            console.error('Failed to delete capture:', error);
            Alert.alert('Error', 'Failed to delete capture');
          }
        },
      },
    ]);
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>No captures yet</Text>
      <Text style={styles.emptyText}>
        Start capturing your thoughts, ideas, and moments
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Captures</Text>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push('/settings')}
        >
          <Ionicons name="settings-outline" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={captures}
          renderItem={({ item }) => (
            <CaptureItem
              capture={item}
              onPress={handleCapturePress}
              onLongPress={handleCaptureLongPress}
            />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            captures.length === 0 && styles.listContentEmpty,
          ]}
          ListEmptyComponent={!loading ? renderEmptyState : null}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (captures.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }}
        />

        <CaptureInput
          onSend={handleSendText}
          onAttachImage={handleAttachImage}
          onAttachFile={handleAttachFile}
          onTakePhoto={handleTakePhoto}
          disabled={sending}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
  },
  settingsButton: {
    padding: 4,
  },
  keyboardAvoid: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
